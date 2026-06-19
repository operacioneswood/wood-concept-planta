// ─────────────────────────────────────────────────────────────
// js/tablero.js — Tablero tab: priority board + production log
// ─────────────────────────────────────────────────────────────

const Tablero = {
  _dragging: null,

  render({ ops, dbData }) {
    this._renderPriority(ops, dbData);
    this._renderProductionLog(dbData);
  },

  // ── Left column: priority order ───────────────────────────
  _renderPriority(ops, dbData) {
    const priority    = App.buildPriorities(dbData);
    const assignments = App.buildAssignments(dbData);

    // Merge saved order with live ops (new ops appended at end)
    const opMap       = Object.fromEntries(ops.map(o => [o.id, o]));
    const orderedIds  = [
      ...priority.filter(id => opMap[id]),
      ...ops.filter(o => !priority.includes(o.id)).map(o => o.id),
    ];

    el('tablero-prio-count').textContent = orderedIds.length;

    const list = el('tablero-prio-list');
    if (!orderedIds.length) {
      list.innerHTML = '<div class="empty-state-sm">Sin OPs activos</div>';
      return;
    }

    list.innerHTML = orderedIds.map((id, idx) => {
      const op = opMap[id];
      if (!op) return '';
      const a     = assignments[id];
      const stage = getCurrentStage(op);
      return `
        <div class="tablero-item" draggable="true" data-id="${esc(id)}" data-name="${esc(op.name)}">
          <span class="drag-handle">⠿</span>
          <span class="tablero-rank">${idx + 1}</span>
          <div class="tablero-item-info">
            <div class="tablero-item-name">${esc(op.name)}</div>
            <div class="tablero-item-meta">
              ${op.project ? `<span>${esc(op.project)}</span>` : ''}
              ${a?.person ? `<span class="tbl-assignee">${esc(a.person)}</span>` : ''}
              ${stage ? `<span class="stage-pill-sm" style="color:${STAGE_COLORS[stage]}">${esc(STAGE_LABELS[stage])}</span>` : ''}
            </div>
          </div>
          ${this._statusBadgeSm(op.status)}
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

  // ── Right column: production log ─────────────────────────
  _renderProductionLog(dbData) {
    const log = (dbData?.produccion || []).map(r => ({
      name:         r.nombre_op,
      project:      r.proyecto,
      person:       r.persona,
      completedDate: r.fecha_salida,
      isReproceso:  r.es_reproceso,
      daysInPlant:  r.dias_en_planta,
    }));

    el('tablero-prod-count').textContent = log.length;

    const container = el('tablero-prod-list');
    if (!log.length) {
      container.innerHTML = '<div class="empty-state-sm">Sin OPs completados aún</div>';
      return;
    }

    container.innerHTML = log.map(e => `
      <div class="prod-log-item ${e.isReproceso ? 'prod-log-reproceso' : ''}">
        <div class="prod-log-top">
          <span class="prod-log-name">${esc(e.name)}</span>
          ${e.isReproceso ? '<span class="badge-reproceso">Reproceso</span>' : ''}
        </div>
        <div class="prod-log-meta">
          ${e.project ? `<span>${esc(e.project)}</span>` : ''}
          ${e.person  ? `<span class="tbl-assignee">${esc(e.person)}</span>` : ''}
          ${e.completedDate ? `<span>✓ ${esc(e.completedDate)}</span>` : ''}
          ${e.daysInPlant != null ? `<span class="muted-txt">${e.daysInPlant}d en planta</span>` : ''}
        </div>
      </div>
    `).join('');
  },

  _statusBadgeSm(status) {
    const info = STATUS_DISPLAY[status] || { label: status || '—', cls: 'sb-other' };
    return `<span class="status-badge-sm ${info.cls}">${esc(info.label)}</span>`;
  },
};
