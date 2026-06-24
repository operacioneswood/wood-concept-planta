// ─────────────────────────────────────────────────────────────
// js/tablero.js — Tablero tab: priority board + production log
// ─────────────────────────────────────────────────────────────

const Tablero = {

  render({ ops, dbData }) {
    this._renderPriority(ops, dbData);
    this._renderContratistas(ops, dbData);
  },

  // ── Left column: priority order (by project) ─────────────
  _renderPriority(ops, dbData) {
    const priority = App.buildPriorities(dbData);

    const projectMap = new Map();
    for (const op of ops) {
      const proj = op.project || '(Sin proyecto)';
      if (!projectMap.has(proj)) projectMap.set(proj, []);
      projectMap.get(proj).push(op);
    }

    const allProjects = [...projectMap.keys()];
    const orderedProjects = [
      ...priority.filter(name => projectMap.has(name)),
      ...allProjects.filter(name => !priority.includes(name)),
    ];

    el('tablero-prio-count').textContent = orderedProjects.length;

    const list = el('tablero-prio-list');
    if (!orderedProjects.length) {
      list.innerHTML = '<div class="empty-state-sm">Sin OPs activos</div>';
      return;
    }

    list.innerHTML = orderedProjects.map((proj, idx) => {
      const projOps = projectMap.get(proj) || [];
      const statuses = [...new Set(projOps.map(op => op.status))];
      const anyRepro = projOps.some(op => !!op.inicioReproceso && !op.finReproceso);
      const isFirst  = idx === 0;
      const isLast   = idx === orderedProjects.length - 1;
      return `
        <div class="tablero-item" data-id="${esc(proj)}" data-name="${esc(proj)}">
          <div class="tablero-move-col">
            <button class="tablero-move-btn" data-dir="up" data-id="${esc(proj)}" ${isFirst ? 'disabled' : ''}>▲</button>
            <button class="tablero-move-btn" data-dir="dn" data-id="${esc(proj)}" ${isLast  ? 'disabled' : ''}>▼</button>
          </div>
          <span class="tablero-rank">${idx + 1}</span>
          <div class="tablero-item-info">
            <div class="tablero-item-name">${esc(proj)}</div>
            <div class="tablero-item-meta">
              <span>${projOps.length} OP${projOps.length !== 1 ? 's' : ''}</span>
              ${anyRepro ? '<span class="badge-reproceso-sm">Reproceso</span>' : ''}
              ${statuses.map(s => this._statusBadgeSm(s)).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this._bindMoveButtons(list);
  },

  _bindMoveButtons(list) {
    list.querySelectorAll('.tablero-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir    = btn.dataset.dir;
        const projId = btn.dataset.id;
        const items  = [...list.querySelectorAll('.tablero-item')];
        const ids    = items.map(i => i.dataset.id);
        const idx    = ids.indexOf(projId);

        if (dir === 'up' && idx > 0) {
          [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
        } else if (dir === 'dn' && idx < ids.length - 1) {
          [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
        } else {
          return;
        }

        const rows = ids.map(id => ({
          proyecto_id:     id,
          proyecto_nombre: items.find(i => i.dataset.id === id)?.dataset.name || '',
        }));
        App._dbData.prioridades = rows.map((r, i) => ({ ...r, orden: i }));
        DB.setPrioridades(rows).catch(e => console.error('[Tablero] priority save failed:', e.message));
        Tablero._renderPriority(App._data?.ops || [], App._dbData);
      });
    });
  },

  // ── Right column: active OPs assigned to contratistas ────
  _renderContratistas(ops, dbData) {
    const assignments  = App.buildAssignments(dbData);
    const contratistas = (dbData?.personas || [])
      .filter(p => p.tipo === 'contratista' && p.activo)
      .map(p => p.nombre)
      .sort();

    el('tablero-prod-count').textContent = contratistas.length;

    const container = el('tablero-prod-list');

    if (!contratistas.length) {
      container.innerHTML = '<div class="empty-state-sm">Sin contratistas registrados</div>';
      return;
    }

    const opMap = Object.fromEntries(ops.map(o => [o.id, o]));

    container.innerHTML = contratistas.map(name => {
      const myOpIds = Object.entries(assignments)
        .filter(([, arr]) => arr.some(a => a.person === name))
        .map(([opId]) => opId);
      const myOps = myOpIds.map(id => opMap[id]).filter(Boolean);

      return `
        <div class="prod-log-item">
          <div class="prod-log-top">
            <span class="prod-log-name">${esc(name)}</span>
            ${myOps.length ? `<span class="tbl-assignee">${myOps.length} OP${myOps.length !== 1 ? 's' : ''}</span>` : '<span class="muted-txt">Sin asignar</span>'}
          </div>
          ${myOps.map(op => {
            const stage = getCurrentStage(op);
            return `
              <div class="prod-log-meta" style="margin-top:4px">
                <span style="font-size:12px">${esc(op.name)}</span>
                ${stage ? `<span class="stage-pill-sm" style="color:${STAGE_COLORS[stage]}">${esc(STAGE_LABELS[stage])}</span>` : ''}
                ${this._statusBadgeSm(op.status)}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');
  },

  _statusBadgeSm(status) {
    const info = STATUS_DISPLAY[status] || { label: status || '—', cls: 'sb-other' };
    return `<span class="status-badge-sm ${info.cls}">${esc(info.label)}</span>`;
  },
};
