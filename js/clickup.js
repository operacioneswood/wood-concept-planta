// ─────────────────────────────────────────────────────────────
// js/clickup.js — ClickUp API integration for Planta
//
// Reads tasks from a List/Folder filtered to ACTIVE_STATUSES.
// Parses all custom date fields and the EBANISTA dropdown.
// Cache: 5 min TTL (matches auto-refresh interval).
//
// Depends on: config.js
// ─────────────────────────────────────────────────────────────

const PlantaAPI = {

  _CACHE_KEY:   'wp_tasks_cache',
  _CACHE_TTL:   5 * 60 * 1000,   // 5 min

  // ── Credential helpers ────────────────────────────────────
  getApiKey()   { return localStorage.getItem('wp_api_key')  || DEFAULT_API_KEY; },
  setApiKey(k)  { localStorage.setItem('wp_api_key', k.trim()); },
  getListId()   { return localStorage.getItem('wp_list_id')  || DEFAULT_LIST_ID; },
  setListId(id) { localStorage.setItem('wp_list_id', id.trim()); },

  // ── Cache ─────────────────────────────────────────────────
  _getCache() {
    try {
      const raw = localStorage.getItem(this._CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (!c || !c.timestamp || !Array.isArray(c.ops)) return null;
      // Re-hydrate Date objects (JSON.stringify kills them)
      c.ops = c.ops.map(op => this._rehydrateOp(op));
      return c;
    } catch { return null; }
  },

  _rehydrateOp(op) {
    const dateKeys = [
      'inicioCorte','finCorte','inicioChapilla','finChapilla',
      'inicioEnchapillado','finEnchapillado','inicioArmado','finArmado',
      'inicioPintura','finPintura','inicioReproceso','finReproceso',
    ];
    const out = { ...op };
    for (const k of dateKeys) {
      if (out[k] && typeof out[k] === 'string') out[k] = new Date(out[k]);
      else if (!out[k]) out[k] = null;
    }
    return out;
  },

  _setCache(data) {
    try {
      localStorage.setItem(this._CACHE_KEY, JSON.stringify({ timestamp: Date.now(), ...data }));
    } catch (e) {
      console.warn('[PlantaAPI] Cache write failed:', e.message);
      try { localStorage.removeItem(this._CACHE_KEY); } catch {}
    }
  },

  clearCache() { localStorage.removeItem(this._CACHE_KEY); },

  isCacheFresh() {
    const c = this._getCache();
    return c ? (Date.now() - c.timestamp < this._CACHE_TTL) : false;
  },

  // ── Low-level HTTP ────────────────────────────────────────
  async _call(path, params = {}) {
    const apiKey = this.getApiKey();
    const url = new URL(`https://api.clickup.com/api/v2/${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    if (!res.ok) throw new Error(`ClickUp ${res.status} — ${path}`);
    return res.json();
  },

  // ── Resolve entered ID to a list of list-ids ─────────────
  async _resolveToListIds(id) {
    const [listRes, folderRes, spaceFolderRes, spaceListRes] = await Promise.allSettled([
      this._call(`list/${id}`),
      this._call(`folder/${id}/list`,  { archived: 'false' }),
      this._call(`space/${id}/folder`, { archived: 'false' }),
      this._call(`space/${id}/list`,   { archived: 'false' }),
    ]);

    // Space?
    const spaceFolders = spaceFolderRes.status === 'fulfilled' ? (spaceFolderRes.value.folders || []) : [];
    const spaceRoots   = spaceListRes.status   === 'fulfilled' ? (spaceListRes.value.lists     || []) : [];
    if (spaceFolders.length || spaceRoots.length) {
      const nested = (await Promise.all(
        spaceFolders.map(f => this._call(`folder/${f.id}/list`, { archived: 'false' })
          .then(d => (d.lists || []).map(l => l.id)).catch(() => []))
      )).flat();
      return { listIds: [...new Set([...nested, ...spaceRoots.map(l => l.id)])] };
    }

    // Folder?
    const folderLists = folderRes.status === 'fulfilled' ? (folderRes.value.lists || []) : [];
    if (folderLists.length) return { listIds: folderLists.map(l => l.id) };

    // List fallback
    return { listIds: [id] };
  },

  // ── Fetch all pages from a single list ───────────────────
  async _fetchAllPages(listId, onProgress) {
    const tasks = [];
    for (let page = 0; page < 20; page++) {
      const data = await this._call(`list/${listId}/task`, {
        include_closed: 'true',
        subtasks:       'true',
        page:           String(page),
      });
      const batch = data.tasks || [];
      tasks.push(...batch);
      if (onProgress) onProgress(tasks.length);
      if (batch.length < 100 || data.last_page) break;
    }
    return tasks;
  },

  // ── Detect custom field IDs from raw tasks ────────────────
  _detectFields(rawTasks) {
    const fieldMap     = {};   // normalizedName → { id, type, typeConfig }
    const ebanistasSet = new Set();
    const pintoresSet  = new Set();

    for (const t of rawTasks) {
      for (const cf of (t.custom_fields || [])) {
        const norm = normStr(cf.name);
        if (!fieldMap[norm]) {
          fieldMap[norm] = { id: cf.id, name: cf.name, type: cf.type, typeConfig: cf.type_config };
        }
        // Collect ebanista dropdown options
        if (norm.includes('ebanista') && cf.type === 'drop_down') {
          for (const opt of (cf.type_config?.options || [])) {
            if (opt.name) ebanistasSet.add(opt.name);
          }
        }
        // Collect pintor dropdown options
        if (norm.includes('pintor') && cf.type === 'drop_down') {
          for (const opt of (cf.type_config?.options || [])) {
            if (opt.name) pintoresSet.add(opt.name);
          }
        }
      }
    }

    const find = (...patterns) => {
      for (const [key, val] of Object.entries(fieldMap)) {
        if (patterns.some(p => key.includes(p))) return val.id;
      }
      return null;
    };

    return {
      fieldIds: {
        inicioCorte:        find('inicio corte'),
        finCorte:           find('fin corte'),
        inicioChapilla:     find('inicio chapilla'),
        finChapilla:        find('fin chapilla'),
        inicioEnchapillado: find('inicio enchapillado'),
        finEnchapillado:    find('fin enchapillado'),
        inicioArmado:       find('inicio armado'),
        finArmado:          find('fin armado'),
        inicioPintura:      find('inicio pintura'),
        finPintura:         find('fin pintura'),
        inicioReproceso:    find('inicio reproceso'),
        finReproceso:       find('fin reproceso'),
        causaReproceso:     find('causa reproceso'),
        noOp:               find('no. op', 'no op', 'nro. op', 'nro op', 'numero op', 'num op'),
        nivel:              find('nivel'),
        ebanista:           find('ebanista'),
        cliente:            find('cliente'),
      },
      ebanistas: [...ebanistasSet].sort(),
      pintores:  [...pintoresSet].sort(),
    };
  },

  // ── Parse a raw task into an OP object ───────────────────
  _parseTask(raw, fieldIds) {
    const getField = id => {
      if (!id) return null;
      const cf = (raw.custom_fields || []).find(f => f.id === id);
      if (!cf) return null;
      return cf.value ?? null;
    };

    const getDate = id => tsToDate(getField(id));

    const nivelRaw  = getField(fieldIds.nivel);
    const nivel     = nivelRaw !== null && nivelRaw !== '' ? (parseFloat(nivelRaw) || null) : null;

    const ebanVal   = getField(fieldIds.ebanista);
    const ebanista  = typeof ebanVal === 'object' && ebanVal?.name ? ebanVal.name :
                      typeof ebanVal === 'string' ? ebanVal : null;

    const clientVal = getField(fieldIds.cliente);
    const client    = typeof clientVal === 'string' ? clientVal :
                      (clientVal?.name || '');

    const causaRaw  = getField(fieldIds.causaReproceso);
    const causa     = typeof causaRaw === 'string' ? causaRaw :
                      (causaRaw?.name || null);

    const noOpRaw   = getField(fieldIds.noOp);
    const noOp      = noOpRaw !== null && noOpRaw !== undefined ? String(noOpRaw) : '';

    return {
      id:                  raw.id,
      name:                raw.name || '',
      noOp,
      parent:              raw.parent || null,
      project:             raw.folder?.name || raw.list?.name || '',
      client,
      nivel,
      status:              normStr(raw.status?.status || ''),
      statusRaw:           raw.status?.status || '',
      ebanista,
      // Stage dates
      inicioCorte:         getDate(fieldIds.inicioCorte),
      finCorte:            getDate(fieldIds.finCorte),
      inicioChapilla:      getDate(fieldIds.inicioChapilla),
      finChapilla:         getDate(fieldIds.finChapilla),
      inicioEnchapillado:  getDate(fieldIds.inicioEnchapillado),
      finEnchapillado:     getDate(fieldIds.finEnchapillado),
      inicioArmado:        getDate(fieldIds.inicioArmado),
      finArmado:           getDate(fieldIds.finArmado),
      inicioPintura:       getDate(fieldIds.inicioPintura),
      finPintura:          getDate(fieldIds.finPintura),
      inicioReproceso:     getDate(fieldIds.inicioReproceso),
      finReproceso:        getDate(fieldIds.finReproceso),
      causaReproceso:      causa,
    };
  },

  // ── Set a custom date field value on a task ──────────────
  async setField(taskId, fieldId, valueMs) {
    const apiKey = this.getApiKey();
    const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`, {
      method:  'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ value: valueMs }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => String(res.status));
      throw new Error(`ClickUp field ${res.status}: ${msg}`);
    }
    return res.json();
  },

  // ── Mark OP complete in ClickUp ──────────────────────────
  async markComplete(opId, statusName = 'BODEGA') {
    const apiKey = this.getApiKey();
    const res = await fetch(`https://api.clickup.com/api/v2/task/${opId}`, {
      method:  'PUT',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: statusName }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.status);
      throw new Error(`ClickUp PUT ${res.status}: ${msg}`);
    }
    return res.json();
  },

  // ── Main entry point ─────────────────────────────────────
  async fetchOPs({ force = false, onProgress } = {}) {
    const prog = msg => { if (onProgress) onProgress(msg); };

    // Cache hit
    if (!force) {
      const cached = this._getCache();
      if (cached && (Date.now() - cached.timestamp < this._CACHE_TTL)) {
        prog('⚡ Datos en caché');
        return cached;
      }
    }

    prog('Conectando con ClickUp...');
    const listId = this.getListId();

    // Resolve ID to list(s)
    const { listIds } = await this._resolveToListIds(listId);

    // Fetch all tasks from all lists
    let total = 0;
    const batches = await Promise.all(
      listIds.map(lid => this._fetchAllPages(lid, n => {
        total = n;
        prog(`Cargando tareas... (${total})`);
      }))
    );

    const seen = new Set();
    const rawTasks = batches.flat().filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    prog(`Procesando ${rawTasks.length} tareas...`);

    // Detect fields
    const { fieldIds, ebanistas, pintores } = this._detectFields(rawTasks);

    // Build a full node map for chain traversal: id → { name, parent }
    const nodeMap = {};
    for (const t of rawTasks) {
      nodeMap[t.id] = { name: t.name || '', parent: t.parent || null };
    }

    // Walk up the parent chain from a task until we reach a root task (parent === null).
    // Returns the root task's name, or null if the chain breaks (parent not in nodeMap).
    const findRootProject = id => {
      const seen = new Set();
      let cur = nodeMap[id];
      while (cur) {
        if (!cur.parent) return cur.name;   // this node is the root
        if (seen.has(cur.parent)) return null; // cycle guard
        seen.add(cur.parent);
        cur = nodeMap[cur.parent];
      }
      return null; // parent not found in fetched tasks
    };

    // Only subtasks (parent !== null) with an active status are OPs.
    // Traverse the full chain to find the real root project name.
    // Skip any OP whose root project cannot be identified.
    const ops = rawTasks
      .filter(t => t.parent && ACTIVE_STATUSES.has(normStr(t.status?.status || '')))
      .map(t => {
        const rootProject = findRootProject(t.id);
        if (!rootProject) return null;        // no identifiable root → discard
        const op = this._parseTask(t, fieldIds);
        op.project  = rootProject;            // always the root task name
        op.parentId = t.parent;
        return op;
      })
      .filter(Boolean);

    prog(`${ops.length} OPs activos encontrados.`);

    const result = { ops, ebanistas, pintores, fieldIds, lastSync: Date.now() };
    this._setCache(result);
    return result;
  },
};
