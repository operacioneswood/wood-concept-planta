// ─────────────────────────────────────────────────────────────
// js/proyectos.js — Proyectos tab: OPs grouped by parent project
// ─────────────────────────────────────────────────────────────

const Proyectos = {
  _collapsed: new Set(),

  render({ ops, dbData }) {
    const log = (dbData?.produccion || []).map(r => ({
      name:         r.nombre_op,
      project:      r.proyecto,
      person:       r.persona,
      completedDate: r.fecha_salida,
      isReproceso:  r.es_reproceso,
      daysInPlant:  r.dias_en_planta,
    }));

    const contratistas = Storage.getContratistas();
    const body         = el('proyectos-body');

    // Build tiempos lookup: { op_id: { etapa: record } }
    const allTiempos = dbData?.tiempos || [];
    const tiemposMap = {};
    for (const t of allTiempos) {
      if (!tiemposMap[t.op_id]) tiemposMap[t.op_id] = {};
      tiemposMap[t.op_id][t.etapa] = t;
    }

    // Compute averages across all OPs
    const avgMap = this._calcAverages(allTiempos);

    if (!ops.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Sin OPs activos en planta.</p></div>';
    } else {
      const groups = this._groupByProject(ops);
      body.innerHTML = `
        <div class="asign-search-wrap">
          <input type="search" id="proy-search" class="asign-search-input" placeholder="Buscar proyecto, número OP o nombre...">
        </div>
        ${Object.keys(avgMap).length ? this._renderAverages(avgMap, ops) : ''}
        ${[...groups.entries()].map(([proj, projOps]) =>
          this._renderGroup(proj, projOps, contratistas, tiemposMap)
        ).join('')}
      `;
      this._bindEvents(ops, contratistas);
      this._bindAverages();
      this._bindSearch();
    }

    // Completed table
    const heading = el('completed-heading');
    const table   = el('completed-table');
    if (log.length) {
      heading.style.display = '';
      table.innerHTML = this._renderCompletedTable(log);
    } else {
      heading.style.display = 'none';
      table.innerHTML = '';
    }
  },

  _groupByProject(ops) {
    const map = new Map();
    for (const op of ops) {
      const key = op.project || '(Sin proyecto)';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(op);
    }
    return map;
  },

  _renderGroup(projName, projOps, contratistas, tiemposMap) {
    const collapsed   = this._collapsed.has(projName);
    const safeId      = projName.replace(/[^a-zA-Z0-9]/g, '_');
    const anyRepro    = projOps.some(op => !!op.inicioReproceso && !op.finReproceso);

    return `
      <div class="proj-group" data-proj="${esc(projName)}">
        <div class="proj-group-hdr" data-proj="${esc(projName)}">
          <span class="proj-group-arrow">${collapsed ? '▶' : '▼'}</span>
          <span class="proj-group-name">${esc(projName)}</span>
          ${anyRepro ? '<span class="badge-reproceso-sm">⚠ Reproceso</span>' : ''}
          <span class="proj-group-count">${projOps.length} OP${projOps.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="proj-group-body ${collapsed ? 'proj-group-collapsed' : ''}" id="proj-body-${safeId}">
          ${projOps.map(op => this._renderCard(op, contratistas, tiemposMap)).join('')}
        </div>
      </div>
    `;
  },

  _renderCard(op, contratistas, tiemposMap) {
    const stage        = getCurrentStage(op);
    const firstDate    = firstActivityDate(op);
    const daysInPlant  = firstDate ? daysSince(firstDate) : null;
    const daysInStage  = stage && op[STAGE_INICIO[stage]] ? daysSince(op[STAGE_INICIO[stage]]) : null;
    const hasReproceso = !!op.inicioReproceso && !op.finReproceso;
    const ct           = contratistas[op.id];
    const opTiempos    = (tiemposMap || {})[op.id] || {};

    const searchText = `${op.project || ''} ${op.noOp || ''} ${op.name || ''}`.toLowerCase();

    return `
      <div class="proj-card" data-op-id="${esc(op.id)}" data-search="${esc(searchText)}">
        <div class="proj-card-top">
          <div class="proj-card-title">
            ${op.noOp ? `<span class="proj-op-num">${esc(op.noOp)}</span>` : ''}
            <span class="proj-op-name">${esc(op.name)}</span>
            ${hasReproceso ? '<span class="badge-reproceso">⚠ Reproceso</span>' : ''}
          </div>
          <div class="proj-card-status">${this._statusBadge(op.status)}</div>
        </div>

        <div class="proj-card-meta">
          ${op.client      ? `<span class="proj-meta-item">👤 ${esc(op.client)}</span>` : ''}
          ${op.nivel       ? `<span class="proj-meta-item">💰 ${op.nivel.toLocaleString('es-MX')}</span>` : ''}
          ${daysInPlant !== null ? `<span class="proj-meta-item">🕐 ${daysInPlant}d en planta</span>` : ''}
          ${stage && daysInStage !== null ? `<span class="proj-meta-item proj-stage-days">⏱ ${daysInStage}d en ${esc(STAGE_LABELS[stage])}</span>` : ''}
        </div>

        <div class="proj-progress">
          <div class="proj-progress-bar">
            ${STAGES.map(s => {
              const done   = !!op[STAGE_FIN[s.id]];
              const active = s.id === stage;
              const cls    = done ? 'stage-seg-done' : active ? 'stage-seg-active' : 'stage-seg-empty';
              return `<div class="stage-seg ${cls}" style="${done || active ? `background:${s.color}` : ''}" title="${s.label}${done ? ' ✓' : active ? ' (en curso)' : ''}"></div>`;
            }).join('')}
          </div>
          <div class="proj-progress-labels">
            ${STAGES.map(s => {
              const done   = !!op[STAGE_FIN[s.id]];
              const active = s.id === stage;
              const date   = done ? op[STAGE_FIN[s.id]] : (active ? op[STAGE_INICIO[s.id]] : null);
              const t      = opTiempos[s.id];
              const dur    = t ? this._calcDuration(t.fecha_inicio, t.hora_inicio, t.fecha_fin, t.hora_fin) : null;
              return `<div class="stage-lbl ${done ? 'stage-lbl-done' : active ? 'stage-lbl-active' : 'stage-lbl-empty'}">
                <span>${esc(s.label)}</span>
                ${date ? `<span class="stage-date">${fmtDate(date)}</span>` : ''}
                ${dur && dur !== '—' ? `<span class="stage-dur">⏱ ${dur}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>

        ${hasReproceso ? `
          <div class="proj-reproceso-row">
            <span class="repro-lbl">Reproceso desde ${fmtDate(op.inicioReproceso)}</span>
            ${op.causaReproceso ? `<span class="repro-causa">${esc(op.causaReproceso)}</span>` : ''}
          </div>
        ` : ''}

        <div class="proj-card-footer">
          <button class="btn-contratista ${ct ? 'active' : ''}" data-op="${esc(op.id)}">
            ${ct ? '🔧 ' + esc(ct.name || 'Contratista') : '+ Contratista'}
          </button>
          <button class="btn-tiempos btn-secondary btn-sm" data-op="${esc(op.id)}">⏱ Tiempos</button>
        </div>

        <div class="contratista-panel" id="ct-panel-${esc(op.id)}" ${ct ? '' : 'style="display:none"'}>
          <div class="ct-fields">
            <div class="ct-field">
              <label class="ct-label">Nombre</label>
              <input class="ct-input" data-op="${esc(op.id)}" data-key="name" value="${esc(ct?.name || '')}" placeholder="Nombre contratista">
            </div>
            <div class="ct-field">
              <label class="ct-label">Fecha prometida</label>
              <input type="date" class="ct-input" data-op="${esc(op.id)}" data-key="fechaPrometida" value="${ct?.fechaPrometida || ''}">
            </div>
            <div class="ct-field">
              <label class="ct-label">Fecha real</label>
              <input type="date" class="ct-input" data-op="${esc(op.id)}" data-key="fechaReal" value="${ct?.fechaReal || ''}">
            </div>
            <button class="btn-secondary btn-sm ct-remove" data-op="${esc(op.id)}">Quitar</button>
          </div>
        </div>
      </div>
    `;
  },

  // ── Averages ─────────────────────────────────────────────────
  _calcAverages(allTiempos) {
    const sums = {};
    for (const t of allTiempos) {
      if (!t.fecha_inicio || !t.fecha_fin) continue;
      const start = new Date(`${t.fecha_inicio}T${t.hora_inicio || '00:00'}`);
      const end   = new Date(`${t.fecha_fin}T${t.hora_fin || '00:00'}`);
      const mins  = Math.round((end - start) / 60000);
      if (isNaN(mins) || mins <= 0) continue;
      if (!sums[t.etapa]) sums[t.etapa] = { total: 0, count: 0, items: [] };
      sums[t.etapa].total += mins;
      sums[t.etapa].count++;
      sums[t.etapa].items.push({ op_id: t.op_id, nombre_op: t.nombre_op, mins });
    }
    const result = {};
    for (const [etapa, s] of Object.entries(sums)) {
      s.items.sort((a, b) => b.mins - a.mins);
      result[etapa] = { avg: Math.round(s.total / s.count), count: s.count, items: s.items };
    }
    return result;
  },

  _renderAverages(avgMap, ops) {
    const noOpMap = {};
    for (const op of (ops || [])) noOpMap[op.id] = op.noOp || '';

    const renderItem = (label, color, { avg, count, items }, isSub) => {
      const rows = items.map(it => `
        <div class="prom-op-row">
          ${noOpMap[it.op_id] ? `<span class="prom-op-num">${esc(noOpMap[it.op_id])}</span>` : ''}
          <span class="prom-op-name">${esc(it.nombre_op || '—')}</span>
          <span class="prom-op-dur">${this._fmtMins(it.mins)}</span>
        </div>
      `).join('');
      return `
        <div class="prom-item ${isSub ? 'prom-item-sub' : ''}">
          <span class="prom-etapa" style="color:${color}">${isSub ? '↳ ' : ''}${esc(label)}</span>
          <span class="prom-val">${this._fmtMins(avg)}</span>
          <span class="prom-count">${count} OP${count !== 1 ? 's' : ''}</span>
          <button class="prom-expand-btn" title="Ver OPs individuales">▼ ver</button>
          <div class="prom-op-list" style="display:none">${rows}</div>
        </div>
      `;
    };

    const items = [];
    for (const ts of TIEMPO_STAGES) {
      if (avgMap[ts.id]) items.push(renderItem(ts.label, ts.color, avgMap[ts.id], false));
      for (const sub of (ts.subs || [])) {
        if (avgMap[sub.id]) items.push(renderItem(sub.label, ts.color, avgMap[sub.id], true));
      }
    }
    if (!items.length) return '';
    return `
      <div class="promedios-strip">
        <div class="promedios-hdr">📊 Tiempos promedio por etapa</div>
        <div class="promedios-grid">${items.join('')}</div>
      </div>
    `;
  },

  _bindAverages() {
    document.querySelectorAll('.prom-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const list   = btn.nextElementSibling;
        const isOpen = list.style.display !== 'none';
        list.style.display = isOpen ? 'none' : '';
        btn.textContent    = isOpen ? '▼ ver' : '▲ ocultar';
      });
    });
  },

  _calcDuration(fi, hi, ff, hf) {
    if (!fi || !ff) return '—';
    const start = new Date(`${fi}T${hi || '00:00'}`);
    const end   = new Date(`${ff}T${hf || '00:00'}`);
    const mins  = Math.round((end - start) / 60000);
    if (isNaN(mins) || mins <= 0) return '—';
    return this._fmtMins(mins);
  },

  _fmtMins(mins) {
    if (!mins || mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h >= 24) {
      const d  = Math.floor(h / 24);
      const rh = h % 24;
      return rh ? `${d}d ${rh}h` : `${d}d`;
    }
    if (h === 0) return `${m}min`;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  },

  // ── Completed table ───────────────────────────────────────────
  _renderCompletedTable(log) {
    return `
      <table class="completed-table">
        <thead>
          <tr>
            <th>OP / Tarea</th><th>Proyecto</th><th>Persona</th>
            <th>Días planta</th><th>Completado</th><th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          ${log.map(e => `
            <tr>
              <td>${esc(e.name)}</td>
              <td class="muted-txt">${esc(e.project || '—')}</td>
              <td>${esc(e.person || '—')}</td>
              <td>${e.daysInPlant != null ? e.daysInPlant + 'd' : '—'}</td>
              <td class="muted-txt">${esc(e.completedDate || '—')}</td>
              <td>${e.isReproceso ? '<span class="badge-reproceso-sm">Reproceso</span>' : '<span class="badge-normal">Normal</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  _bindEvents(ops, contratistas) {
    // Collapse/expand project groups
    document.querySelectorAll('.proj-group-hdr').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const proj   = hdr.dataset.proj;
        const safeId = proj.replace(/[^a-zA-Z0-9]/g, '_');
        const body   = el(`proj-body-${safeId}`);
        const arrow  = hdr.querySelector('.proj-group-arrow');
        if (!body) return;
        if (this._collapsed.has(proj)) {
          this._collapsed.delete(proj);
          body.classList.remove('proj-group-collapsed');
          if (arrow) arrow.textContent = '▼';
        } else {
          this._collapsed.add(proj);
          body.classList.add('proj-group-collapsed');
          if (arrow) arrow.textContent = '▶';
        }
      });
    });

    // Contratista toggle
    document.querySelectorAll('.btn-contratista').forEach(btn => {
      btn.addEventListener('click', () => {
        const opId  = btn.dataset.op;
        const panel = el(`ct-panel-${opId}`);
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : '';
        if (!visible && !contratistas[opId]) {
          Storage.setContratista(opId, { name: '', fechaPrometida: '', fechaReal: '' });
        }
      });
    });

    // Contratista fields auto-save
    document.querySelectorAll('.ct-input').forEach(input => {
      input.addEventListener('change', () => {
        const opId = input.dataset.op;
        const key  = input.dataset.key;
        const ct   = Storage.getContratistas()[opId] || { name: '', fechaPrometida: '', fechaReal: '' };
        ct[key]    = input.value;
        Storage.setContratista(opId, ct);
      });
    });

    // Remove contratista
    document.querySelectorAll('.ct-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.setContratista(btn.dataset.op, null);
        App.rerender();
      });
    });

    // ⏱ Tiempos
    document.querySelectorAll('.btn-tiempos').forEach(btn => {
      btn.addEventListener('click', () => {
        const op = ops.find(o => o.id === btn.dataset.op);
        if (op) Tiempos.open(op);
      });
    });
  },

  _bindSearch() {
    const input = document.getElementById('proy-search');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      document.querySelectorAll('.proj-card').forEach(card => {
        card.style.display = (!q || (card.dataset.search || '').includes(q)) ? '' : 'none';
      });
      document.querySelectorAll('.proj-group').forEach(group => {
        const anyVisible = [...group.querySelectorAll('.proj-card')].some(c => c.style.display !== 'none');
        group.style.display = anyVisible ? '' : 'none';
      });
    });
  },

  _statusBadge(status) {
    const info = STATUS_DISPLAY[status] || { label: status || '—', cls: 'sb-other' };
    return `<span class="status-badge ${info.cls}">${esc(info.label)}</span>`;
  },
};
