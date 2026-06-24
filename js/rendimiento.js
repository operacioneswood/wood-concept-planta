// ─────────────────────────────────────────────────────────────
// js/rendimiento.js — Rendimiento tab: performance by person
//   Ebanistas  → count completed stages from historial table
//   Contratistas + Pintores → count completed OPs from produccion table
//   All roles → expandable historial panel with inline editing
// ─────────────────────────────────────────────────────────────

const Rendimiento = {
  _period: 'monthly',

  render({ ebanistas, dbData, ops }) {
    const personasMap    = App.buildPersonasMap(dbData);
    const historial      = dbData?.historial  || [];
    const produccion     = dbData?.produccion || [];

    // Period toggle
    el('rendimiento-controls').innerHTML = `
      <div class="rend-period-toggle">
        <button class="rend-period-btn ${this._period === 'weekly'  ? 'active' : ''}" data-period="weekly">Semanal</button>
        <button class="rend-period-btn ${this._period === 'monthly' ? 'active' : ''}" data-period="monthly">Mensual</button>
      </div>
    `;
    el('rendimiento-controls').querySelectorAll('.rend-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._period = btn.dataset.period;
        this.render({ ebanistas, dbData, ops });
      });
    });

    const now = new Date();

    const inPeriod = dateStr => {
      if (!dateStr) return false;
      const d = isoToDate(dateStr);
      if (!d) return false;
      if (this._period === 'weekly') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek;
      }
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    };

    const people = ebanistas.length ? ebanistas : Object.keys(personasMap);

    if (!people.length) {
      el('rendimiento-body').innerHTML = '<div class="empty-state"><p>Sincroniza con ClickUp para ver el personal.</p></div>';
      return;
    }

    const ebanistasData    = people.filter(n => (personasMap[n] || 'ebanista') === 'ebanista');
    const contratistasData = people.filter(n => personasMap[n] === 'contratista');
    const pintoresData     = people.filter(n => personasMap[n] === 'pintor');

    const filteredHistorial  = historial.filter(r => inPeriod(r.fecha_fin));
    const filteredProduccion = produccion.filter(r => inPeriod(r.fecha_salida));

    const opsList = ops || [];
    const sections = [];

    if (ebanistasData.length) {
      sections.push(`
        <div class="rend-section-title">
          Ebanistas
          <span class="rend-section-sub">por etapa completada</span>
        </div>
        <div class="rend-grid">
          ${ebanistasData.map(name => this._cardHistorial(name, 'ebanista', filteredHistorial, historial, opsList)).join('')}
        </div>
      `);
    }

    if (contratistasData.length) {
      sections.push(`
        <div class="rend-section-title">
          Contratistas
          <span class="rend-section-sub">por OP completada</span>
        </div>
        <div class="rend-grid">
          ${contratistasData.map(name => this._cardProduccion(name, 'contratista', filteredProduccion, historial, opsList)).join('')}
        </div>
      `);
    }

    if (pintoresData.length) {
      sections.push(`
        <div class="rend-section-title">
          Pintores
          <span class="rend-section-sub">por OP completada</span>
        </div>
        <div class="rend-grid">
          ${pintoresData.map(name => this._cardProduccion(name, 'pintor', filteredProduccion, historial, opsList)).join('')}
        </div>
      `);
    }

    el('rendimiento-body').innerHTML = `
      <div class="rend-period-label">${this._periodLabel(now)}</div>
      ${sections.join('')}
    `;

    this._bindEvents(opsList);
  },

  // ── Card: ebanistas ──────────────────────────────────────────
  _cardHistorial(name, role, filteredHistorial, allHistorial, ops) {
    const target    = TARGETS[role] || TARGETS.ebanista;
    const meta      = this._period === 'weekly' ? target.weekly : target.monthly;
    const myRows    = filteredHistorial.filter(r => r.persona === name);
    const normal    = myRows.filter(r => !r.es_reproceso).length;
    const reproceso = myRows.filter(r =>  r.es_reproceso).length;
    const total     = normal + reproceso;
    const pct       = Math.min(100, Math.round((total / meta) * 100));
    const overMeta  = total >= meta;

    return `
      <div class="rend-person-card ${overMeta ? 'rend-card-ok' : ''}">
        <div class="rend-person-top">
          <span class="rend-person-name">${esc(name)}</span>
          <span class="rend-role-badge">${esc(role)}</span>
        </div>
        <div class="rend-bar-wrap">
          <div class="rend-bar">
            <div class="rend-bar-fill ${overMeta ? 'rend-bar-ok' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="rend-bar-label">${total} / ${meta} etapas</div>
        </div>
        <div class="rend-breakdown">
          <div class="rend-stat">
            <span class="rend-stat-val">${normal}</span>
            <span class="rend-stat-lbl">Normal${normal !== 1 ? 'es' : ''}</span>
          </div>
          <div class="rend-stat rend-stat-reproceso">
            <span class="rend-stat-val">${reproceso}</span>
            <span class="rend-stat-lbl">Reproceso${reproceso !== 1 ? 's' : ''}</span>
          </div>
          <div class="rend-stat">
            <span class="rend-stat-val">${meta}</span>
            <span class="rend-stat-lbl">Meta</span>
          </div>
        </div>
        ${myRows.length > 0 ? `
          <div class="rend-log-preview">
            ${myRows.slice(0, 4).map(r => {
              const opData  = ops.find(o => o.id === r.op_id);
              const opLabel = opData?.noOp || opData?.name || r.op_id;
              const subTags = (r.subprocesos || '').split(',').filter(Boolean)
                .map(id => `<span class="rend-log-sub">${esc(subproLabel(id))}</span>`).join('');
              return `
              <div class="rend-log-entry">
                <div class="rend-log-item">
                  <span class="${r.es_reproceso ? 'rend-log-repro' : ''}">
                    ${esc(opLabel)}
                    <span class="rend-log-stage">${esc(STAGE_LABELS[r.etapa] || r.etapa)}</span>
                    ${subTags}
                  </span>
                  <div class="rend-log-right">
                    <span class="muted-txt">${esc(r.fecha_fin || '')}</span>
                    ${r.comentario ? `<button class="btn-rend-expand" title="Ver comentario">💬</button>` : ''}
                  </div>
                </div>
                ${r.comentario ? `<div class="rend-comment-box" style="display:none">${esc(r.comentario)}</div>` : ''}
              </div>`;
            }).join('')}
            ${myRows.length > 4 ? `<div class="muted-txt rend-log-more">+${myRows.length - 4} más</div>` : ''}
          </div>
        ` : '<div class="muted-txt rend-empty">Sin etapas completadas en este período</div>'}
        ${this._renderHistorialPanel(name, allHistorial, ops)}
      </div>
    `;
  },

  // ── Card: contratistas + pintores ─────────────────────────────
  _cardProduccion(name, role, filteredProduccion, allHistorial, ops) {
    const target    = TARGETS[role] || TARGETS.pintor;
    const meta      = this._period === 'weekly' ? target.weekly : target.monthly;
    const myLog     = filteredProduccion.filter(r => r.persona === name);
    const normal    = myLog.filter(r => !r.es_reproceso).length;
    const reproceso = myLog.filter(r =>  r.es_reproceso).length;
    const total     = normal + reproceso;
    const pct       = Math.min(100, Math.round((total / meta) * 100));
    const overMeta  = total >= meta;

    return `
      <div class="rend-person-card ${overMeta ? 'rend-card-ok' : ''}">
        <div class="rend-person-top">
          <span class="rend-person-name">${esc(name)}</span>
          <span class="rend-role-badge">${esc(role)}</span>
        </div>
        <div class="rend-bar-wrap">
          <div class="rend-bar">
            <div class="rend-bar-fill ${overMeta ? 'rend-bar-ok' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="rend-bar-label">${total} / ${meta} OPs</div>
        </div>
        <div class="rend-breakdown">
          <div class="rend-stat">
            <span class="rend-stat-val">${normal}</span>
            <span class="rend-stat-lbl">Normal${normal !== 1 ? 'es' : ''}</span>
          </div>
          <div class="rend-stat rend-stat-reproceso">
            <span class="rend-stat-val">${reproceso}</span>
            <span class="rend-stat-lbl">Reproceso${reproceso !== 1 ? 's' : ''}</span>
          </div>
          <div class="rend-stat">
            <span class="rend-stat-val">${meta}</span>
            <span class="rend-stat-lbl">Meta</span>
          </div>
        </div>
        ${myLog.length > 0 ? `
          <div class="rend-log-preview">
            ${myLog.slice(0, 4).map(e => `
              <div class="rend-log-item">
                <span class="${e.es_reproceso ? 'rend-log-repro' : ''}">${esc(e.nombre_op)}</span>
                <span class="muted-txt">${esc(e.fecha_salida || '')}</span>
              </div>
            `).join('')}
            ${myLog.length > 4 ? `<div class="muted-txt rend-log-more">+${myLog.length - 4} más</div>` : ''}
          </div>
        ` : '<div class="muted-txt rend-empty">Sin OPs completadas en este período</div>'}
        ${this._renderHistorialPanel(name, allHistorial, ops)}
      </div>
    `;
  },

  // ── Expandable historial panel (shared by both card types) ────
  _renderHistorialPanel(name, allHistorial, ops) {
    const myRows = allHistorial
      .filter(r => r.persona === name)
      .slice()
      .sort((a, b) => (b.fecha_fin || '').localeCompare(a.fecha_fin || ''));

    const rows = myRows.map(r => {
      const opData  = ops.find(o => o.id === r.op_id);
      const opLabel = opData?.noOp || opData?.name || r.op_id;
      const opTitle = opData?.name || r.op_id;
      return `
        <tr class="rh-row ${r.es_reproceso ? 'rh-row-repro' : ''}"
            data-op="${esc(r.op_id)}" data-etapa="${esc(r.etapa)}" data-persona="${esc(r.persona)}">
          <td class="rh-op-cell" title="${esc(opTitle)}">${esc(opLabel)}</td>
          <td class="rh-etapa-cell">
            ${esc(STAGE_LABELS[r.etapa] || r.etapa)}
            ${(r.subprocesos || '').split(',').filter(Boolean).map(id => `<span class="rend-log-sub">${esc(subproLabel(id))}</span>`).join('')}
          </td>
          <td><input type="date" class="rh-input rh-inicio" value="${esc(r.fecha_inicio || '')}"></td>
          <td><input type="date" class="rh-input rh-fin"    value="${esc(r.fecha_fin    || '')}"></td>
          <td><input type="text" class="rh-input rh-comment" value="${esc(r.comentario  || '')}" placeholder="Sin comentario"></td>
          <td class="rh-repro-cell">
            <input type="checkbox" class="rh-reproceso" title="Reproceso" ${r.es_reproceso ? 'checked' : ''}>
          </td>
          <td class="rh-actions">
            <button class="btn-rh-save"   title="Guardar cambios">💾</button>
            <button class="btn-rh-delete" title="Eliminar registro">🗑</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="rend-hist-section">
        <button class="btn-rend-historial" data-count="${myRows.length}">
          📋 Ver historial completo (${myRows.length})
        </button>
        <div class="rend-hist-panel" style="display:none">
          ${myRows.length === 0
            ? '<p class="muted-txt rend-empty" style="padding:8px 0">Sin registros en historial</p>'
            : `<div class="rend-hist-scroll">
                <table class="rend-hist-table">
                  <thead>
                    <tr>
                      <th>OP</th><th>Etapa</th><th>Inicio</th><th>Fin</th>
                      <th>Comentario</th><th title="Reproceso">R</th><th></th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`
          }
        </div>
      </div>
    `;
  },

  // ── Event binding ────────────────────────────────────────────
  _bindEvents(ops) {
    const body = el('rendimiento-body');

    // Comment 💬 expand
    body.querySelectorAll('.btn-rend-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = btn.closest('.rend-log-entry');
        const box   = entry?.querySelector('.rend-comment-box');
        if (!box) return;
        const open = box.style.display !== 'none';
        box.style.display = open ? 'none' : 'block';
        btn.textContent   = open ? '💬' : '✕';
      });
    });

    // Historial panel toggle
    body.querySelectorAll('.btn-rend-historial').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.nextElementSibling;
        if (!panel) return;
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
        const count = btn.dataset.count;
        btn.textContent = open
          ? `📋 Ver historial completo (${count})`
          : `▲ Ocultar historial`;
      });
    });

    // Save historial row
    body.querySelectorAll('.btn-rh-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row     = btn.closest('.rh-row');
        const opId    = row.dataset.op;
        const etapa   = row.dataset.etapa;
        const persona = row.dataset.persona;
        const inicio  = row.querySelector('.rh-inicio').value   || null;
        const fin     = row.querySelector('.rh-fin').value      || null;
        const comment = row.querySelector('.rh-comment').value;
        const repro   = row.querySelector('.rh-reproceso').checked;

        // Update local cache
        const h = App._dbData.historial.find(
          x => x.op_id === opId && x.etapa === etapa && x.persona === persona
        );
        if (h) {
          h.fecha_inicio = inicio;
          h.fecha_fin    = fin;
          h.comentario   = comment;
          h.es_reproceso = repro;
        }

        const orig = btn.textContent;
        btn.textContent = '...'; btn.disabled = true;
        try {
          await DB.upsertHistorial({ op_id: opId, etapa, persona, fecha_inicio: inicio, fecha_fin: fin, es_reproceso: repro, comentario: comment });
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
        } catch (e) {
          alert('Error al guardar: ' + e.message);
          btn.textContent = orig; btn.disabled = false;
        }
      });
    });

    // Delete historial row
    body.querySelectorAll('.btn-rh-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row     = btn.closest('.rh-row');
        const opId    = row.dataset.op;
        const etapa   = row.dataset.etapa;
        const persona = row.dataset.persona;

        if (!confirm('¿Eliminar este registro del historial?')) return;

        // Update local cache
        App._dbData.historial = App._dbData.historial.filter(
          h => !(h.op_id === opId && h.etapa === etapa && h.persona === persona)
        );

        try {
          await DB.deleteHistorial(opId, etapa, persona);
          row.remove();
        } catch (e) {
          alert('Error al eliminar: ' + e.message);
        }
      });
    });
  },

  _periodLabel(now) {
    if (this._period === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return `Semana del ${fmtDateFull(start)}`;
    }
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${months[now.getMonth()]} ${now.getFullYear()}`;
  },
};
