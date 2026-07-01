// ─────────────────────────────────────────────────────────────
// js/panel.js — Panel tab: per-person workload overview
// ─────────────────────────────────────────────────────────────

const Panel = {
  _fieldIds:  {},
  _planosMap: {},

  render({ ops, ebanistas, dbData, fieldIds }) {
    this._fieldIds  = fieldIds || {};
    this._planosMap = App.buildPlanosMap(dbData);
    const assignments = App.buildAssignments(dbData);
    const personasMap = App.buildPersonasMap(dbData);

    const personData = ebanistas.map(name => {
      const role  = personasMap[name] || 'ebanista';
      const myOps = ops.filter(op => (assignments[op.id] || []).some(a => a.person === name));
      return { name, role, myOps };
    });

    const ebanistasData    = personData.filter(p => p.role === 'ebanista');
    const pintoresData     = personData.filter(p => p.role === 'pintor');
    const contratistasData = personData.filter(p => p.role === 'contratista');
    const unknownData      = personData.filter(p => !personasMap[p.name]);

    const plantaPeople  = [...ebanistasData, ...pintoresData, ...(ebanistasData.length ? [] : unknownData)];
    const unassignedOps = ops.filter(op => !(assignments[op.id]?.length > 0));
    const noWorkPeople  = plantaPeople.filter(p => p.myOps.length === 0);

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

    const noWorkNames = noWorkPeople.map(p => esc(p.name)).join(', ');
    el('panel-body').innerHTML = `
      ${noWorkPeople.length ? `<div class="panel-alert-banner">⚠ Sin asignación: ${noWorkNames}</div>` : ''}
      ${this._renderSection('Ebanistas', ebanistasData.length ? ebanistasData : unknownData, assignments)}
      ${contratistasData.length ? this._renderSection('Contratistas', contratistasData, assignments) : ''}
      ${pintoresData.length     ? this._renderSection('Pintores', pintoresData, assignments) : ''}
      ${ops.length === 0 ? '<div class="empty-state"><div class="empty-icon">🏭</div><p>Sin OPs activos en planta.</p><p class="muted">Verifica la conexión en ⚙ Configuración.</p></div>' : ''}
    `;

    this._bindMove();
    this._bindActions();
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

    const savedOrder = this._getOrder(name);
    const orderedOps = savedOrder.length
      ? [...myOps].sort((a, b) => {
          const ai = savedOrder.indexOf(a.id);
          const bi = savedOrder.indexOf(b.id);
          return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
        })
      : myOps;

    const taskList = orderedOps.map((op, idx) => {
      const personAssigns = (assignments[op.id] || []).filter(x => x.person === name);

      // Earliest assignment date for this person+OP
      const assignDate = personAssigns.reduce((earliest, a) => {
        if (!a.estimatedDate) return earliest;
        return (!earliest || a.estimatedDate < earliest) ? a.estimatedDate : earliest;
      }, null);
      const assignDateFmt = assignDate ? fmtDate(isoToDate(assignDate)) : null;

      const stageInfos = personAssigns.map(a => {
        const stageId    = a.stage && a.stage !== '_' && a.stage !== 'reproceso' ? a.stage : null;
        const stageLabel = stageId ? STAGE_LABELS[stageId] : null;
        const stageColor = stageId ? STAGE_COLORS[stageId] : null;
        const inicioKey  = stageId ? STAGE_INICIO[stageId] : null;
        const finKey     = stageId ? STAGE_FIN[stageId]    : null;
        const stageStarted = inicioKey && op[inicioKey];
        const stageClosed  = finKey && op[finKey];
        const fieldId      = finKey ? (this._fieldIds[finKey] || '') : '';
        const showCerrar   = stageStarted && !stageClosed && fieldId;

        // Sub-process labels for this stage
        const subsList   = (a.subprocesos || '').split(',').filter(Boolean);
        const subsLabels = subsList.map(id => subproLabel(id));

        return { stageId, stageLabel, stageColor, finKey, fieldId, showCerrar, subsLabels };
      });

      const pills = stageInfos
        .filter(s => s.stageLabel)
        .map(s => {
          const subsHtml = s.subsLabels.length
            ? `<span class="panel-subs-lbl">${s.subsLabels.map(esc).join(', ')}</span>`
            : '';
          return `<span class="stage-pill-sm" style="color:${s.stageColor}">${esc(s.stageLabel)}</span>${subsHtml}`;
        })
        .join('');

      const finBtns = stageInfos
        .filter(s => s.stageId)
        .map(s => `
          <button class="panel-btn-fin"
            data-op="${esc(op.id)}"
            data-person="${esc(name)}"
            data-stage="${esc(s.stageId)}">■ Fin${stageInfos.length > 1 ? ' ' + esc(s.stageLabel) : ''}</button>
        `).join('');

      const cerrarBtns = stageInfos
        .filter(s => s.showCerrar)
        .map(s => `
          <button class="panel-btn-cerrar"
            data-op="${esc(op.id)}"
            data-stage="${esc(s.stageId)}"
            data-fieldid="${esc(s.fieldId)}"
            data-datekey="${esc(s.finKey)}">✓ Cerrar${stageInfos.length > 1 ? ' ' + esc(s.stageLabel) : ''}</button>
        `).join('');

      const isFirst = idx === 0;
      const isLast  = idx === orderedOps.length - 1;

      return `
        <div class="panel-task-row ${isFirst ? 'panel-task-current' : ''}"
             data-person="${esc(name)}"
             data-opid="${esc(op.id)}">
          <div class="panel-move-btns">
            <button class="panel-move-btn" data-dir="up" data-person="${esc(name)}" data-opid="${esc(op.id)}" ${isFirst ? 'disabled' : ''}>▲</button>
            <button class="panel-move-btn" data-dir="dn" data-person="${esc(name)}" data-opid="${esc(op.id)}" ${isLast  ? 'disabled' : ''}>▼</button>
          </div>
          ${op.noOp    ? `<span class="panel-op-num">${esc(op.noOp)}</span>` : ''}
          ${op.project ? `<span class="panel-proj-lbl">${esc(op.project)}</span>` : ''}
          <span class="panel-task-name">${esc(op.name)}</span>
          ${assignDateFmt ? `<span class="panel-assign-date">Asig. ${assignDateFmt}</span>` : ''}
          ${this._planosMap[op.id] ? `<span class="panel-plano-lbl">📐 ${esc(this._planosMap[op.id])}</span>` : ''}
          ${pills}
          <div class="panel-task-actions">
            ${finBtns}
            ${cerrarBtns}
          </div>
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

  // ── Order persistence ─────────────────────────────────────
  // Primary: in-memory map (survives auto-refresh re-renders).
  // Backup: localStorage (survives F5 / browser refresh).
  _orders: {},   // { [personName]: [opId, opId, ...] }

  _getOrder(name) {
    // In-memory takes priority — always up-to-date within the session
    if (this._orders[name]?.length) return this._orders[name];
    // Fallback to localStorage on first load
    try {
      const saved = JSON.parse(localStorage.getItem('wp_panel_order_' + name));
      if (Array.isArray(saved) && saved.length) {
        this._orders[name] = saved;   // warm the in-memory cache
        return saved;
      }
    } catch {}
    return [];
  },

  _setOrder(name, ids) {
    this._orders[name] = ids;         // always update in-memory
    try { localStorage.setItem('wp_panel_order_' + name, JSON.stringify(ids)); }
    catch (e) { console.warn('[Panel] order save failed:', e.message); }
  },

  // ── ▲/▼ move buttons ─────────────────────────────────────
  _bindMove() {
    document.querySelectorAll('.panel-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir    = btn.dataset.dir;
        const person = btn.dataset.person;
        const opid   = btn.dataset.opid;

        const container = btn.closest('.panel-tasks-col');
        if (!container) return;
        const allRows = [...container.querySelectorAll('.panel-task-row[data-opid]')];
        const ids     = allRows.map(r => r.dataset.opid);
        const idx     = ids.indexOf(opid);

        if (dir === 'up' && idx > 0) {
          [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
        } else if (dir === 'dn' && idx < ids.length - 1) {
          [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
        } else {
          return;
        }

        this._setOrder(person, ids);
        App.renderPanel();
      });
    });
  },

  // ── Fin / Cerrar actions ─────────────────────────────────
  _bindActions() {
    // ■ Fin — logs historial, removes assignment for that specific stage
    document.querySelectorAll('.panel-btn-fin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId   = btn.dataset.op;
        const person = btn.dataset.person;
        const stage  = btn.dataset.stage;

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;

        try {
          const op         = App._data?.ops.find(o => o.id === opId);
          const today      = todayIso();
          const inicioKey  = STAGE_INICIO[stage];
          const fechaInicio = op?.[inicioKey] ? op[inicioKey].toISOString().slice(0, 10) : null;

          // Grab sub-processes from assignment before it's removed
          const assignRow   = App._dbData.asignaciones.find(a => a.op_id === opId && a.persona === person && a.etapa === stage);
          const subprocesos = assignRow?.subprocesos || '';

          const histEntry = {
            op_id: opId, etapa: stage, persona: person,
            fecha_inicio: fechaInicio, fecha_fin: today,
            es_reproceso: false, comentario: '', subprocesos,
          };
          App._dbData.historial = (App._dbData.historial || []).filter(
            h => !(h.op_id === opId && h.etapa === stage && h.persona === person)
          );
          App._dbData.historial.unshift(histEntry);
          DB.upsertHistorial(histEntry).catch(e => console.warn('[Panel] historial:', e.message));

          App._dbData.asignaciones = App._dbData.asignaciones.filter(
            a => !(a.op_id === opId && a.persona === person && a.etapa === stage)
          );
          DB.removeAsignacion(opId, person, stage).catch(e => console.warn('[Panel] remove:', e.message));

          App.renderPanel();
          Proyectos.render({ ...App._data, dbData: App._dbData });
          Asignacion._rerender();
        } catch (e) {
          alert('Error: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });

    // ✓ Cerrar etapa — sets ClickUp fin date
    document.querySelectorAll('.panel-btn-cerrar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId   = btn.dataset.op;
        const stage  = btn.dataset.stage;
        const fieldId = btn.dataset.fieldid;
        const dateKey = btn.dataset.datekey;
        const label  = STAGE_LABELS[stage] || stage;

        if (!confirm(`¿Confirmar cierre de ${label}?\nEsto marcará la fecha de fin en ClickUp.`)) return;

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;

        try {
          const op = App._data?.ops.find(o => o.id === opId);
          await PlantaAPI.setField(opId, fieldId, Date.now());
          if (op) op[dateKey] = new Date();
          PlantaAPI.clearCache();
          App.renderPanel();
          Proyectos.render({ ...App._data, dbData: App._dbData });
          Asignacion._rerender();
        } catch (e) {
          alert('Error al cerrar etapa: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });
  },
};
