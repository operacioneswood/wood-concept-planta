// ─────────────────────────────────────────────────────────────
// js/cronograma.js — Cronograma tab: Fábrica + Pintura schedules
// ─────────────────────────────────────────────────────────────

const Cronograma = {
  _ops:      [],
  _dbData:   null,
  _fieldIds: {},
  _sub:      'fabrica',   // persists across re-renders

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
    this._bindEdits(wrap);
  },

  // ── Fábrica ───────────────────────────────────────────────

  _renderFabrica() {
    const byProject = {};
    for (const op of this._ops) {
      const proj = op.project || 'Sin proyecto';
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(op);
    }

    // Sort projects by earliest salidaFabrica; undated projects go last
    const sorted = Object.entries(byProject).sort(([, a], [, b]) => {
      const earliest = arr => arr.reduce((min, op) => {
        if (!op.salidaFabrica) return min;
        return !min || op.salidaFabrica < min ? op.salidaFabrica : min;
      }, null);
      const da = earliest(a), db = earliest(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });

    if (!sorted.length) return '<div class="cron-empty">Sin OPs activos.</div>';

    return sorted.map(([project, ops]) => {
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
          <div class="cron-block-hdr">${esc(project)}</div>
          <table class="cron-tbl">
            <thead><tr>
              <th>No. OP</th>
              <th>Descripción</th>
              <th>Salida Fábrica</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');
  },

  // ── Pintura ───────────────────────────────────────────────

  _renderPintura() {
    const assignments = App.buildAssignments(this._dbData);

    const byPainter = {};
    for (const op of this._ops) {
      const paintAssigns = (assignments[op.id] || []).filter(a => a.stage === 'pintura');
      for (const a of paintAssigns) {
        if (!byPainter[a.person]) byPainter[a.person] = [];
        byPainter[a.person].push({ op, comentario: a.comentario || '' });
      }
    }

    const painters = Object.keys(byPainter).sort();
    if (!painters.length) {
      return `<div class="cron-empty">
        Sin OPs asignados a pintores.
        <span class="cron-empty-hint">Asigna OPs a un pintor desde Asignación (etapa Pintura).</span>
      </div>`;
    }

    return painters.map(painter => {
      const items = [...byPainter[painter]].sort((a, b) => {
        if (!a.op.salidaFabrica && !b.op.salidaFabrica) return 0;
        if (!a.op.salidaFabrica) return 1;
        if (!b.op.salidaFabrica) return -1;
        return a.op.salidaFabrica - b.op.salidaFabrica;
      });

      const rows = items.map(({ op, comentario }) => {
        const recibido = op.inicioPintura ? this._fmtFull(op.inicioPintura) : '—';
        const st = this._statusInfo(op.salidaFabrica);
        return `
          <tr>
            <td class="cron-proyecto">${esc(op.project || '—')}</td>
            <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
            <td class="cron-name">${esc(op.name)}</td>
            <td class="cron-recibido">${recibido}</td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="salidaFabrica"
                value="${this._toInputVal(op.salidaFabrica)}">
            </td>
            <td>
              <input type="text" class="cron-text-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="acabado"
                value="${esc(op.acabado || '')}"
                placeholder="Acabado...">
            </td>
            <td class="cron-comentario">${esc(comentario)}</td>
            <td><span class="cron-badge ${st.cls}">${st.label}</span></td>
          </tr>
        `;
      }).join('');

      return `
        <div class="cron-block">
          <div class="cron-block-hdr cron-painter-hdr">🎨 ${esc(painter)}</div>
          <table class="cron-tbl cron-tbl-wide">
            <thead><tr>
              <th>Cliente</th>
              <th>No. OP</th>
              <th>Descripción</th>
              <th>Fecha Recibido</th>
              <th>Fecha Entrega</th>
              <th>Acabado</th>
              <th>Comentarios</th>
              <th>Estado</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');
  },

  // ── Helpers ───────────────────────────────────────────────

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

  _fmtFull(d) {
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
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
        if (!op) { console.warn('[Cronograma] op not found:', opid); return; }
        const val = inp.value;
        if (!val) return;
        // Midnight local → correct calendar day in ClickUp (date-only mode)
        const ms = new Date(val + 'T00:00:00').getTime();
        inp.disabled = true;
        try {
          // salidaFabrica uses the built-in ClickUp due date (PUT /task)
          await PlantaAPI.setDueDate(opid, ms);
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
        if (!op)  { console.warn('[Cronograma] op not found:', opid); return; }
        if (!fid) {
          alert(`Campo "${fieldkey}" no encontrado en ClickUp. Crea el campo "Acabado" (tipo Short Text) en ClickUp y recarga.`);
          return;
        }
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
