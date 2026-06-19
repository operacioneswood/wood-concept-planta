// ─────────────────────────────────────────────────────────────
// js/panel.js — Panel tab: per-person workload overview
// ─────────────────────────────────────────────────────────────

const Panel = {

  render({ ops, ebanistas, dbData }) {
    const assignments = App.buildAssignments(dbData);
    const personasMap = App.buildPersonasMap(dbData);

    // Build per-person data
    const personData = ebanistas.map(name => {
      const role  = personasMap[name] || 'ebanista';
      const myOps = ops.filter(op => assignments[op.id]?.person === name);
      return { name, role, myOps };
    });

    const ebanistasData    = personData.filter(p => p.role === 'ebanista');
    const pintoresData     = personData.filter(p => p.role === 'pintor');
    const contratistasData = personData.filter(p => p.role === 'contratista');
    const unknownData      = personData.filter(p => !personasMap[p.name]);

    // Only plant employees count for "sin trabajo" alerts
    const plantaPeople  = [...ebanistasData, ...pintoresData, ...(ebanistasData.length ? [] : unknownData)];
    const unassignedOps = ops.filter(op => !assignments[op.id]?.person);
    const noWorkPeople  = plantaPeople.filter(p => p.myOps.length === 0);

    // Metrics strip
    el('panel-metrics').innerHTML = `
      <div class="metric-card">
        <div class="metric-val">${ops.length}</div>
        <div class="metric-lbl">OPs activos</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${plantaPeople.length}</div>
        <div class="metric-lbl">Personal planta</div>
      </div>
      <div class="metric-card ${unassignedOps.length > 0 ? 'metric-warn' : ''}">
        <div class="metric-val">${unassignedOps.length}</div>
        <div class="metric-lbl">Sin asignar</div>
      </div>
      <div class="metric-card ${noWorkPeople.length > 0 ? 'metric-alert' : ''}">
        <div class="metric-val">${noWorkPeople.length}</div>
        <div class="metric-lbl">Sin trabajo</div>
      </div>
    `;

    // Body
    const noWorkNames = noWorkPeople.map(p => esc(p.name)).join(', ');
    el('panel-body').innerHTML = `
      ${noWorkPeople.length ? `<div class="panel-alert-banner">⚠ Sin asignación: ${noWorkNames}</div>` : ''}
      ${this._renderSection('Ebanistas', ebanistasData.length ? ebanistasData : unknownData, assignments)}
      ${contratistasData.length ? this._renderSection('Contratistas', contratistasData, assignments) : ''}
      ${pintoresData.length     ? this._renderSection('Pintores', pintoresData, assignments) : ''}
      ${ops.length === 0 ? '<div class="empty-state"><div class="empty-icon">🏭</div><p>Sin OPs activos en planta.</p><p class="muted">Verifica la conexión en ⚙ Configuración.</p></div>' : ''}
    `;
  },

  _renderSection(title, people, assignments) {
    if (!people.length) return '';
    return `
      <div class="panel-section">
        <div class="panel-section-hdr">${esc(title)}</div>
        <div class="panel-table">
          <div class="panel-table-head">
            <div>Persona</div>
            <div>Tareas asignadas</div>
          </div>
          ${people.map(p => this._renderRow(p, assignments)).join('')}
        </div>
      </div>
    `;
  },

  _renderRow({ name, myOps }, assignments) {
    const noWork = myOps.length === 0;

    const taskList = myOps.map((op, idx) => {
      const a     = assignments[op.id];
      const stage = a?.stage ? STAGE_LABELS[a.stage] : null;
      const color = a?.stage ? STAGE_COLORS[a.stage] : null;
      return `
        <div class="panel-task-row ${idx === 0 ? 'panel-task-current' : ''}">
          <span class="panel-task-num">${idx + 1}</span>
          ${op.noOp ? `<span class="panel-op-num">${esc(op.noOp)}</span>` : ''}
          <span class="panel-task-name">${esc(op.name)}</span>
          ${stage ? `<span class="stage-pill-sm" style="color:${color}">${esc(stage)}</span>` : ''}
          ${this._statusBadge(op.status)}
        </div>
      `;
    }).join('');

    return `
      <div class="panel-row ${noWork ? 'panel-row-alert' : ''}">
        <div class="panel-person">
          ${noWork ? '<span class="alert-dot-red"></span>' : ''}
          <span>${esc(name)}</span>
          ${myOps.length > 0 ? `<span class="panel-op-count">${myOps.length}</span>` : ''}
        </div>
        <div class="panel-tasks-col">
          ${noWork ? '<span class="muted-txt">Sin asignación</span>' : taskList}
        </div>
      </div>
    `;
  },

  _statusBadge(status) {
    const info = STATUS_DISPLAY[status] || { label: status || '—', cls: 'sb-other' };
    return `<span class="status-badge ${info.cls}">${esc(info.label)}</span>`;
  },
};
