// ─────────────────────────────────────────────────────────────
// js/app.js — Application bootstrap, routing, auto-refresh
// ─────────────────────────────────────────────────────────────

const App = {
  _data:             null,   // ClickUp data: { ops, ebanistas, fieldIds, lastSync }
  _dbData:           null,   // Supabase data: { asignaciones, prioridades, produccion, personas }
  _refreshTimer:     null,
  _REFRESH_INTERVAL: 5 * 60 * 1000,

  // ── DB data helpers (used by all tabs) ───────────────────
  buildAssignments(dbData) {
    const map = {};
    for (const row of (dbData?.asignaciones || [])) {
      if (!map[row.op_id]) map[row.op_id] = [];
      const stage = STAGE_ALIASES[row.etapa] || row.etapa;
      map[row.op_id].push({ person: row.persona, stage, estimatedDate: row.fecha_asignacion, comentario: row.comentario || '', subprocesos: row.subprocesos || '' });
    }
    return map;
  },

  buildPriorities(dbData) {
    return (dbData?.prioridades || [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map(r => r.proyecto_id);
  },

  buildPlanosMap(dbData) {
    const map = {};
    for (const p of (dbData?.planos || [])) map[p.op_id] = p.persona;
    return map;
  },

  buildPersonasMap(dbData) {
    const map = {};
    for (const p of (dbData?.personas || [])) {
      map[p.nombre] = p.tipo;
    }
    return map;
  },

  // op_id → { partnerId, vinculoId } for OPs linked as one (shared plano)
  buildLinkMap(dbData) {
    const map = {};
    for (const row of (dbData?.vinculos || [])) {
      map[row.op_id_1] = { partnerId: row.op_id_2, vinculoId: row.id };
      map[row.op_id_2] = { partnerId: row.op_id_1, vinculoId: row.id };
    }
    return map;
  },

  // Collapses linked OP pairs into a single display unit, preserving input order.
  // Returns [{ ops: [op] }] for singles, or [{ ops: [opA, opB], vinculoId }] for a linked pair.
  groupLinkedOps(ops, dbData) {
    const linkMap = this.buildLinkMap(dbData);
    const byId = new Map(ops.map(o => [o.id, o]));
    const seen = new Set();
    const groups = [];
    for (const op of ops) {
      if (seen.has(op.id)) continue;
      const link    = linkMap[op.id];
      const partner = link && byId.get(link.partnerId);
      if (partner && !seen.has(partner.id)) {
        groups.push({ ops: [op, partner], vinculoId: link.vinculoId });
        seen.add(op.id); seen.add(partner.id);
      } else {
        groups.push({ ops: [op] });
        seen.add(op.id);
      }
    }
    return groups;
  },

  // ── Init ─────────────────────────────────────────────────
  async init() {
    DB.init();
    this._setupNav();
    this._setupSettings();
    this._setupCompleteModal();
    this._setupTiemposModal();

    // Load Supabase data in parallel with ClickUp cache render
    this._dbData = { asignaciones: [], prioridades: [], produccion: [], personas: [], partes: [], vinculos: [] };
    const [cached] = await Promise.allSettled([
      this._loadDbData(),
    ]);

    // Instant render from ClickUp cache
    const clickupCache = PlantaAPI._getCache();
    if (clickupCache) {
      this._data = clickupCache;
      this._renderAll();
      this._setStatus('⚡ Desde caché', 'ok');
    } else {
      this._setStatus('Conectando...', 'loading');
    }

    // Fresh fetch from ClickUp
    await this._sync({ silent: !!clickupCache });

    // Auto-refresh
    this._refreshTimer = setInterval(() => this._sync({ silent: true }), this._REFRESH_INTERVAL);
  },

  async _loadDbData() {
    try {
      const [asignaciones, prioridades, produccion, personas, historial, tiempos, planos, partes, vinculos] = await Promise.all([
        DB.getAsignaciones(),
        DB.getPrioridades(),
        DB.getProduccion(),
        DB.getPersonas(),
        DB.getHistorial(),
        DB.getAllTiempos(),
        DB.getPlanos(),
        DB.getPartes(),
        DB.getVinculos().catch(e => { console.warn('[App] op_vinculos table missing?', e.message); return []; }),
      ]);
      this._dbData = {
        asignaciones: asignaciones || [],
        prioridades:  prioridades  || [],
        produccion:   produccion   || [],
        personas:     personas     || [],
        historial:    historial    || [],
        tiempos:      tiempos      || [],
        planos:       planos       || [],
        partes:       partes       || [],
        vinculos:     vinculos     || [],
      };
    } catch (e) {
      console.error('[App] DB load failed:', e.message);
    }
  },

  // ── Sync ─────────────────────────────────────────────────
  async _sync({ force = false, silent = false } = {}) {
    if (!silent) this._setStatus('Sincronizando...', 'loading');
    try {
      this._data = await PlantaAPI.fetchOPs({
        force,
        onProgress: msg => { if (!silent) this._setStatus(msg, 'loading'); },
      });
      // Refresh DB data on each sync
      await this._loadDbData();
      // Seed personas from ClickUp ebanistas + pintores dropdowns
      await this._seedPersonas(this._data.ebanistas || [], this._data.pintores || []);
      // Hide people removed from ClickUp's dropdown (manually-added people are exempt)
      await this._pruneStalePersonas(this._data.ebanistas || [], this._data.pintores || []);
      // Auto-historial cross-reference
      await Sync.runAutoHistorial(this._data.ops || [], this._dbData.asignaciones);
      this._renderAll();
      this._setStatus(this._syncLabel(), 'ok');
    } catch (e) {
      console.error('[App] Sync error:', e);
      this._setStatus('Error: ' + e.message, 'error');
    }
  },

  // Seed personas table with names from ClickUp EBANISTA dropdown (non-destructive)
  async _seedPersonas(ebanistas, pintores = []) {
    const existingMap = this.buildPersonasMap(this._dbData);
    let changed = false;

    for (const name of ebanistas) {
      if (existingMap[name]) continue;
      const tipo = CONTRATISTAS_CONOCIDOS.has(normStr(name)) ? 'contratista' : 'ebanista';
      try { await DB.upsertPersona(name, tipo); changed = true; } catch (e) { console.warn('[App] seed:', name, e.message); }
    }
    for (const name of pintores) {
      if (existingMap[name]) continue;
      try { await DB.upsertPersona(name, 'pintor'); changed = true; } catch (e) { console.warn('[App] seed:', name, e.message); }
    }

    if (changed) {
      this._dbData.personas = await DB.getPersonas().catch(() => this._dbData.personas);
    }
  },

  // Deactivate ClickUp-sourced personas whose name is no longer a live
  // dropdown option — people added manually from the app are left alone.
  async _pruneStalePersonas(ebanistas, pintores = []) {
    const current = new Set([...ebanistas, ...pintores].map(n => normStr(n)));
    const stale = (this._dbData.personas || []).filter(p =>
      p.activo && (p.origen || 'clickup') !== 'manual' && !current.has(normStr(p.nombre))
    );
    if (!stale.length) return;

    for (const p of stale) {
      try { await DB.setPersonaActivo(p.nombre, false); } catch (e) { console.warn('[App] prune:', p.nombre, e.message); }
    }
    this._dbData.personas = this._dbData.personas.filter(p => !stale.includes(p));
  },

  _syncLabel() {
    const d = new Date(this._data?.lastSync || Date.now());
    return `↻ ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  },

  _setStatus(msg, type) {
    const s = el('sync-status');
    if (!s) return;
    s.textContent = msg;
    s.className   = `sync-status sync-${type}`;
  },

  // ── Render all tabs ───────────────────────────────────────
  _renderAll() {
    if (!this._data) return;
    // Combine ClickUp people + anyone already in Supabase personas
    const supabasePeople = (this._dbData.personas || []).filter(p => p.activo).map(p => p.nombre);
    const allPeople = [...new Set([
      ...(this._data.ebanistas || []),
      ...(this._data.pintores  || []),
      ...supabasePeople,
    ])].filter(n => !isExcluded(n));
    const payload = { ...this._data, ebanistas: allPeople, dbData: this._dbData };
    Panel.render(payload);
    Tablero.render(payload);
    Proyectos.render(payload);
    Asignacion.render(payload);
    Cronograma.render(payload);
    Rendimiento.render(payload);
    this._renderRolesList();
  },

  renderPanel() {
    if (this._data) Panel.render({ ...this._data, dbData: this._dbData });
  },

  renderAsignacion() {
    if (!this._data) return;
    const supabasePeople = (this._dbData.personas || []).filter(p => p.activo).map(p => p.nombre);
    const allPeople = [...new Set([...(this._data.ebanistas || []), ...(this._data.pintores || []), ...supabasePeople])].filter(n => !isExcluded(n));
    Asignacion.render({ ...this._data, ebanistas: allPeople, dbData: this._dbData });
  },

  rerender() {
    this._renderAll();
  },

  // ── Navigation ────────────────────────────────────────────
  _setupNav() {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-screen').forEach(s => s.classList.remove('tab-active'));
        el('tab-' + btn.dataset.tab)?.classList.add('tab-active');
      });
    });

    el('btn-refresh')?.addEventListener('click', () => this._sync({ force: true }));
    el('btn-settings')?.addEventListener('click', () => this._openSettings());

    // ── Tablet / Desktop mode toggle ─────────────────────────
    const tabBtn = el('btn-tablet-toggle');
    if (tabBtn) {
      const apply = isTablet => {
        document.body.classList.toggle('tablet', isTablet);
        tabBtn.textContent = isTablet ? '💻' : '📱';
        tabBtn.title       = isTablet ? 'Cambiar a modo computadora' : 'Cambiar a modo tablet';
      };
      const saved = localStorage.getItem('wp_tablet_mode');
      const autoTablet = saved === null && window.innerWidth <= 1024;
      apply(saved === '1' || autoTablet);
      tabBtn.addEventListener('click', () => {
        const nowTablet = !document.body.classList.contains('tablet');
        localStorage.setItem('wp_tablet_mode', nowTablet ? '1' : '0');
        apply(nowTablet);
      });
    }
  },

  // ── Settings modal ────────────────────────────────────────
  _setupSettings() {
    el('btn-settings-close')?.addEventListener('click', () => this._closeSettings());
    el('settings-overlay')?.addEventListener('click', e => {
      if (e.target === el('settings-overlay')) this._closeSettings();
    });
    el('cfg-sync-btn')?.addEventListener('click', async () => {
      const key = el('cfg-api-key')?.value.trim();
      const lid = el('cfg-list-id')?.value.trim();
      if (key) PlantaAPI.setApiKey(key);
      if (lid) PlantaAPI.setListId(lid);
      PlantaAPI.clearCache();
      const statusEl = el('cfg-sync-status');
      statusEl.textContent = 'Sincronizando...';
      statusEl.className   = 'cfg-sync-status';
      try {
        await this._sync({ force: true });
        statusEl.textContent = '✓ ' + this._syncLabel();
        statusEl.className   = 'cfg-sync-status cfg-sync-ok';
        this._renderRolesList();
      } catch (e) {
        statusEl.textContent = '✗ ' + e.message;
        statusEl.className   = 'cfg-sync-status cfg-sync-error';
      }
    });
  },

  _openSettings() {
    el('cfg-api-key').value = PlantaAPI.getApiKey();
    el('cfg-list-id').value = PlantaAPI.getListId();
    this._renderRolesList();
    el('settings-overlay').style.display = 'flex';
  },

  _closeSettings() { el('settings-overlay').style.display = 'none'; },

  _renderRolesList() {
    const container = el('cfg-roles-list');
    if (!container) return;
    const clickupPeople = [...new Set([...(this._data?.ebanistas || []), ...(this._data?.pintores || [])])];
    const manualPeople  = (this._dbData.personas || [])
      .filter(p => p.activo && (p.origen || 'clickup') === 'manual')
      .map(p => p.nombre);
    const people = [...new Set([...clickupPeople, ...manualPeople])].sort((a, b) => a.localeCompare(b));
    const personasMap = this.buildPersonasMap(this._dbData);
    const origenMap = {};
    for (const p of (this._dbData.personas || [])) origenMap[p.nombre] = p.origen || 'clickup';

    const addFormHtml = `
      <div class="role-add-row">
        <input type="text" id="role-add-name" class="role-add-input" placeholder="Nombre de la persona...">
        <select id="role-add-tipo" class="role-add-select">
          <option value="ebanista">Ebanista</option>
          <option value="pintor">Pintor</option>
          <option value="contratista">Contratista</option>
        </select>
        <button id="role-add-btn" class="role-add-btn">+ Agregar</button>
      </div>
      <div class="cfg-hint">Agregar aquí no crea la opción en ClickUp — solo permite asignarle trabajo dentro de la web app.</div>
    `;

    if (!people.length) {
      container.innerHTML = addFormHtml + '<div class="cfg-hint">Sincroniza con ClickUp para ver el personal del dropdown EBANISTA.</div>';
      this._bindRoleAddForm();
      return;
    }

    container.innerHTML = addFormHtml + people.map(name => {
      const tipo     = personasMap[name] || (CONTRATISTAS_CONOCIDOS.has(normStr(name)) ? 'contratista' : 'ebanista');
      const isManual = origenMap[name] === 'manual';
      return `
        <div class="role-row">
          <span class="role-name">${esc(name)}${isManual ? ' <span class="role-manual-tag">Manual</span>' : ''}</span>
          <div class="role-radios">
            <label class="role-label">
              <input type="radio" name="role-${esc(name.replace(/\s/g,'_'))}" value="ebanista"
                ${tipo === 'ebanista' ? 'checked' : ''}>
              Ebanista
            </label>
            <label class="role-label">
              <input type="radio" name="role-${esc(name.replace(/\s/g,'_'))}" value="pintor"
                ${tipo === 'pintor' ? 'checked' : ''}>
              Pintor
            </label>
            <label class="role-label">
              <input type="radio" name="role-${esc(name.replace(/\s/g,'_'))}" value="contratista"
                ${tipo === 'contratista' ? 'checked' : ''}>
              Contratista
            </label>
          </div>
          <button class="role-del-btn" data-name="${esc(name)}" title="Eliminar de la web app">🗑</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', async () => {
        const safeName = radio.name.replace(/^role-/, '');
        const name     = people.find(p => p.replace(/\s/g,'_') === safeName) || safeName.replace(/_/g,' ');
        // Optimistic update local cache
        const idx = this._dbData.personas.findIndex(p => p.nombre === name);
        if (idx !== -1) this._dbData.personas[idx].tipo = radio.value;
        else this._dbData.personas.push({ nombre: name, tipo: radio.value, activo: true });
        this._renderAll();
        // Persist
        try {
          await DB.upsertPersona(name, radio.value);
        } catch (e) {
          console.error('[App] role save failed:', e.message);
        }
      });
    });

    container.querySelectorAll('.role-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const stillInClickup = clickupPeople.includes(name);
        const warning = stillInClickup
          ? `¿Eliminar a ${name} de la web app?\n\nSigue existiendo como opción en el dropdown EBANISTA de ClickUp, así que volverá a aparecer aquí en la próxima sincronización a menos que también lo borres en ClickUp.`
          : `¿Eliminar a ${name} de la web app?`;
        if (!confirm(warning)) return;

        this._dbData.personas = this._dbData.personas.filter(p => p.nombre !== name);
        this._renderAll();
        this._renderRolesList();
        try {
          await DB.setPersonaActivo(name, false);
        } catch (e) {
          alert('Error al eliminar: ' + e.message);
        }
      });
    });

    this._bindRoleAddForm();
  },

  _bindRoleAddForm() {
    el('role-add-btn')?.addEventListener('click', async () => {
      const nameInp = el('role-add-name');
      const tipoSel = el('role-add-tipo');
      const name = nameInp.value.trim();
      const tipo = tipoSel.value;
      if (!name) { nameInp.focus(); return; }

      this._dbData.personas = (this._dbData.personas || []).filter(p => p.nombre !== name);
      this._dbData.personas.push({ nombre: name, tipo, activo: true, origen: 'manual' });
      this._renderAll();
      this._renderRolesList();
      try {
        await DB.addPersonaManual(name, tipo);
      } catch (e) {
        alert('Error al agregar: ' + e.message);
      }
    });
  },

  // ── Complete OP modal ─────────────────────────────────────
  _pendingCompleteOp: null,

  _setupCompleteModal() {
    el('btn-complete-close')?.addEventListener('click', () => this._closeCompleteModal());
    el('btn-complete-cancel')?.addEventListener('click', () => this._closeCompleteModal());
    el('complete-overlay')?.addEventListener('click', e => {
      if (e.target === el('complete-overlay')) this._closeCompleteModal();
    });
    el('btn-complete-confirm')?.addEventListener('click', () => this._confirmComplete());
  },

  openCompleteModal(opIds, opName, ebanistas) {
    const ids = Array.isArray(opIds) ? opIds : [opIds];
    this._pendingCompleteOp = { opIds: ids, opName };

    el('complete-op-name').textContent = opName;

    const people = ebanistas || this._data?.ebanistas || [];
    const sel    = el('complete-person');
    sel.innerHTML = '<option value="">— Persona —</option>' +
      people.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

    // Pre-select assigned person (first assigned, on the first OP)
    const assignments = this.buildAssignments(this._dbData);
    const a = (assignments[ids[0]] || [])[0];
    if (a?.person) sel.value = a.person;

    el('complete-date').value         = todayIso();
    el('complete-reproceso').checked  = false;
    el('complete-overlay').style.display = 'flex';
  },

  _closeCompleteModal() {
    el('complete-overlay').style.display = 'none';
    this._pendingCompleteOp = null;
  },

  async _confirmComplete() {
    const { opIds, opName } = this._pendingCompleteOp || {};
    if (!opIds?.length) return;

    const person      = el('complete-person').value;
    const dateVal     = el('complete-date').value;
    const isReproceso = el('complete-reproceso').checked;

    if (!person)  { alert('Selecciona una persona'); return; }
    if (!dateVal) { alert('Ingresa una fecha'); return; }

    const completedAt = isoToDate(dateVal);
    const assignments = this.buildAssignments(this._dbData);

    for (const opId of opIds) {
      const op          = this._data?.ops.find(o => o.id === opId);
      const firstDate   = op ? firstActivityDate(op) : null;
      const daysInPlant = (firstDate && completedAt) ? daysBetween(firstDate, completedAt) : null;
      const stage       = (assignments[opId] || [])[0]?.stage || null;

      // Optimistic update: add to local produccion
      this._dbData.produccion.unshift({
        op_id: opId, nombre_op: opName, proyecto: op?.project || '',
        persona: person, fecha_salida: dateVal,
        es_reproceso: isReproceso, dias_en_planta: daysInPlant,
      });

      // Remove from local asignaciones / prioridades
      this._dbData.asignaciones = this._dbData.asignaciones.filter(a => a.op_id !== opId);
      this._dbData.prioridades  = this._dbData.prioridades.filter(p => p.proyecto_id !== opId);
    }

    this._closeCompleteModal();
    this._renderAll();

    // Persist to Supabase
    try {
      await Promise.all(opIds.map(async opId => {
        const op = this._data?.ops.find(o => o.id === opId);
        const firstDate   = op ? firstActivityDate(op) : null;
        const daysInPlant = (firstDate && completedAt) ? daysBetween(firstDate, completedAt) : null;
        await DB.addProduccion({
          op_id:         opId,
          nombre_op:     opName,
          proyecto:      op?.project || '',
          persona:       person,
          fecha_salida:  dateVal,
          es_reproceso:  isReproceso,
          dias_en_planta: daysInPlant,
        });
        await DB.removeAsignacion(opId);
      }));
    } catch (e) {
      console.error('[App] complete save failed:', e.message);
    }

    // Mark complete in ClickUp (status = BODEGA)
    try {
      await Promise.all(opIds.map(opId => PlantaAPI.markComplete(opId, 'BODEGA')));
      // Force ClickUp refresh so the OP disappears from active list
      PlantaAPI.clearCache();
      await this._sync({ force: true, silent: true });
    } catch (e) {
      console.warn('[App] ClickUp status update failed:', e.message);
      // Non-fatal — OP will drop from list on next natural sync
    }
  },

  _setupTiemposModal() {
    el('btn-tiempos-close')?.addEventListener('click',  () => Tiempos.close());
    el('btn-tiempos-cancel')?.addEventListener('click', () => Tiempos.close());
    el('btn-tiempos-save')?.addEventListener('click',   () => Tiempos.save());
    el('tiempos-overlay')?.addEventListener('click', e => {
      if (e.target === el('tiempos-overlay')) Tiempos.close();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
