// ─────────────────────────────────────────────────────────────
// js/asignacion.js — Asignación tab: assign person+stage to OPs
// ─────────────────────────────────────────────────────────────

const Asignacion = {

  render({ ops, ebanistas }) {
    const assignments = Storage.getAssignments();

    const body = el('asignacion-body');
    if (!ops.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Sin OPs activos para asignar.</p></div>';
      return;
    }

    const priority    = Storage.getPriority();
    const sortedOps   = [
      ...priority.map(id => ops.find(o => o.id === id)).filter(Boolean),
      ...ops.filter(o => !priority.includes(o.id)),
    ];

    body.innerHTML = `
      <div class="asign-table">
        <div class="asign-table-head">
          <div>OP / Tarea</div>
          <div>Proyecto</div>
          <div>Etapa actual</div>
          <div>Persona</div>
          <div>Etapa asignada</div>
          <div>Fecha estimada</div>
          <div>Acciones</div>
        </div>
        ${sortedOps.map(op => this._renderRow(op, assignments, ebanistas)).join('')}
      </div>
    `;

    this._bindEvents(sortedOps, ebanistas);
  },

  _renderRow(op, assignments, ebanistas) {
    const a     = assignments[op.id];
    const stage = getCurrentStage(op);

    const personOptions = ebanistas.map(name =>
      `<option value="${esc(name)}" ${a?.person === name ? 'selected' : ''}>${esc(name)}</option>`
    ).join('');

    const stageOptions = [
      `<option value="">— Etapa —</option>`,
      ...STAGES.map(s => `<option value="${s.id}" ${a?.stage === s.id ? 'selected' : ''}>${s.label}</option>`),
      `<option value="reproceso" ${a?.stage === 'reproceso' ? 'selected' : ''}>Reproceso</option>`,
    ].join('');

    const hasReproceso = !!op.inicioReproceso && !op.finReproceso;

    return `
      <div class="asign-row ${a?.person ? 'asign-row-assigned' : 'asign-row-empty'}" data-op-id="${esc(op.id)}">
        <div class="asign-name">
          ${esc(op.name)}
          ${hasReproceso ? '<span class="badge-reproceso-sm">Reproceso</span>' : ''}
        </div>
        <div class="muted-txt asign-project">${esc(op.project || '—')}</div>
        <div>
          ${stage ? `<span class="stage-pill-sm" style="color:${STAGE_COLORS[stage]}">${esc(STAGE_LABELS[stage])}</span>` : '<span class="muted-txt">—</span>'}
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
          <button class="btn-save-asign btn-primary btn-sm" data-op="${esc(op.id)}" title="Guardar asignación">✓</button>
          <button class="btn-complete-op btn-secondary btn-sm" data-op="${esc(op.id)}" data-name="${esc(op.name)}" title="Marcar como completado">✔ Listo</button>
        </div>
      </div>
    `;
  },

  _bindEvents(ops, ebanistas) {
    // Save assignment
    document.querySelectorAll('.btn-save-asign').forEach(btn => {
      btn.addEventListener('click', () => {
        const opId  = btn.dataset.op;
        const row   = document.querySelector(`.asign-row[data-op-id="${opId}"]`);
        if (!row) return;
        const person        = row.querySelector('.asign-person').value;
        const stage         = row.querySelector('.asign-stage').value;
        const estimatedDate = row.querySelector('.asign-date').value;

        if (person || stage) {
          Storage.setAssignment(opId, { person, stage, estimatedDate });
          row.classList.toggle('asign-row-assigned', !!person);
          row.classList.toggle('asign-row-empty', !person);
          btn.textContent = '✓ Guardado';
          btn.style.background = '#166534';
          setTimeout(() => { btn.textContent = '✓'; btn.style.background = ''; }, 1500);
          App.renderPanel();
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
      sel.addEventListener('change', () => {
        const opId  = sel.dataset.op;
        const row   = document.querySelector(`.asign-row[data-op-id="${opId}"]`);
        if (!row) return;
        const person        = row.querySelector('.asign-person').value;
        const stage         = row.querySelector('.asign-stage').value;
        const estimatedDate = row.querySelector('.asign-date').value;
        Storage.setAssignment(opId, { person, stage, estimatedDate });
        App.renderPanel();
      });
    });
  },
};
