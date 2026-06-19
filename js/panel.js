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

    const ebanistasData = personData.filter(p => p.role === 'ebanista');
    const pintoresData  = personData.filter(p => p.role === 'pintor');
    const unknownData   = personData.filter(p => !personasMap[p.name]);

    const unassignedOps = ops.filter(op => !assignments[op.id]?.person);
    const noWorkPeople  = personData.filter(p => p.myOps.length === 0);

    // Metrics strip
    el('panel-metrics').innerHTML = `
      <div class="metric-card">
        <div class="metric-val">${ops.length}</div>
        <div class="metric-lbl">OPs activos</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${ebanistas.length}</div>
        <div class="metric-lbl">Personal</div>
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
      ${pintoresData.length ? this._renderSection('Pintores', pintoresData, assignments) : ''}
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
            <div>Tarea actual</div>
            <div>Etapa</div>
            <div>Estado ClickUp</div>
            <div>Próxima tarea</div>
          </div>
          ${people.map(p => this._renderRow(p, assignments)).join('')}
        </div>
      </div>
    `;
  },

  _renderRow({ name, myOps }, assignments) {
    const noWork  = myOps.length === 0;
    const current = myOps[0] || null;
    const next    = myOps[1] || null;
    const a       = current ? assignments[current.id] : null;

    return `
      <div class="panel-row ${noWork ? 'panel-row-alert' : ''}">
        <div class="panel-person">
          ${noWork ? '<span class="alert-dot-red"></span>' : ''}
          <span>${esc(name)}</span>
        </div>
        <div class="panel-task">${current ? `<span class="panel-task-name" title="${esc(current.name)}">${esc(current.name)}</span>` : '<span class="muted-txt">—</span>'}</div>
        <div>${a?.stage ? `<span class="stage-pill" style="background:${STAGE_COLORS[a.stage]}22;color:${STAGE_COLORS[a.stage]};border-color:${STAGE_COLORS[a.stage]}55">${esc(STAGE_LABELS[a.stage])}</span>` : '<span class="muted-txt">—</span>'}</div>
        <div>${current ? this._statusBadge(current.status) : '<span class="muted-txt">—</span>'}</div>
        <div class="panel-next">${next ? `<span class="muted-txt" title="${esc(next.name)}">${esc(next.name)}</span>` : '<span class="muted-txt">—</span>'}</div>
      </div>
    `;
  },

  _statusBadge(status) {
    const info = STATUS_DISPLAY[status] || { label: status || '—', cls: 'sb-other' };
    return `<span class="status-badge ${info.cls}">${esc(info.label)}</span>`;
  },
};
