// ─────────────────────────────────────────────────────────────
// js/asignacion.js — Asignación tab: assign people+stage to OPs
//   Multiple people can be assigned to the same OP.
//   Each person has a comment for what they worked on.
//   ▶ Inicio = OP-level (first sets the date, others skip)
//   ■ Fin    = per-person chip (saves historial + removes chip)
// ─────────────────────────────────────────────────────────────

const Asignacion = {
  _collapsed: new Set(),
  _ebanistas: [],
  _fieldIds:  {},

  render({ ops, ebanistas, dbData, fieldIds }) {
    this._ebanistas = ebanistas;
    this._fieldIds  = fieldIds || {};

    const body = el('asignacion-body');
    if (!ops.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Sin OPs activos para asignar.</p></div>';
      return;
    }

    const assignments = App.buildAssignments(dbData);
    const priority    = App.buildPriorities(dbData);
    const groups      = this._groupByProject(ops, priority);

    body.innerHTML = [...groups.entries()].map(([proj, projOps]) =>
      this._renderGroup(proj, projOps, assignments, ebanistas)
    ).join('');

    this._bindEvents(ops, ebanistas, fieldIds || {});
  },

  _rerender() {
    App.renderAsignacion();
  },

  _groupByProject(ops, priority) {
    const priorityIdx = name => { const i = priority.indexOf(name); return i === -1 ? 999 : i; };
    const map = new Map();
    for (const op of ops) {
      const key = op.project || '(Sin proyecto)';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(op);
    }
    return new Map([...map.entries()].sort((a, b) => priorityIdx(a[0]) - priorityIdx(b[0])));
  },

  _renderGroup(projName, projOps, assignments, ebanistas) {
    const collapsed     = this._collapsed.has(projName);
    const safeId        = 'ag-' + projName.replace(/[^a-zA-Z0-9]/g, '_');
    const assignedCount = projOps.filter(op => (assignments[op.id] || []).length > 0).length;

    return `
      <div class="proj-group asign-group" data-proj="${esc(projName)}">
        <div class="proj-group-hdr asign-group-hdr" data-group="${safeId}">
          <span class="proj-group-arrow">${collapsed ? '▶' : '▼'}</span>
          <span class="proj-group-name">${esc(projName)}</span>
          <span class="proj-group-count">${projOps.length} OP${projOps.length !== 1 ? 's' : ''}</span>
          <span class="asign-group-assigned">${assignedCount}/${projOps.length} asignados</span>
        </div>
        <div class="asign-group-body ${collapsed ? 'proj-group-collapsed' : ''}" id="${safeId}">
          <div class="asign-cards">
            ${projOps.map(op => this._renderRow(op, assignments, ebanistas)).join('')}
          </div>
        </div>
      </div>
    `;
  },

  _renderRow(op, assignments, ebanistas) {
    const opAssigns  = assignments[op.id] || [];
    const isAssigned = opAssigns.length > 0;
    const stage      = getCurrentStage(op);
    const hasRepro   = !!op.inicioReproceso && !op.finReproceso;

    const personOpts = ebanistas.map(n =>
      `<option value="${esc(n)}">${esc(n)}</option>`
    ).join('');

    const stageOpts = [
      `<option value="">— Etapa —</option>`,
      ...STAGES.map(s => `<option value="${s.id}">${s.label}</option>`),
      `<option value="reproceso">Reproceso</option>`,
    ].join('');

    const chips = opAssigns.map(a => `
      <div class="asign-chip" data-op="${esc(op.id)}" data-person="${esc(a.person)}">
        <span class="chip-name">${esc(a.person)}</span>
        ${a.stage && a.stage !== '_' ? `<span class="chip-stage">${esc(STAGE_LABELS[a.stage] || a.stage)}</span>` : ''}
        <input type="text" class="chip-comment"
          data-op="${esc(op.id)}" data-person="${esc(a.person)}"
          value="${esc(a.comentario || '')}" placeholder="Qué hizo...">
        <button class="btn-chip-fin" data-op="${esc(op.id)}" data-person="${esc(a.person)}" data-stage="${esc(a.stage || '')}">■ Fin</button>
        <button class="btn-chip-remove" data-op="${esc(op.id)}" data-person="${esc(a.person)}">✕</button>
      </div>
    `).join('');

    return `
      <div class="asign-card ${isAssigned ? 'asign-row-assigned' : 'asign-row-empty'}" data-op-id="${esc(op.id)}">
        <div class="asign-card-hdr">
          <div class="asign-name">
            <div>
              ${op.noOp ? `<span class="asign-op-num">${esc(op.noOp)}</span> ` : ''}${esc(op.name)}
              ${hasRepro ? '<span class="badge-reproceso-sm">Reproceso</span>' : ''}
            </div>
            ${op.project ? `<div class="asign-proj-sub">${esc(op.project)}</div>` : ''}
          </div>
          <div class="asign-card-right">
            ${stage
              ? `<span class="stage-pill-sm" style="color:${STAGE_COLORS[stage]}">${esc(STAGE_LABELS[stage])}</span>`
              : '<span class="muted-txt">—</span>'}
            <button class="btn-stage-inicio btn-sm" data-op="${esc(op.id)}" title="Marcar inicio de etapa hoy">▶ Inicio</button>
          </div>
        </div>
        ${opAssigns.length > 0 ? `<div class="asign-chips">${chips}</div>` : ''}
        <div class="asign-card-add">
          <select class="asign-select asign-person" data-op="${esc(op.id)}">
            <option value="">— Agregar persona —</option>
            ${personOpts}
          </select>
          <select class="asign-select asign-stage" data-op="${esc(op.id)}">
            ${stageOpts}
          </select>
          <input type="date" class="asign-date" data-op="${esc(op.id)}">
          <button class="btn-save-asign btn-primary btn-sm" data-op="${esc(op.id)}">✓</button>
          <button class="btn-complete-op btn-secondary btn-sm" data-op="${esc(op.id)}" data-name="${esc(op.name)}">✔ Listo</button>
        </div>
      </div>
    `;
  },

  _bindEvents(ops, ebanistas, fieldIds) {
    const rerender = () => this._rerender();

    // ── Collapse/expand groups ────────────────────────────────
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

    // ── Add person (✓) ────────────────────────────────────────
    document.querySelectorAll('.btn-save-asign').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId  = btn.dataset.op;
        const card  = document.querySelector(`.asign-card[data-op-id="${opId}"]`);
        if (!card) return;
        const person = card.querySelector('.asign-person').value;
        const stage  = card.querySelector('.asign-stage').value;
        const date   = card.querySelector('.asign-date').value;
        if (!person) return;

        // Add to cache (upsert by op+persona)
        App._dbData.asignaciones = App._dbData.asignaciones.filter(
          a => !(a.op_id === opId && a.persona === person)
        );
        App._dbData.asignaciones.push({
          op_id: opId, etapa: stage || '_', persona: person,
          fecha_asignacion: date || todayIso(), comentario: '',
        });

        App.renderPanel();
        rerender();

        try {
          await DB.setAsignacion(opId, stage || '_', person, date || null, null);
        } catch (e) {
          console.error('[Asignacion] save failed:', e.message);
        }
      });
    });

    // ── Mark complete (✔ Listo) ───────────────────────────────
    document.querySelectorAll('.btn-complete-op').forEach(btn => {
      btn.addEventListener('click', () => {
        App.openCompleteModal(btn.dataset.op, btn.dataset.name, ebanistas);
      });
    });

    // ── Chip comment save ────────────────────────────────────
    document.querySelectorAll('.chip-comment').forEach(input => {
      input.addEventListener('change', async () => {
        const opId      = input.dataset.op;
        const person    = input.dataset.person;
        const comentario = input.value;
        const row = App._dbData.asignaciones.find(a => a.op_id === opId && a.persona === person);
        if (row) row.comentario = comentario;
        try {
          if (row) await DB.setAsignacion(opId, row.etapa, person, row.fecha_asignacion, comentario);
        } catch (e) {
          console.error('[Asignacion] comment save:', e.message);
        }
      });
    });

    // ── Chip ■ Fin ───────────────────────────────────────────
    document.querySelectorAll('.btn-chip-fin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId   = btn.dataset.op;
        const person = btn.dataset.person;
        const stage  = btn.dataset.stage;

        if (!stage || stage === '_' || stage === 'reproceso') {
          alert('Esta asignación no tiene etapa válida'); return;
        }

        const dateKey = STAGE_FIN[stage];
        const fieldId = fieldIds?.[dateKey];
        if (!fieldId) { alert('Campo de fin no encontrado en ClickUp'); return; }

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;

        try {
          const chip       = btn.closest('.asign-chip');
          const comentario = chip?.querySelector('.chip-comment')?.value || '';
          const op         = App._data?.ops.find(o => o.id === opId);
          const today      = todayIso();
          const inicioKey  = STAGE_INICIO[stage];
          const fechaInicio = op?.[inicioKey] ? op[inicioKey].toISOString().slice(0, 10) : null;

          // Save historial before removing assignment
          const histEntry = { op_id: opId, etapa: stage, persona: person, fecha_inicio: fechaInicio, fecha_fin: today, es_reproceso: false, comentario };
          App._dbData.historial = (App._dbData.historial || []).filter(
            h => !(h.op_id === opId && h.etapa === stage && h.persona === person)
          );
          App._dbData.historial.unshift(histEntry);
          DB.upsertHistorial(histEntry).catch(e => console.warn('[Asignacion] historial:', e.message));

          // Remove this person's assignment
          App._dbData.asignaciones = App._dbData.asignaciones.filter(
            a => !(a.op_id === opId && a.persona === person)
          );
          DB.removeAsignacion(opId, person).catch(e => console.warn('[Asignacion] remove:', e.message));

          // Set ClickUp fin date (last person wins)
          await PlantaAPI.setField(opId, fieldId, Date.now());
          if (op) op[dateKey] = new Date();
          PlantaAPI.clearCache();

          App.renderPanel();
          Proyectos.render({ ...App._data, dbData: App._dbData });
          rerender();

        } catch (e) {
          alert('Error al actualizar ClickUp: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });

    // ── Chip ✕ remove ────────────────────────────────────────
    document.querySelectorAll('.btn-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const opId   = btn.dataset.op;
        const person = btn.dataset.person;
        App._dbData.asignaciones = App._dbData.asignaciones.filter(
          a => !(a.op_id === opId && a.persona === person)
        );
        App.renderPanel();
        DB.removeAsignacion(opId, person).catch(e => console.warn('[Asignacion] remove:', e.message));
        rerender();
      });
    });

    // ── ▶ Inicio (OP-level, first person wins) ───────────────
    document.querySelectorAll('.btn-stage-inicio').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId  = btn.dataset.op;
        const op    = App._data?.ops.find(o => o.id === opId);
        const stage = getCurrentStage(op);
        if (!stage) { alert('No hay etapa activa para este OP'); return; }

        const dateKey = STAGE_INICIO[stage];
        const fieldId = fieldIds?.[dateKey];
        if (!fieldId) { alert('Campo de inicio no encontrado en ClickUp'); return; }

        if (op?.[dateKey]) {
          btn.textContent = '✓ Ya iniciado';
          setTimeout(() => { btn.textContent = '▶ Inicio'; }, 1500);
          return;
        }

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;
        try {
          await PlantaAPI.setField(opId, fieldId, Date.now());
          if (op) op[dateKey] = new Date();
          PlantaAPI.clearCache();
          Proyectos.render({ ...App._data, dbData: App._dbData });
          btn.textContent = '✓'; btn.style.color = 'var(--green)';
          setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
        } catch (e) {
          alert('Error: ' + e.message);
          btn.textContent = orig;
        }
        btn.disabled = false;
      });
    });
  },
};
