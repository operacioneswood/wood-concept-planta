// ─────────────────────────────────────────────────────────────
// js/proyectos.js — Proyectos tab: OP cards with progress
// ─────────────────────────────────────────────────────────────

const Proyectos = {

  render({ ops }) {
    const log          = Storage.getProductionLog();
    const contratistas = Storage.getContratistas();

    const body = el('proyectos-body');
    if (!ops.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Sin OPs activos en planta.</p></div>';
    } else {
      body.innerHTML = ops.map(op => this._renderCard(op, contratistas)).join('');
      this._bindContratista(ops, contratistas);
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

  _renderCard(op, contratistas) {
    const stage         = getCurrentStage(op);
    const completed     = countCompletedStages(op);
    const pct           = Math.round((completed / STAGES.length) * 100);
    const firstDate     = firstActivityDate(op);
    const daysInPlant   = firstDate ? daysSince(firstDate) : null;
    const daysInStage   = stage && op[STAGE_INICIO[stage]] ? daysSince(op[STAGE_INICIO[stage]]) : null;
    const hasReproceso  = !!op.inicioReproceso && !op.finReproceso;
    const ct            = contratistas[op.id];

    return `
      <div class="proj-card" data-op-id="${esc(op.id)}">
        <div class="proj-card-top">
          <div class="proj-card-title">
            <span class="proj-op-name">${esc(op.name)}</span>
            ${hasReproceso ? '<span class="badge-reproceso">⚠ Reproceso</span>' : ''}
          </div>
          <div class="proj-card-status">${this._statusBadge(op.status)}</div>
        </div>

        <div class="proj-card-meta">
          ${op.project ? `<span class="proj-meta-item">📁 ${esc(op.project)}</span>` : ''}
          ${op.client  ? `<span class="proj-meta-item">👤 ${esc(op.client)}</span>` : ''}
          ${op.nivel   ? `<span class="proj-meta-item">💰 ${op.nivel.toLocaleString('es-MX')}</span>` : ''}
          ${daysInPlant !== null ? `<span class="proj-meta-item">🕐 ${daysInPlant}d en planta</span>` : ''}
          ${stage && daysInStage !== null ? `<span class="proj-meta-item proj-stage-days">⏱ ${daysInStage}d en ${esc(STAGE_LABELS[stage])}</span>` : ''}
        </div>

        <div class="proj-progress">
          <div class="proj-progress-bar">
            ${STAGES.map(s => {
              const done    = !!op[STAGE_FIN[s.id]];
              const active  = s.id === stage;
              const cls     = done ? 'stage-seg-done' : active ? 'stage-seg-active' : 'stage-seg-empty';
              return `<div class="stage-seg ${cls}" style="${done || active ? `background:${s.color}` : ''}" title="${s.label}${done ? ' ✓' : active ? ' (en curso)' : ''}"></div>`;
            }).join('')}
          </div>
          <div class="proj-progress-labels">
            ${STAGES.map(s => {
              const done   = !!op[STAGE_FIN[s.id]];
              const active = s.id === stage;
              const date   = done ? op[STAGE_FIN[s.id]] : (active ? op[STAGE_INICIO[s.id]] : null);
              return `<div class="stage-lbl ${done ? 'stage-lbl-done' : active ? 'stage-lbl-active' : 'stage-lbl-empty'}">
                <span>${esc(s.label)}</span>
                ${date ? `<span class="stage-date">${fmtDate(date)}</span>` : ''}
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
            ${ct ? '🔧 Contratista: ' + esc(ct.name) : '+ Contratista'}
          </button>
        </div>

        ${ct ? `
          <div class="contratista-panel" id="ct-panel-${esc(op.id)}">
            <div class="ct-fields">
              <div class="ct-field">
                <label class="ct-label">Nombre</label>
                <input class="ct-input" data-op="${esc(op.id)}" data-key="name" value="${esc(ct.name || '')}" placeholder="Nombre contratista">
              </div>
              <div class="ct-field">
                <label class="ct-label">Fecha prometida</label>
                <input type="date" class="ct-input" data-op="${esc(op.id)}" data-key="fechaPrometida" value="${ct.fechaPrometida || ''}">
              </div>
              <div class="ct-field">
                <label class="ct-label">Fecha real</label>
                <input type="date" class="ct-input" data-op="${esc(op.id)}" data-key="fechaReal" value="${ct.fechaReal || ''}">
              </div>
              <button class="btn-secondary btn-sm ct-remove" data-op="${esc(op.id)}">Quitar</button>
            </div>
          </div>
        ` : `<div class="contratista-panel" id="ct-panel-${esc(op.id)}" style="display:none">
          <div class="ct-fields">
            <div class="ct-field">
              <label class="ct-label">Nombre</label>
              <input class="ct-input" data-op="${esc(op.id)}" data-key="name" placeholder="Nombre contratista">
            </div>
            <div class="ct-field">
              <label class="ct-label">Fecha prometida</label>
              <input type="date" class="ct-input" data-op="${esc(op.id)}" data-key="fechaPrometida">
            </div>
            <div class="ct-field">
              <label class="ct-label">Fecha real</label>
              <input type="date" class="ct-input" data-op="${esc(op.id)}" data-key="fechaReal">
            </div>
            <button class="btn-secondary btn-sm ct-remove" data-op="${esc(op.id)}">Quitar</button>
          </div>
        </div>`}
      </div>
    `;
  },

  _renderCompletedTable(log) {
    return `
      <table class="completed-table">
        <thead>
          <tr>
            <th>OP / Tarea</th>
            <th>Proyecto</th>
            <th>Persona</th>
            <th>Nivel</th>
            <th>Días planta</th>
            <th>Completado</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          ${log.map(e => `
            <tr>
              <td>${esc(e.name)}</td>
              <td class="muted-txt">${esc(e.project || '—')}</td>
              <td>${esc(e.person || '—')}</td>
              <td>${e.nivel !== null && e.nivel !== undefined ? e.nivel.toLocaleString('es-MX') : '—'}</td>
              <td>${e.daysInPlant !== null && e.daysInPlant !== undefined ? e.daysInPlant + 'd' : '—'}</td>
              <td class="muted-txt">${esc(e.completedDate || '—')}</td>
              <td>${e.isReproceso ? '<span class="badge-reproceso-sm">Reproceso</span>' : '<span class="badge-normal">Normal</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  _bindContratista(ops, contratistas) {
    // Toggle button
    document.querySelectorAll('.btn-contratista').forEach(btn => {
      btn.addEventListener('click', () => {
        const opId = btn.dataset.op;
        const panel = el(`ct-panel-${opId}`);
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : '';
        if (!visible && !contratistas[opId]) {
          Storage.setContratista(opId, { name: '', fechaPrometida: '', fechaReal: '' });
        }
      });
    });

    // Input save (debounced)
    document.querySelectorAll('.ct-input').forEach(input => {
      input.addEventListener('change', () => {
        const opId = input.dataset.op;
        const key  = input.dataset.key;
        const ct   = Storage.getContratistas()[opId] || { name: '', fechaPrometida: '', fechaReal: '' };
        ct[key]    = input.value;
        Storage.setContratista(opId, ct);
      });
    });

    // Remove
    document.querySelectorAll('.ct-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const opId = btn.dataset.op;
        Storage.setContratista(opId, null);
        App.rerender();
      });
    });
  },

  _statusBadge(status) {
    const info = STATUS_DISPLAY[status] || { label: status || '—', cls: 'sb-other' };
    return `<span class="status-badge ${info.cls}">${esc(info.label)}</span>`;
  },
};
