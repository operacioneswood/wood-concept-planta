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
          <span class="tablero-grip" title="Arrastra para cambiar la prioridad">⋮⋮</span>
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
    this._bindDrag(list);
  },

  // Guarda el orden de prioridad tal como está en pantalla y vuelve a dibujar la lista.
  _guardarOrden(list) {
    const items = [...list.querySelectorAll('.tablero-item')];
    const rows = items.map(i => ({ proyecto_id: i.dataset.id, proyecto_nombre: i.dataset.name || '' }));
    App._dbData.prioridades = rows.map((r, i) => ({ ...r, orden: i }));
    DB.setPrioridades(rows).catch(e => console.error('[Tablero] priority save failed:', e.message));
    Tablero._renderPriority(App._data?.ops || [], App._dbData);
  },

  _bindMoveButtons(list) {
    list.querySelectorAll('.tablero-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir    = btn.dataset.dir;
        const projId = btn.dataset.id;
        const items  = [...list.querySelectorAll('.tablero-item')];
        const idx    = items.findIndex(i => i.dataset.id === projId);

        if (dir === 'up' && idx > 0) {
          list.insertBefore(items[idx], items[idx - 1]);
        } else if (dir === 'dn' && idx < items.length - 1) {
          list.insertBefore(items[idx + 1], items[idx]);
        } else {
          return;
        }
        Tablero._guardarOrden(list);
      });
    });
  },

  // ── Arrastrar para reordenar (mouse, dedo y lápiz) ───────────
  // Con mouse se arrastra desde cualquier parte de la tarjeta; con dedo o
  // lápiz, desde el asa ⋮⋮ (así el resto de la tarjeta sigue permitiendo
  // desplazar la lista). Las flechas ▲▼ siguen funcionando.
  _ensureDragCss() {
    if (document.getElementById('tablero-drag-css')) return;
    const st = document.createElement('style');
    st.id = 'tablero-drag-css';
    st.textContent = `
.tablero-grip{flex:none;display:flex;align-items:center;justify-content:center;align-self:stretch;width:20px;margin:-10px 0 -10px -6px;color:#b5aca0;font-size:15px;letter-spacing:-3px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.tablero-grip:hover{color:#6b645c}
.tablet .tablero-grip{width:44px;font-size:24px;margin:-14px 0 -14px -10px}
.tablero-item{-webkit-user-select:none}
.tablero-item .tablero-move-btn{cursor:pointer}
.tablero-item.tablero-dragging{opacity:.28;outline:2px dashed #b5aca0;outline-offset:-2px}
.tablero-ghost{position:fixed;z-index:9999;pointer-events:none;margin:0;box-shadow:0 10px 28px rgba(0,0,0,.3);opacity:.96;transition:none}
body.tablero-drag-on,body.tablero-drag-on *{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}
`;
    document.head.appendChild(st);
  },

  _scrollParent(el) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;   // la página
  },

  _bindDrag(list) {
    this._ensureDragCss();
    list.querySelectorAll('.tablero-item').forEach(item => {
      item.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.tablero-move-btn')) return;
        if (e.pointerType !== 'mouse' && !e.target.closest('.tablero-grip')) return;
        this._startDrag(e, item, list);
      });
    });
  },

  _startDrag(e, item, list) {
    const pid = e.pointerId, startX = e.clientX, startY = e.clientY;
    const idsAntes = [...list.querySelectorAll('.tablero-item')].map(i => i.dataset.id).join('|');
    let dragging = false, ghost = null, offY = 0, lastY = startY, raf = null;

    // Coloca el hueco (la tarjeta original) donde corresponde según la posición del puntero.
    const mover = y => {
      ghost.style.top = (y - offY) + 'px';
      const otros = [...list.querySelectorAll('.tablero-item')].filter(i => i !== item);
      let ref = null;
      for (const o of otros) {
        const r = o.getBoundingClientRect();
        if (y < r.top + r.height / 2) { ref = o; break; }
      }
      if (ref !== item.nextElementSibling) list.insertBefore(item, ref);
    };

    // Desplaza la lista sola cuando el puntero se acerca al borde de arriba o de abajo.
    const tick = () => {
      if (!dragging) return;
      const sp = this._scrollParent(item);
      const r  = sp ? sp.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const borde = 60;
      let dy = 0;
      if (lastY < r.top + borde)         dy = -Math.ceil((r.top + borde - lastY) / 5);
      else if (lastY > r.bottom - borde) dy =  Math.ceil((lastY - (r.bottom - borde)) / 5);
      if (dy) { (sp || window).scrollBy(0, Math.max(-24, Math.min(24, dy))); mover(lastY); }
      raf = requestAnimationFrame(tick);
    };

    const onMove = ev => {
      if (ev.pointerId !== pid) return;
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < 6 && Math.abs(ev.clientX - startX) < 6) return;
        dragging = true;
        const r = item.getBoundingClientRect();
        offY = startY - r.top;
        ghost = item.cloneNode(true);
        ghost.classList.add('tablero-ghost');
        ghost.style.width = r.width + 'px';
        ghost.style.left  = r.left + 'px';
        ghost.style.top   = r.top + 'px';
        document.body.appendChild(ghost);
        item.classList.add('tablero-dragging');
        document.body.classList.add('tablero-drag-on');
        raf = requestAnimationFrame(tick);
      }
      ev.preventDefault();
      mover(ev.clientY);
    };

    const fin = ev => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', fin);
      if (!dragging) return;
      dragging = false;
      cancelAnimationFrame(raf);
      ghost.remove();
      item.classList.remove('tablero-dragging');
      document.body.classList.remove('tablero-drag-on');
      if (!list.contains(item)) return;   // la lista se volvió a dibujar mientras arrastrabas
      if (ev.type === 'pointercancel') { Tablero._renderPriority(App._data?.ops || [], App._dbData); return; }
      const idsDespues = [...list.querySelectorAll('.tablero-item')].map(i => i.dataset.id).join('|');
      if (idsDespues !== idsAntes) Tablero._guardarOrden(list);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', fin);
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
