// ─────────────────────────────────────────────────────────────
// js/cronograma.js — Cronograma tab: Fábrica + Pintura schedules
// ─────────────────────────────────────────────────────────────

const Cronograma = {
  _ops:      [],
  _dbData:   null,
  _fieldIds: {},
  _sub:      'fabrica',
  _fabView:  'proyecto',   // 'proyecto' | 'urgencia'

  render({ ops, fieldIds, dbData }) {
    this._ops      = ops      || [];
    this._fieldIds = fieldIds || {};
    this._dbData   = dbData;
    this._draw();
  },

  _draw() {
    const wrap = el('cronograma-container');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="cron-subtabs">
        <button class="cron-subtab ${this._sub === 'fabrica' ? 'active' : ''}" data-sub="fabrica">🏭 Fábrica</button>
        <button class="cron-subtab ${this._sub === 'pintura' ? 'active' : ''}" data-sub="pintura">🎨 Pintura</button>
      </div>
      <div class="cron-body">
        ${this._sub === 'fabrica' ? this._renderFabrica() : this._renderPintura()}
      </div>
    `;
    wrap.querySelectorAll('.cron-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._sub = btn.dataset.sub;
        this._draw();
      });
    });
    wrap.querySelectorAll('.cron-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._fabView = btn.dataset.view;
        this._draw();
      });
    });
    this._bindEdits(wrap);
  },

  // ── Fábrica ───────────────────────────────────────────────

  _fabViewToggle() {
    return `
      <div class="cron-view-toggle">
        <button class="cron-view-btn ${this._fabView === 'proyecto' ? 'active' : ''}" data-view="proyecto">Por proyecto</button>
        <button class="cron-view-btn ${this._fabView === 'urgencia' ? 'active' : ''}" data-view="urgencia">Por urgencia</button>
      </div>
    `;
  },

  _renderFabrica() {
    return this._fabView === 'urgencia'
      ? this._fabViewToggle() + this._renderFabricaUrgencia()
      : this._fabViewToggle() + this._renderFabricaProyecto();
  },

  _renderFabricaProyecto() {
    const byProject = {};
    for (const op of this._ops) {
      const proj = op.project || 'Sin proyecto';
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(op);
    }

    const sorted = Object.entries(byProject).sort(([, a], [, b]) => {
      const earliest = arr => arr.reduce((min, op) =>
        op.salidaFabrica && (!min || op.salidaFabrica < min) ? op.salidaFabrica : min
      , null);
      const da = earliest(a), db = earliest(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });

    if (!sorted.length) return '<div class="cron-empty">Sin OPs activos.</div>';

    return sorted.map(([project, ops]) => {
      const { overdue, urgent } = this._urgencyCounts(ops);
      const urgHtml = this._urgBadgesHtml(overdue, urgent);

      const opsorted = [...ops].sort((a, b) => {
        if (!a.salidaFabrica && !b.salidaFabrica) return 0;
        if (!a.salidaFabrica) return 1;
        if (!b.salidaFabrica) return -1;
        return a.salidaFabrica - b.salidaFabrica;
      });

      const rows = opsorted.map(op => {
        const st = this._statusInfo(op.salidaFabrica);
        return `
          <tr>
            <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
            <td class="cron-name">${esc(op.name)}</td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="salidaFabrica"
                value="${this._toInputVal(op.salidaFabrica)}">
            </td>
            <td class="cron-fecha-lbl">${op.salidaFabrica ? this._fmtShort(op.salidaFabrica) : '<span class="cron-faint">—</span>'}</td>
            <td><span class="cron-badge ${st.cls}">${st.label}</span></td>
          </tr>
        `;
      }).join('');

      return `
        <div class="cron-block">
          <div class="cron-block-hdr">
            <span class="cron-hdr-name">${esc(project)}</span>
            <span class="cron-hdr-meta">
              <span class="cron-hdr-count">${ops.length} OP${ops.length !== 1 ? 's' : ''}</span>
              ${urgHtml}
            </span>
          </div>
          <table class="cron-tbl">
            <thead><tr>
              <th>No. OP</th>
              <th>Descripción</th>
              <th>Fecha límite</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');
  },

  _renderFabricaUrgencia() {
    // All OPs except those in pintura, sorted most urgent first
    const fabOps = this._ops
      .filter(op => op.status !== 'en pintura')
      .sort((a, b) => {
        if (!a.salidaFabrica && !b.salidaFabrica) return 0;
        if (!a.salidaFabrica) return 1;
        if (!b.salidaFabrica) return -1;
        return a.salidaFabrica - b.salidaFabrica;
      });

    if (!fabOps.length) return '<div class="cron-empty">Sin OPs en fábrica.</div>';

    const { overdue, urgent } = this._urgencyCounts(fabOps);

    const rows = fabOps.map(op => {
      const st = this._statusInfo(op.salidaFabrica);
      return `
        <tr>
          <td><span class="cron-badge ${st.cls}">${st.label}</span></td>
          <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
          <td class="cron-proyecto">${esc(op.project || '—')}</td>
          <td class="cron-name">${esc(op.name)}</td>
          <td class="cron-etapa-lbl">${esc(op.statusRaw || op.status)}</td>
          <td>
            <input type="date" class="cron-date-inp"
              data-opid="${esc(op.id)}"
              data-fieldkey="salidaFabrica"
              value="${this._toInputVal(op.salidaFabrica)}">
          </td>
          <td class="cron-fecha-lbl">${op.salidaFabrica ? this._fmtShort(op.salidaFabrica) : '<span class="cron-faint">—</span>'}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="cron-block">
        <div class="cron-block-hdr">
          <span class="cron-hdr-name">Todos los OPs en fábrica</span>
          <span class="cron-hdr-meta">
            <span class="cron-hdr-count">${fabOps.length} OPs</span>
            ${this._urgBadgesHtml(overdue, urgent)}
          </span>
        </div>
        <table class="cron-tbl cron-tbl-wide">
          <thead><tr>
            <th>Estado</th>
            <th>No. OP</th>
            <th>Proyecto</th>
            <th>Descripción</th>
            <th>Etapa</th>
            <th>Fecha límite</th>
            <th>Fecha</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  // ── Pintura ───────────────────────────────────────────────

  _renderPintura() {
    // Only OPs in "en pintura" status that have a pintor assigned in ClickUp
    const pinturaOps = this._ops.filter(op => op.status === 'en pintura' && op.pintor);

    const byPainter = {};
    for (const op of pinturaOps) {
      if (!byPainter[op.pintor]) byPainter[op.pintor] = [];
      byPainter[op.pintor].push(op);
    }

    const painters = Object.keys(byPainter).sort();

    if (!painters.length) {
      return `<div class="cron-empty">
        Sin OPs en pintura actualmente.
        <span class="cron-empty-hint">Aparecen aquí los OPs con estado "EN PINTURA" y un pintor asignado en ClickUp.</span>
      </div>`;
    }

    return painters.map(painter => {
      // Sort by due date — most urgent first
      const ops = [...byPainter[painter]].sort((a, b) => {
        if (!a.salidaFabrica && !b.salidaFabrica) return 0;
        if (!a.salidaFabrica) return 1;
        if (!b.salidaFabrica) return -1;
        return a.salidaFabrica - b.salidaFabrica;
      });

      const { overdue, urgent } = this._urgencyCounts(ops);
      const urgHtml = this._urgBadgesHtml(overdue, urgent);

      const rows = ops.map(op => {
        const st = this._statusInfo(op.salidaFabrica);
        return `
          <tr>
            <td class="cron-proyecto">${esc(op.project || '—')}</td>
            <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
            <td class="cron-name">${esc(op.name)}</td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="inicioPintura"
                value="${this._toInputVal(op.inicioPintura)}"
                title="Inicio Pintura — edita y sincroniza a ClickUp">
            </td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="salidaFabrica"
                value="${this._toInputVal(op.salidaFabrica)}"
                title="Fecha límite — edita y sincroniza a ClickUp">
            </td>
            <td>
              <input type="text" class="cron-text-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="acabado"
                value="${esc(op.acabado || '')}"
                placeholder="Acabado...">
            </td>
            <td><span class="cron-badge ${st.cls}">${st.label}</span></td>
          </tr>
        `;
      }).join('');

      return `
        <div class="cron-block">
          <div class="cron-block-hdr cron-painter-hdr">
            <span class="cron-hdr-name">🎨 ${esc(painter)}</span>
            <span class="cron-hdr-meta">
              <span class="cron-hdr-count">${ops.length} OP${ops.length !== 1 ? 's' : ''}</span>
              ${urgHtml}
            </span>
          </div>
          <table class="cron-tbl cron-tbl-wide">
            <thead><tr>
              <th>Cliente</th>
              <th>No. OP</th>
              <th>Descripción</th>
              <th>Inicio Pintura</th>
              <th>Fecha Entrega</th>
              <th>Acabado</th>
              <th>Estado</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');
  },

  // ── Helpers ───────────────────────────────────────────────

  _urgencyCounts(ops) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let overdue = 0, urgent = 0;
    for (const op of ops) {
      if (!op.salidaFabrica) continue;
      const diff = Math.ceil((op.salidaFabrica - today) / 86400000);
      if (diff < 0) overdue++;
      else if (diff <= 7) urgent++;
    }
    return { overdue, urgent };
  },

  _urgBadgesHtml(overdue, urgent) {
    const parts = [];
    if (overdue > 0) parts.push(`<span class="cron-urg cron-red">${overdue} vencido${overdue > 1 ? 's' : ''}</span>`);
    if (urgent  > 0) parts.push(`<span class="cron-urg cron-amber">${urgent} urgente${urgent > 1 ? 's' : ''}</span>`);
    return parts.join('');
  },

  _statusInfo(d) {
    if (!d) return { label: 'Sin fecha', cls: 'cron-none' };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff  = Math.ceil((d - today) / 86400000);
    if (diff < 0)   return { label: `Vencido ${-diff}d`, cls: 'cron-red'   };
    if (diff === 0) return { label: 'Hoy',                cls: 'cron-red'   };
    if (diff <= 3)  return { label: `${diff}d`,           cls: 'cron-red'   };
    if (diff <= 7)  return { label: `${diff}d`,           cls: 'cron-amber' };
    return               { label: `${diff}d`,           cls: 'cron-green' };
  },

  _fmtShort(d) {
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  },

  _toInputVal(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  // ── Edit bindings ─────────────────────────────────────────

  _bindEdits(root) {
    root.querySelectorAll('.cron-date-inp').forEach(inp => {
      inp.addEventListener('change', async () => {
        const { opid, fieldkey } = inp.dataset;
        const op = App._data?.ops.find(o => o.id === opid);
        if (!op) return;
        const val = inp.value;
        if (!val) return;
        const ms = new Date(val + 'T00:00:00').getTime();
        inp.disabled = true;
        try {
          if (fieldkey === 'salidaFabrica') {
            // Built-in ClickUp due date
            await PlantaAPI.setDueDate(opid, ms);
          } else {
            // Custom date field (e.g. inicioPintura)
            const fid = this._fieldIds[fieldkey];
            if (!fid) {
              alert(`Campo ClickUp no detectado para "${fieldkey}". Haz ↻ forzar sincronización.`);
              inp.disabled = false;
              return;
            }
            await PlantaAPI.setField(opid, fid, ms);
          }
          op[fieldkey] = new Date(ms);
          inp.style.outline = '2px solid var(--green)';
          setTimeout(() => { inp.style.outline = ''; inp.disabled = false; }, 1200);
          this._draw();
        } catch (e) {
          alert('Error al actualizar ClickUp: ' + e.message);
          inp.style.outline = '2px solid var(--red)';
          inp.disabled = false;
        }
      });
    });

    root.querySelectorAll('.cron-text-inp').forEach(inp => {
      inp.addEventListener('change', async () => {
        const { opid, fieldkey } = inp.dataset;
        const fid = this._fieldIds[fieldkey];
        const op  = App._data?.ops.find(o => o.id === opid);
        if (!op || !fid) return;
        inp.disabled = true;
        try {
          await PlantaAPI.setField(opid, fid, inp.value.trim());
          op[fieldkey] = inp.value.trim();
          inp.style.outline = '2px solid var(--green)';
          setTimeout(() => { inp.style.outline = ''; inp.disabled = false; }, 1200);
        } catch (e) {
          alert('Error al actualizar ClickUp: ' + e.message);
          inp.style.outline = '2px solid var(--red)';
          inp.disabled = false;
        }
      });
    });
  },
};
