// ─────────────────────────────────────────────────────────────
// js/asignacion.js — Asignación tab: assign person+stage to OPs
//                    OPs grouped by parent project
// ─────────────────────────────────────────────────────────────

const Asignacion = {
  _collapsed: new Set(),

  render({ ops, ebanistas, dbData, fieldIds }) {
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

    this._bindEvents(ops, ebanistas, fieldIds);
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
          ${op.project ? `<div class="asign-proj-sub">${esc(op.project)}</div>` : ''}
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
          <button class="btn-stage-date btn-stage-inicio btn-sm" data-op="${esc(op.id)}" title="Marcar inicio de etapa hoy">▶ Inicio</button>
          <button class="btn-stage-date btn-stage-fin btn-sm" data-op="${esc(op.id)}" title="Marcar fin de etapa hoy">■ Fin</button>
        </div>
      </div>
    `;
  },

  _bindEvents(ops, ebanistas, fieldIds) {
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

        // Update local cache — replace ALL rows for this op (one per OP)
        const newRow = { op_id: opId, etapa: stage || '_', persona: person, fecha_asignacion: estimatedDate || todayIso() };
        App._dbData.asignaciones = App._dbData.asignaciones.filter(a => a.op_id !== opId);
        App._dbData.asignaciones.push(newRow);

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

    // Inicio / Fin stage buttons
    this._bindStageDates(fieldIds);

    // Auto-save on select change — optimistic: update cache + panel instantly, then persist
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
        this._updateGroupCount(row);

        // Update local cache immediately
        const newRow = { op_id: opId, etapa: stage || '_', persona: person, fecha_asignacion: estimatedDate || todayIso() };
        App._dbData.asignaciones = App._dbData.asignaciones.filter(a => a.op_id !== opId);
        App._dbData.asignaciones.push(newRow);

        // Re-render panel instantly (no Supabase wait)
        App.renderPanel();

        // Persist to Supabase in background
        try {
          await DB.setAsignacion(opId, stage || '_', person, estimatedDate || null);
        } catch (e) {
          console.error('[Asignacion] auto-save failed:', e.message);
        }
      });
    });
  },

  _bindStageDates(fieldIds) {
    this._bindStageDateBtn('.btn-stage-inicio', STAGE_INICIO, fieldIds, false);
    this._bindStageDateBtn('.btn-stage-fin',    STAGE_FIN,    fieldIds, true);
  },

  // clearOnSuccess=true → clear assignment after Fin so OP can be reassigned to next person
  _bindStageDateBtn(selector, stageMap, fieldIds, clearOnSuccess) {
    document.querySelectorAll(selector).forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId  = btn.dataset.op;
        const row   = document.querySelector(`.asign-row[data-op-id="${opId}"]`);
        const stage = row?.querySelector('.asign-stage')?.value;

        if (!stage || stage === '_' || stage === 'reproceso') {
          alert('Selecciona una etapa válida primero'); return;
        }

        const dateKey = stageMap[stage];
        const fieldId = fieldIds?.[dateKey];
        if (!fieldId) { alert('Campo de fecha no encontrado en ClickUp'); return; }

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;

        try {
          await PlantaAPI.setField(opId, fieldId, Date.now());
          const op = App._data?.ops.find(o => o.id === opId);
          if (op) op[dateKey] = new Date();

          if (clearOnSuccess) {
            // Etapa terminada → limpiar asignación para que se pueda asignar a la siguiente persona
            const personSel = row?.querySelector('.asign-person');
            const stageSel  = row?.querySelector('.asign-stage');
            if (personSel) personSel.value = '';
            if (stageSel)  stageSel.value  = '';
            row?.classList.remove('asign-row-assigned');
            row?.classList.add('asign-row-empty');
            this._updateGroupCount(row);
            App._dbData.asignaciones = App._dbData.asignaciones.filter(a => a.op_id !== opId);
            App.renderPanel();
            DB.removeAsignacion(opId).catch(e => console.warn('[Asignacion] remove:', e.message));
          }

          PlantaAPI.clearCache();
          Proyectos.render({ ...App._data, dbData: App._dbData });
          btn.textContent = '✓'; btn.style.color = 'var(--green)';
          setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
        } catch (e) {
          alert('Error al actualizar ClickUp: ' + e.message);
          btn.textContent = orig;
        }
        btn.disabled = false;
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
