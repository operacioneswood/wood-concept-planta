// ─────────────────────────────────────────────────────────────
// js/asignacion.js — Asignación tab: assign person+stage to OPs
//                    OPs grouped by parent project
// ─────────────────────────────────────────────────────────────

const Asignacion = {
  _collapsed: new Set(),

  render({ ops, ebanistas, dbData }) {
    const body = el('asignacion-body');

    if (!ops.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Sin OPs activos para asignar.</p></div>';
      return;
    }

    const assignments = App.buildAssignments(dbData);
    const priority    = App.buildPriorities(dbData);

    const groups = this._groupByProject(ops, priority);

    body.innerHTML = [...groups.entries()].map(([proj, projOps]) =>
      this._renderGroup(proj, projOps, assignments, ebanistas)
    ).join('');

    this._bindEvents(ops, ebanistas);
  },

  _groupByProject(ops, priority) {
    // priority = ordered array of project names (from tablero drag-and-drop)
    const priorityIdx = name => { const i = priority.indexOf(name); return i === -1 ? 999 : i; };
    const map = new Map();
    for (const op of ops) {
      const key = op.project || '(Sin proyecto)';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(op);
    }
    // Sort the map by project priority order
    return new Map([...map.entries()].sort((a, b) => priorityIdx(a[0]) - priorityIdx(b[0])));
  },

  _renderGroup(projName, projOps, assignments, ebanistas) {
    const collapsed     = this._collapsed.has(projName);
    const safeId        = 'ag-' + projName.replace(/[^a-zA-Z0-9]/g, '_');
    const assignedCount = projOps.filter(op => assignments[op.id]?.person).length;

    return `
      <div class="proj-group asign-group" data-proj="${esc(projName)}">
        <div class="proj-group-hdr asign-group-hdr" data-group="${safeId}">
          <span class="proj-group-arrow">${collapsed ? '▶' : '▼'}</span>
          <span class="proj-group-name">${esc(projName)}</span>
          <span class="proj-group-count">${projOps.length} OP${projOps.length !== 1 ? 's' : ''}</span>
          <span class="asign-group-assigned">${assignedCount}/${projOps.length} asignados</span>
        </div>
        <div class="asign-group-body ${collapsed ? 'proj-group-collapsed' : ''}" id="${safeId}">
          <div class="asign-table">
            <div class="asign-table-head">
              <div>OP / Tarea</div>
              <div>Etapa actual</div>
              <div>Persona</div>
              <div>Etapa asignada</div>
              <div>Fecha estimada</div>
              <div>Acciones</div>
            </div>
            ${projOps.map(op => this._renderRow(op, assignments, ebanistas)).join('')}
          </div>
        </div>
      </div>
    `;
  },

  _renderRow(op, assignments, ebanistas) {
    const a     = assignments[op.id];
    const stage = getCurrentStage(op);
    const hasReproceso = !!op.inicioReproceso && !op.finReproceso;

    const personOptions = ebanistas.map(name =>
      `<option value="${esc(name)}" ${a?.person === name ? 'selected' : ''}>${esc(name)}</option>`
    ).join('');

    const stageOptions = [
      `<option value="">— Etapa —</option>`,
      ...STAGES.map(s => `<option value="${s.id}" ${a?.stage === s.id ? 'selected' : ''}>${s.label}</option>`),
      `<option value="reproceso" ${a?.stage === 'reproceso' ? 'selected' : ''}>Reproceso</option>`,
    ].join('');

    return `
      <div class="asign-row ${a?.person ? 'asign-row-assigned' : 'asign-row-empty'}" data-op-id="${esc(op.id)}">
        <div class="asign-name">
          ${esc(op.name)}
          ${hasReproceso ? '<span class="badge-reproceso-sm">Reproceso</span>' : ''}
        </div>
        <div>
          ${stage
            ? `<span class="stage-pill-sm" style="color:${STAGE_COLORS[stage]}">${esc(STAGE_LABELS[stage])}</span>`
            : '<span class="muted-txt">—</span>'}
        </div>
        <div>
          <select class="asign-select asign-person" data-op="${esc(op.id)}">
            <option value="">— Persona —</option>
            ${personOptions}
          </select>
        </div>
        <div>
          <select class="asign-select asign-stage" data-op="${esc(op.id)}">
            ${stageOptions}
          </select>
        </div>
        <div>
          <input type="date" class="asign-date" data-op="${esc(op.id)}" value="${a?.estimatedDate || ''}">
        </div>
        <div class="asign-actions">
          <button class="btn-save-asign btn-primary btn-sm" data-op="${esc(op.id)}">✓</button>
          <button class="btn-complete-op btn-secondary btn-sm" data-op="${esc(op.id)}" data-name="${esc(op.name)}">✔ Listo</button>
        </div>
      </div>
    `;
  },

  _bindEvents(ops, ebanistas) {
    // Collapse/expand groups
    document.querySelectorAll('.asign-group-hdr').forEach(hdr => {
      hdr.addEventListener('click', e => {
        if (e.target.closest('select, input, button')) return;
        const proj   = hdr.closest('.asign-group').dataset.proj;
        const bodyId = hdr.dataset.group;
        const body   = el(bodyId);
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

    // Save assignment
    document.querySelectorAll('.btn-save-asign').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId          = btn.dataset.op;
        const row           = document.querySelector(`.asign-row[data-op-id="${opId}"]`);
        if (!row) return;
        const person        = row.querySelector('.asign-person').value;
        const stage         = row.querySelector('.asign-stage').value;
        const estimatedDate = row.querySelector('.asign-date').value;

        // Optimistic UI update
        row.classList.toggle('asign-row-assigned', !!person);
        row.classList.toggle('asign-row-empty', !person);
        btn.textContent = '✓ Guardado';
        btn.style.background = '#166534';
        setTimeout(() => { btn.textContent = '✓'; btn.style.background = ''; }, 1500);

        // Update local cache
        const existing = App._dbData.asignaciones.findIndex(a => a.op_id === opId && a.etapa === (stage || '_'));
        const newRow = { op_id: opId, etapa: stage || '_', persona: person, fecha_asignacion: estimatedDate || todayIso() };
        if (existing !== -1) App._dbData.asignaciones[existing] = newRow;
        else App._dbData.asignaciones.push(newRow);

        App.renderPanel();
        this._updateGroupCount(row);

        // Persist to Supabase
        try {
          await DB.setAsignacion(opId, stage || '_', person, estimatedDate || null);
        } catch (e) {
          console.error('[Asignacion] save failed:', e.message);
        }
      });
    });

    // Mark complete → open modal
    document.querySelectorAll('.btn-complete-op').forEach(btn => {
      btn.addEventListener('click', () => {
        App.openCompleteModal(btn.dataset.op, btn.dataset.name, ebanistas);
      });
    });

    // Auto-save on select change
    document.querySelectorAll('.asign-person, .asign-stage').forEach(sel => {
      sel.addEventListener('change', async () => {
        const opId          = sel.dataset.op;
        const row           = document.querySelector(`.asign-row[data-op-id="${opId}"]`);
        if (!row) return;
        const person        = row.querySelector('.asign-person').value;
        const stage         = row.querySelector('.asign-stage').value;
        const estimatedDate = row.querySelector('.asign-date').value;

        row.classList.toggle('asign-row-assigned', !!person);
        row.classList.toggle('asign-row-empty', !person);

        const existing = App._dbData.asignaciones.findIndex(a => a.op_id === opId && a.etapa === (stage || '_'));
        const newRow = { op_id: opId, etapa: stage || '_', persona: person, fecha_asignacion: estimatedDate || todayIso() };
        if (existing !== -1) App._dbData.asignaciones[existing] = newRow;
        else App._dbData.asignaciones.push(newRow);

        App.renderPanel();
        this._updateGroupCount(row);

        try {
          await DB.setAsignacion(opId, stage || '_', person, estimatedDate || null);
        } catch (e) {
          console.error('[Asignacion] auto-save failed:', e.message);
        }
      });
    });
  },

  _updateGroupCount(row) {
    const group   = row.closest('.asign-group');
    if (!group) return;
    const allRows = group.querySelectorAll('.asign-row');
    const assigned = group.querySelectorAll('.asign-row-assigned').length;
    const counter  = group.querySelector('.asign-group-assigned');
    if (counter) counter.textContent = `${assigned}/${allRows.length} asignados`;
  },
};
