// ─────────────────────────────────────────────────────────────
// js/tablero.js — Tablero tab: priority board + production log
// ─────────────────────────────────────────────────────────────

const Tablero = {
  _dragging: null,

  render({ ops, dbData }) {
    this._renderPriority(ops, dbData);
    this._renderContratistas(ops, dbData);
  },

  // ── Left column: priority order (by project) ─────────────
  _renderPriority(ops, dbData) {
    const priority = App.buildPriorities(dbData); // array of project names

    // Group OPs by project
    const projectMap = new Map();
    for (const op of ops) {
      const proj = op.project || '(Sin proyecto)';
      if (!projectMap.has(proj)) projectMap.set(proj, []);
      projectMap.get(proj).push(op);
    }

    // Merge saved order with live projects (new ones appended)
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
      return `
        <div class="tablero-item" draggable="true" data-id="${esc(proj)}" data-name="${esc(proj)}">
          <span class="drag-handle">⠿</span>
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

    this._bindDragDrop(list);
  },

  _bindDragDrop(list) {
    const items = list.querySelectorAll('.tablero-item');
    items.forEach(item => {
      item.addEventListener('dragstart', e => {
        this._dragging = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this._dragging = null;
        this._savePriorityFromDOM(list);
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        if (!this._dragging || this._dragging === item) return;
        const rect = item.getBoundingClientRect();
        const mid  = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          list.insertBefore(this._dragging, item);
        } else {
          list.insertBefore(this._dragging, item.nextSibling);
        }
      });
    });
  },

  _savePriorityFromDOM(list) {
    const rows = [...list.querySelectorAll('.tablero-item')].map(el => ({
      proyecto_id:     el.dataset.id,
      proyecto_nombre: el.dataset.name || '',
    }));
    // Update ranks visually
    list.querySelectorAll('.tablero-rank').forEach((span, i) => {
      span.textContent = i + 1;
    });
    // Update local cache immediately
    App._dbData.prioridades = rows.map((r, i) => ({ ...r, orden: i }));
    // Persist to Supabase (fire-and-forget)
    DB.setPrioridades(rows).catch(e => console.error('[Tablero] priority save failed:', e.message));
  },

  // ── Right column: active OPs assigned to contratistas ────
  _renderContratistas(ops, dbData) {
    const assignments  = App.buildAssignments(dbData);
    const personasMap  = App.buildPersonasMap(dbData);

    // All contractor names (from personas table)
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

    // Build op map for quick lookup
    const opMap = Object.fromEntries(ops.map(o => [o.id, o]));

    container.innerHTML = contratistas.map(name => {
      // Find all OPs assigned to this contractor
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
