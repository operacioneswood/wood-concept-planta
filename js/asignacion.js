// ─────────────────────────────────────────────────────────────
// js/asignacion.js — Asignación tab: assign people+stage to OPs
// ─────────────────────────────────────────────────────────────

const Asignacion = {
  _collapsed:    new Set(),
  _ebanistas:    [],
  _fieldIds:     {},
  _planosMap:    {},
  _filterActive: false,

  render({ ops, ebanistas, dbData, fieldIds }) {
    this._ebanistas = ebanistas;
    this._fieldIds  = fieldIds || {};
    this._planosMap = App.buildPlanosMap(dbData);

    const body = el('asignacion-body');
    if (!ops.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Sin OPs activos para asignar.</p></div>';
      return;
    }

    const assignments = App.buildAssignments(dbData);
    const priority    = App.buildPriorities(dbData);
    const personasMap = App.buildPersonasMap(dbData);
    const groups      = this._groupByProject(ops, priority);

    const groupsHtml = [...groups.entries()].map(([proj, projOps]) =>
      this._renderGroup(proj, projOps, assignments, ebanistas, personasMap)
    ).join('');

    const activeCount = ops.filter(op => (assignments[op.id] || []).length > 0).length;

    body.innerHTML = `
      <div class="asign-search-wrap">
        <input type="search" id="asign-search" class="asign-search-input" placeholder="Buscar proyecto, número OP o nombre...">
        <button class="asign-filter-btn ${this._filterActive ? 'asign-filter-on' : ''}" id="asign-filter-btn" type="button">
          Activas <span class="asign-filter-count">${activeCount}</span>
        </button>
      </div>
      ${groupsHtml}
    `;

    this._bindEvents(ops, ebanistas, fieldIds || {});
    this._bindSearch();
  },

  _rerender() {
    const searchVal = document.getElementById('asign-search')?.value || '';
    const scrollY   = window.scrollY;
    App.renderAsignacion();
    const input = document.getElementById('asign-search');
    if (input && searchVal) {
      input.value = searchVal;
      input.dispatchEvent(new Event('input'));
    }
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
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

  _renderGroup(projName, projOps, assignments, ebanistas, personasMap = {}) {
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
            ${projOps.map(op => this._renderRow(op, assignments, ebanistas, personasMap)).join('')}
          </div>
        </div>
      </div>
    `;
  },

  _renderRow(op, assignments, ebanistas, personasMap = {}) {
    const opAssigns  = assignments[op.id] || [];
    const isAssigned = opAssigns.length > 0;
    const stage      = getCurrentStage(op)
      || opAssigns.find(a => a.stage && a.stage !== '_' && a.stage !== 'reproceso')?.stage
      || null;
    const hasRepro   = !!op.inicioReproceso && !op.finReproceso;

    // Determine if the person assigned to the current stage is a contratista
    const stageAssign    = stage ? opAssigns.find(a => a.stage === stage) : null;
    const stagePersonName = stageAssign?.person || '';
    const isContratista  = personasMap[stagePersonName] === 'contratista'
      || CONTRATISTAS_CONOCIDOS.has(stagePersonName.toLowerCase());
    const isContratistaEban = stage === 'ebanisteria' && isContratista;
    const inicioKey = stage ? (isContratistaEban ? 'inicioEbanisteria' : STAGE_INICIO[stage]) : null;
    const finKey    = stage ? (isContratistaEban ? 'finEbanisteria'    : STAGE_FIN[stage])    : null;

    const personOpts = ebanistas.map(n =>
      `<option value="${esc(n)}">${esc(n)}</option>`
    ).join('');

    const stageOpts = [
      `<option value="">— Etapa —</option>`,
      ...STAGES.map(s => `<option value="${s.id}">${s.label}</option>`),
      `<option value="reproceso">Reproceso</option>`,
    ].join('');

    const chips = opAssigns.map(a => {
      const subsList   = (a.subprocesos || '').split(',').filter(Boolean);
      const subsLabels = subsList.map(id => subproLabel(id));

      const chipPartes  = (App._dbData?.partes || []).filter(p => p.op_id === op.id && p.persona === a.person);
      const activeParts = chipPartes.filter(p => !p.fecha_fin);
      const doneParts   = chipPartes.filter(p => !!p.fecha_fin);
      const fmtP = iso => {
        if (!iso) return '';
        const d = new Date(iso + 'T12:00:00');
        const M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        return `${d.getDate()} ${M[d.getMonth()]}`;
      };
      const chipStage = a.stage || '_';
      const activeRows = activeParts.map(p => `
        <span class="chip-parte-tag" data-id="${esc(p.id)}">
          <span class="chip-parte-nombre">${esc(p.nombre)}</span>
          <span class="chip-parte-fecha">${fmtP(p.fecha_inicio)}</span>
          <button class="btn-chip-fin-parte" data-id="${esc(p.id)}">✓ Fin</button>
          <button class="btn-chip-del-parte" data-id="${esc(p.id)}">✕</button>
        </span>`).join('');
      const doneRows = doneParts.map(p => {
        const days = p.fecha_inicio && p.fecha_fin ? Math.round((new Date(p.fecha_fin)-new Date(p.fecha_inicio))/86400000) : null;
        return `<span class="chip-parte-tag chip-parte-done">
          <span class="chip-parte-nombre">${esc(p.nombre)}</span>
          <span class="chip-parte-fecha">${fmtP(p.fecha_inicio)}→${fmtP(p.fecha_fin)}${days!==null?` (${days}d)`:''}</span>
          <button class="btn-chip-del-parte" data-id="${esc(p.id)}">✕</button>
        </span>`;
      }).join('');
      const parteOpts = PARTES_PREDEFINIDAS.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
        `<option value="_otro">Otro...</option>`;

      return `
        <div class="asign-chip" data-op="${esc(op.id)}" data-person="${esc(a.person)}" data-stage="${esc(a.stage || '')}">
          <span class="chip-name">${esc(a.person)}</span>
          ${a.stage && a.stage !== '_' ? `<span class="chip-stage">${esc(STAGE_LABELS[a.stage] || a.stage)}</span>` : ''}
          ${subsLabels.length ? `<span class="chip-subs">${subsLabels.map(esc).join(', ')}</span>` : ''}
          ${chipPartes.length ? `<div class="chip-partes">${activeRows}${doneRows}</div>` : ''}
          <div class="chip-partes-add-form" style="display:none"
               data-opid="${esc(op.id)}" data-persona="${esc(a.person)}" data-stage="${esc(chipStage)}">
            <select class="chip-parte-sel">${parteOpts}</select>
            <input class="chip-parte-custom" type="text" placeholder="Nombre..." style="display:none">
            <input class="chip-parte-fecha-inp" type="date" value="${todayIso()}">
            <button class="btn-chip-save-parte btn-primary btn-sm">✓</button>
            <button class="btn-chip-cancel-parte btn-sm">✕</button>
          </div>
          <input type="text" class="chip-comment"
            data-op="${esc(op.id)}" data-person="${esc(a.person)}" data-stage="${esc(a.stage || '')}"
            value="${esc(a.comentario || '')}" placeholder="Qué hizo...">
          <div class="chip-footer-row">
            <button class="btn-add-chip-parte">+ Parte</button>
            <button class="btn-chip-fin"    data-op="${esc(op.id)}" data-person="${esc(a.person)}" data-stage="${esc(a.stage || '')}">■ Fin</button>
            <button class="btn-chip-remove" data-op="${esc(op.id)}" data-person="${esc(a.person)}" data-stage="${esc(a.stage || '')}">✕</button>
          </div>
        </div>
      `;
    }).join('');

    const searchText = `${op.project || ''} ${op.noOp || ''} ${op.name || ''}`.toLowerCase();

    return `
      <div class="asign-card ${isAssigned ? 'asign-row-assigned' : 'asign-row-empty'}" data-op-id="${esc(op.id)}" data-search="${esc(searchText)}">
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
            <button class="btn-stage-inicio btn-sm"
              data-op="${esc(op.id)}"
              data-stage="${esc(stage || '')}"
              data-iniciokey="${esc(inicioKey || '')}"
              data-iscontratista="${isContratista ? '1' : '0'}"
              data-person="${esc(stagePersonName)}"
              title="Marcar inicio de etapa hoy">▶ Inicio</button>
            ${(() => {
              if (!stage || !finKey) return '';
              const fieldId  = this._fieldIds[finKey] || '';
              const stageOpen = inicioKey && op[inicioKey] && !op[finKey];
              if (!stageOpen || !fieldId) return '';
              return `<button class="btn-cerrar-etapa btn-sm"
                data-op="${esc(op.id)}"
                data-stage="${esc(stage)}"
                data-fieldid="${esc(fieldId)}"
                data-datekey="${esc(finKey)}"
                title="Marcar fin de ${esc(STAGE_LABELS[stage])} en ClickUp">
                ✓ Cerrar ${esc(STAGE_LABELS[stage])}
              </button>`;
            })()}
          </div>
        </div>
        ${opAssigns.length > 0 ? `<div class="asign-chips">${chips}</div>` : ''}
        <div class="asign-plano-row">
          <span class="asign-plano-icon">📐</span>
          <span class="asign-plano-lbl">Plano:</span>
          <select class="asign-plano-sel" data-op="${esc(op.id)}">
            <option value="">— Nadie —</option>
            ${ebanistas.map(n => `<option value="${esc(n)}" ${this._planosMap[op.id] === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </div>
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
          <button class="btn-tiempos-asign btn-secondary btn-sm" data-op="${esc(op.id)}">⏱</button>
        </div>
        <div class="asign-subprocesos" id="asign-sub-${esc(op.id)}" style="display:none"></div>
      </div>
    `;
  },

  _bindSearch() {
    const searchInput = document.getElementById('asign-search');
    const filterBtn   = document.getElementById('asign-filter-btn');

    const applyFilters = () => {
      const q = searchInput?.value.toLowerCase().trim() || '';
      document.querySelectorAll('.asign-card').forEach(card => {
        const matchSearch = !q || (card.dataset.search || '').includes(q);
        const matchFilter = !this._filterActive || card.classList.contains('asign-row-assigned');
        card.style.display = (matchSearch && matchFilter) ? '' : 'none';
      });
      document.querySelectorAll('.asign-group').forEach(group => {
        const anyVisible = [...group.querySelectorAll('.asign-card')].some(c => c.style.display !== 'none');
        group.style.display = anyVisible ? '' : 'none';
      });
    };

    searchInput?.addEventListener('input', applyFilters);

    filterBtn?.addEventListener('click', () => {
      this._filterActive = !this._filterActive;
      filterBtn.classList.toggle('asign-filter-on', this._filterActive);
      applyFilters();
    });

    if (this._filterActive || searchInput?.value) applyFilters();
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

    // ── Plano holder ─────────────────────────────────────────
    document.querySelectorAll('.asign-plano-sel').forEach(sel => {
      sel.addEventListener('change', async () => {
        const opId   = sel.dataset.op;
        const persona = sel.value;
        if (persona) {
          App._dbData.planos = App._dbData.planos.filter(p => p.op_id !== opId);
          App._dbData.planos.push({ op_id: opId, persona });
          this._planosMap[opId] = persona;
          DB.setPlano(opId, persona).catch(e => console.warn('[Asignacion] plano save:', e.message));
        } else {
          App._dbData.planos = App._dbData.planos.filter(p => p.op_id !== opId);
          delete this._planosMap[opId];
          DB.removePlano(opId).catch(e => console.warn('[Asignacion] plano remove:', e.message));
        }
        App.renderPanel();
      });
    });

    // ── Stage select → show sub-process checkboxes ────────────
    document.querySelectorAll('.asign-stage').forEach(sel => {
      sel.addEventListener('change', () => {
        const opId        = sel.dataset.op;
        const stageVal    = sel.value;
        const subContainer = document.getElementById(`asign-sub-${opId}`);
        if (!subContainer) return;
        const subs = STAGE_SUBPROCESOS[stageVal] || [];
        if (!subs.length) {
          subContainer.style.display = 'none';
          subContainer.innerHTML = '';
          return;
        }
        subContainer.style.display = 'flex';
        subContainer.innerHTML = `
          <span class="subpro-lbl">Subprocesos:</span>
          ${subs.map(s => `
            <label class="subpro-chk">
              <input type="checkbox" class="subpro-input" value="${esc(s.id)}">
              ${esc(s.label)}
            </label>
          `).join('')}
        `;
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

        // Collect sub-processes
        const subContainer = document.getElementById(`asign-sub-${opId}`);
        const checkedSubs  = [...(subContainer?.querySelectorAll('.subpro-input:checked') || [])]
          .map(c => c.value).join(',');

        // Upsert in local cache (by op+persona+stage)
        App._dbData.asignaciones = App._dbData.asignaciones.filter(
          a => !(a.op_id === opId && a.persona === person && a.etapa === (stage || '_'))
        );
        App._dbData.asignaciones.push({
          op_id: opId, etapa: stage || '_', persona: person,
          fecha_asignacion: date || todayIso(), comentario: '',
          subprocesos: checkedSubs,
        });

        App.renderPanel();
        rerender();

        try {
          await DB.setAsignacion(opId, stage || '_', person, date || null, null);
          if (checkedSubs) {
            await DB.updateSubprocesos(opId, stage || '_', person, checkedSubs)
              .catch(e => console.warn('[Asignacion] subprocesos column may not exist:', e.message));
          }
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

    // ── ⏱ Tiempos ─────────────────────────────────────────────
    document.querySelectorAll('.btn-tiempos-asign').forEach(btn => {
      btn.addEventListener('click', () => {
        const op = App._data?.ops.find(o => o.id === btn.dataset.op);
        if (op) Tiempos.open(op);
      });
    });

    // ── Chip comment save ────────────────────────────────────
    document.querySelectorAll('.chip-comment').forEach(input => {
      input.addEventListener('change', async () => {
        const opId      = input.dataset.op;
        const person    = input.dataset.person;
        const stage     = input.dataset.stage;
        const comentario = input.value;
        const row = App._dbData.asignaciones.find(
          a => a.op_id === opId && a.persona === person && a.etapa === stage
        );
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

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;

        try {
          const chip        = btn.closest('.asign-chip');
          const comentario  = chip?.querySelector('.chip-comment')?.value || '';
          const op          = App._data?.ops.find(o => o.id === opId);
          const today       = todayIso();
          const inicioKey   = STAGE_INICIO[stage];
          const fechaInicio = op?.[inicioKey] ? op[inicioKey].toISOString().slice(0, 10) : null;

          // Grab sub-processes from assignment before it's removed
          const assignRow   = App._dbData.asignaciones.find(a => a.op_id === opId && a.persona === person && a.etapa === stage);
          const subprocesos = assignRow?.subprocesos || '';

          const histEntry = { op_id: opId, etapa: stage, persona: person, fecha_inicio: fechaInicio, fecha_fin: today, es_reproceso: false, comentario, subprocesos };
          App._dbData.historial = (App._dbData.historial || []).filter(
            h => !(h.op_id === opId && h.etapa === stage && h.persona === person)
          );
          App._dbData.historial.unshift(histEntry);
          DB.upsertHistorial(histEntry).catch(e => console.warn('[Asignacion] historial:', e.message));

          App._dbData.asignaciones = App._dbData.asignaciones.filter(
            a => !(a.op_id === opId && a.persona === person && a.etapa === stage)
          );
          DB.removeAsignacion(opId, person, stage).catch(e => console.warn('[Asignacion] remove:', e.message));

          App.renderPanel();
          Proyectos.render({ ...App._data, dbData: App._dbData });
          rerender();

        } catch (e) {
          alert('Error: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });

    // ── Chip ✕ remove ────────────────────────────────────────
    document.querySelectorAll('.btn-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const opId   = btn.dataset.op;
        const person = btn.dataset.person;
        const stage  = btn.dataset.stage;
        App._dbData.asignaciones = App._dbData.asignaciones.filter(
          a => !(a.op_id === opId && a.persona === person && a.etapa === stage)
        );
        App.renderPanel();
        DB.removeAsignacion(opId, person, stage || null).catch(e => console.warn('[Asignacion] remove:', e.message));
        rerender();
      });
    });

    // ── ✓ Cerrar etapa ────────────────────────────────────────
    document.querySelectorAll('.btn-cerrar-etapa').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId   = btn.dataset.op;
        const stage  = btn.dataset.stage;
        const fieldId = btn.dataset.fieldid;
        const dateKey = btn.dataset.datekey;
        const label  = STAGE_LABELS[stage] || stage;

        if (!fieldId) { alert('Campo de fin no encontrado en ClickUp'); return; }
        if (!confirm(`¿Confirmar cierre de ${label}?\nEsto marcará la fecha de fin en ClickUp y el OP avanzará a la siguiente etapa.`)) return;

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;

        try {
          const op = App._data?.ops.find(o => o.id === opId);
          await PlantaAPI.setField(opId, fieldId, Date.now());
          if (op) op[dateKey] = new Date();
          PlantaAPI.clearCache();
          Proyectos.render({ ...App._data, dbData: App._dbData });
          rerender();
        } catch (e) {
          alert('Error al cerrar etapa: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });

    // ── ▶ Inicio ──────────────────────────────────────────────
    document.querySelectorAll('.btn-stage-inicio').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId  = btn.dataset.op;
        const op    = App._data?.ops.find(o => o.id === opId);
        const stage = btn.dataset.stage || getCurrentStage(op);
        if (!stage) { alert('No hay etapa asignada para este OP'); return; }

        // Use pre-computed key from dataset (handles contratista case)
        const dateKey = btn.dataset.iniciokey || STAGE_INICIO[stage];
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

          // For contratistas doing ebanistería, also fill the Ebanista dropdown
          if (btn.dataset.iscontratista === '1' && stage === 'ebanisteria') {
            const personName  = btn.dataset.person || '';
            const ebanistaOpts = fieldIds?.ebanistaOpts || {};
            const optId = ebanistaOpts[normStr(personName)];
            if (optId && fieldIds?.ebanista) {
              await PlantaAPI.setField(opId, fieldIds.ebanista, optId).catch(e =>
                console.warn('[Inicio] No se pudo asignar ebanista dropdown:', e.message)
              );
            }
          }

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

    // ── Partes desde Asignación ───────────────────────────────

    document.querySelectorAll('.btn-add-chip-parte').forEach(btn => {
      btn.addEventListener('click', () => {
        const chip = btn.closest('.asign-chip');
        const form = chip.querySelector('.chip-partes-add-form');
        const showing = form.style.display !== 'none';
        form.style.display = showing ? 'none' : 'flex';
      });
    });

    document.querySelectorAll('.chip-parte-sel').forEach(sel => {
      sel.addEventListener('change', () => {
        const form   = sel.closest('.chip-partes-add-form');
        const custom = form.querySelector('.chip-parte-custom');
        custom.style.display = sel.value === '_otro' ? '' : 'none';
        if (sel.value === '_otro') custom.focus();
      });
    });

    document.querySelectorAll('.btn-chip-cancel-parte').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.chip-partes-add-form').style.display = 'none';
      });
    });

    document.querySelectorAll('.btn-chip-save-parte').forEach(btn => {
      btn.addEventListener('click', async () => {
        const form   = btn.closest('.chip-partes-add-form');
        const sel    = form.querySelector('.chip-parte-sel');
        const custom = form.querySelector('.chip-parte-custom');
        const fecha  = form.querySelector('.chip-parte-fecha-inp');
        const nombre = sel.value === '_otro' ? custom.value.trim() : sel.value;
        if (!nombre) { (sel.value === '_otro' ? custom : sel).focus(); return; }

        const orig = btn.textContent; btn.textContent = '...'; btn.disabled = true;
        try {
          const row = await DB.addParte({
            op_id:        form.dataset.opid,
            etapa:        form.dataset.stage,
            persona:      form.dataset.persona,
            nombre,
            fecha_inicio: fecha.value || todayIso(),
          });
          App._dbData.partes = App._dbData.partes || [];
          App._dbData.partes.push(row);
          App.renderPanel();
          rerender();
        } catch (e) {
          alert('Error al guardar parte: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('.btn-chip-fin-parte').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.id;
        const orig = btn.textContent; btn.textContent = '...'; btn.disabled = true;
        try {
          const today = todayIso();
          await DB.finParte(id, today);
          const p = (App._dbData.partes || []).find(p => p.id === id);
          if (p) p.fecha_fin = today;
          App.renderPanel();
          rerender();
        } catch (e) {
          alert('Error: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('.btn-chip-del-parte').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta parte?')) return;
        try {
          await DB.deleteParte(btn.dataset.id);
          App._dbData.partes = (App._dbData.partes || []).filter(p => p.id !== btn.dataset.id);
          App.renderPanel();
          rerender();
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    });
  },
};
