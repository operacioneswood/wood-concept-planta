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
      const myOps = ops.filter(op => (assignments[op.id] || []).some(a => a.person === name));
      return { name, role, myOps };
    });

    const ebanistasData    = personData.filter(p => p.role === 'ebanista');
    const pintoresData     = personData.filter(p => p.role === 'pintor');
    const contratistasData = personData.filter(p => p.role === 'contratista');
    const unknownData      = personData.filter(p => !personasMap[p.name]);

    // Only plant employees count for "sin trabajo" alerts
    const plantaPeople  = [...ebanistasData, ...pintoresData, ...(ebanistasData.length ? [] : unknownData)];
    const unassignedOps = ops.filter(op => !(assignments[op.id]?.length > 0));
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

    this._bindDrag();
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

    // Sort by saved drag order for this person
    const savedOrder = this._getOrder(name);
    const orderedOps = savedOrder.length
      ? [...myOps].sort((a, b) => {
          const ai = savedOrder.indexOf(a.id);
          const bi = savedOrder.indexOf(b.id);
          return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
        })
      : myOps;

    const taskList = orderedOps.map((op, idx) => {
      const a     = (assignments[op.id] || []).find(x => x.person === name);
      const stage = a?.stage ? STAGE_LABELS[a.stage] : null;
      const color = a?.stage ? STAGE_COLORS[a.stage] : null;
      return `
        <div class="panel-task-row ${idx === 0 ? 'panel-task-current' : ''}"
             draggable="true"
             data-drag-person="${esc(name)}"
             data-drag-opid="${esc(op.id)}">
          <span class="panel-drag-handle" title="Arrastrar para reordenar">⠿</span>
          ${op.noOp ? `<span class="panel-op-num">${esc(op.noOp)}</span>` : ''}
          ${op.project ? `<span class="panel-proj-lbl">${esc(op.project)}</span>` : ''}
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

  // ── Drag order persistence ────────────────────────────────
  _getOrder(name) {
    try { return JSON.parse(localStorage.getItem('wp_panel_order_' + name)) || []; }
    catch { return []; }
  },

  _setOrder(name, ids) {
    localStorage.setItem('wp_panel_order_' + name, JSON.stringify(ids));
  },

  // ── Drag-to-reorder ──────────────────────────────────────
  _bindDrag() {
    let dragged = null;

    document.querySelectorAll('.panel-task-row[draggable]').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragged = row;
        row.classList.add('panel-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragend', () => {
        if (dragged) dragged.classList.remove('panel-dragging');
        document.querySelectorAll('.panel-task-row.panel-drag-over')
          .forEach(r => r.classList.remove('panel-drag-over'));
        dragged = null;
      });

      row.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragged || row === dragged) return;
        if (row.dataset.dragPerson !== dragged.dataset.dragPerson) return;
        document.querySelectorAll('.panel-task-row.panel-drag-over')
          .forEach(r => r.classList.remove('panel-drag-over'));
        row.classList.add('panel-drag-over');
      });

      row.addEventListener('dragleave', () => row.classList.remove('panel-drag-over'));

      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('panel-drag-over');
        if (!dragged || row === dragged) return;
        if (row.dataset.dragPerson !== dragged.dataset.dragPerson) return;

        const person  = row.dataset.dragPerson;
        const fromId  = dragged.dataset.dragOpid;
        const toId    = row.dataset.dragOpid;

        // Read current DOM order to build the new order
        const container = row.closest('.panel-tasks-col');
        if (!container) return;
        const allRows = [...container.querySelectorAll('.panel-task-row[data-drag-opid]')];
        const ids = allRows.map(r => r.dataset.dragOpid);

        const fromIdx = ids.indexOf(fromId);
        const toIdx   = ids.indexOf(toId);
        if (fromIdx === -1 || toIdx === -1) return;

        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, fromId);

        this._setOrder(person, ids);
        App.renderPanel();
      });
    });
  },
};
