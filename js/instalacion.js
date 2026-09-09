// ─────────────────────────────────────────────────────────────
// js/instalacion.js — Bitácora de Instalación
//
// Coordinador de instalaciones: qué OPs ya están en empaque (listas
// para enviar a sitio) y cuáles están en instalación ahora mismo, con
// un log de eventos (inicio/pausa/cambio en sitio/reproceso/fin) y
// comentarios por OP — reemplaza la ficha Excel manual.
// ─────────────────────────────────────────────────────────────

const Instalacion = {
  _ops:           [],
  _dbData:        null,
  _fieldIds:      {},
  _instaladores:  [],
  _sub:           'instalacion',   // 'empaque' | 'instalacion' | 'rendimiento'
  _expanded:      new Set(),       // op ids showing the bitácora panel
  _draftTipo:     {},              // op_id → selected tipo in the compose form
  _draftTexto:    {},              // op_id → draft comment text

  render({ installOps, fieldIds, instaladoresList, dbData }) {
    this._ops          = installOps || [];
    this._fieldIds      = fieldIds || {};
    this._instaladores = instaladoresList || [];
    this._dbData        = dbData;
    this._draw();
  },

  // ── Helpers ─────────────────────────────────────────────────

  _fmtShort(d) {
    if (!d) return '';
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  },

  _instaladoresFor(opId) {
    return (this._dbData?.asignaciones || [])
      .filter(a => a.op_id === opId && a.etapa === 'instalacion')
      .map(a => a.persona);
  },

  _installRow(opId) {
    return (this._dbData?.instalacionOps || []).find(r => r.op_id === opId) || null;
  },

  _bitacoraFor(opId) {
    return (this._dbData?.bitacoraInstalacion || [])
      .filter(e => e.op_id === opId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  _groupByProject(ops) {
    const map = new Map();
    for (const op of ops) {
      const proj = op.project || '(Sin proyecto)';
      if (!map.has(proj)) map.set(proj, []);
      map.get(proj).push(op);
    }
    return map;
  },

  // ── Draw ─────────────────────────────────────────────────────

  _draw() {
    const wrap = el('instalacion-container');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="tab-wrap">
        <div class="asign-header-row">
          <h2 class="tab-title">🚚 Bitácora de Instalación</h2>
          <p class="tab-sub">OPs que ya salieron de fábrica: listas para enviar (empaque) y en instalación en sitio.</p>
        </div>
        <div class="cron-subtabs">
          <button class="cron-subtab ${this._sub === 'empaque' ? 'active' : ''}" data-sub="empaque">📦 Empaque (${this._ops.filter(o => o.status === 'empaque').length})</button>
          <button class="cron-subtab ${this._sub === 'instalacion' ? 'active' : ''}" data-sub="instalacion">🔧 En Instalación (${this._ops.filter(o => o.status === 'en instalacion').length})</button>
          <button class="cron-subtab ${this._sub === 'rendimiento' ? 'active' : ''}" data-sub="rendimiento">📊 Rendimiento</button>
        </div>
        <div class="cron-body" id="inst-body">
          ${this._sub === 'empaque' ? this._renderEmpaque()
            : this._sub === 'rendimiento' ? this._renderRendimiento()
            : this._renderEnInstalacion()}
        </div>
      </div>
    `;

    wrap.querySelectorAll('.cron-subtab').forEach(btn => {
      btn.addEventListener('click', () => { this._sub = btn.dataset.sub; this._draw(); });
    });

    this._bindEmpaque(wrap);
    this._bindInstalacion(wrap);
  },

  // ── 📦 Empaque (ready to ship) ───────────────────────────────

  _renderEmpaque() {
    const ops = this._ops.filter(o => o.status === 'empaque');
    if (!ops.length) return '<div class="cron-empty">No hay OPs en empaque en este momento.</div>';

    const groups = this._groupByProject(ops);
    return [...groups.entries()].map(([project, projOps]) => `
      <div class="cron-block">
        <div class="cron-block-hdr">
          <span class="cron-hdr-name">${esc(project)}</span>
          <span class="cron-hdr-meta"><span class="cron-hdr-count">${projOps.length} OP${projOps.length !== 1 ? 's' : ''}</span></span>
        </div>
        <table class="cron-tbl">
          <thead><tr><th>No. OP</th><th>Descripción</th><th>Fecha empaque</th><th>Envío a sitio</th><th></th></tr></thead>
          <tbody>
            ${projOps.map(op => `
              <tr>
                <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
                <td class="cron-name">${esc(op.name)}</td>
                <td class="cron-fecha-lbl">${op.fechaEmpaque ? this._fmtShort(op.fechaEmpaque) : '<span class="cron-faint">—</span>'}</td>
                <td class="cron-fecha-lbl">${op.envioInstalacion ? this._fmtShort(op.envioInstalacion) : '<span class="cron-faint">—</span>'}</td>
                <td>${op.envioInstalacion ? '' : `<button class="btn-secondary btn-sm inst-btn-enviar" data-op="${esc(op.id)}">📤 Marcar enviada hoy</button>`}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');
  },

  _bindEmpaque(wrap) {
    wrap.querySelectorAll('.inst-btn-enviar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId = btn.dataset.op;
        const op = this._ops.find(o => o.id === opId);
        if (!op || !this._fieldIds.envioInstalacion) return;
        btn.disabled = true; btn.textContent = '...';
        try {
          await PlantaAPI.setField(opId, this._fieldIds.envioInstalacion, Date.now());
          op.envioInstalacion = new Date();
          PlantaAPI.clearCache();
          this._draw();
        } catch (e) {
          alert('Error: ' + e.message);
          btn.disabled = false; btn.textContent = '📤 Marcar enviada hoy';
        }
      });
    });
  },

  // ── 🔧 En instalación ─────────────────────────────────────────

  _renderEnInstalacion() {
    const ops = this._ops.filter(o => o.status === 'en instalacion');
    if (!ops.length) return '<div class="cron-empty">No hay OPs en instalación en este momento.</div>';

    const groups = this._groupByProject(ops);
    return [...groups.entries()].map(([project, projOps]) => `
      <div class="cron-block">
        <div class="cron-block-hdr">
          <span class="cron-hdr-name">${esc(project)}</span>
          <span class="cron-hdr-meta"><span class="cron-hdr-count">${projOps.length} OP${projOps.length !== 1 ? 's' : ''}</span></span>
        </div>
        ${projOps.map(op => this._opCardHtml(op)).join('')}
      </div>
    `).join('');
  },

  _opCardHtml(op) {
    const installers = this._instaladoresFor(op.id);
    const row        = this._installRow(op.id);
    const estatus     = op.estatusInstalacion || 'SIN COMENZAR';
    const estColor    = ESTATUS_INSTALACION_COLORS[estatus] || '#b5bcc2';
    const expanded    = this._expanded.has(op.id);
    const completa    = row?.llego_completa;

    return `
      <div class="inst-op-card">
        <div class="inst-op-hdr" data-op="${esc(op.id)}">
          <button class="inst-op-toggle" data-toggle="${esc(op.id)}">${expanded ? '▼' : '▶'}</button>
          ${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : ''}
          <span class="cron-name">${esc(op.name)}</span>
          <span class="inst-est-badge" style="background:${estColor}22;color:${estColor};border-color:${estColor}66">${esc(estatus)}</span>
          ${installers.length ? `<span class="inst-installer-tag">👷 ${esc(installers.join(', '))}</span>` : '<span class="cron-faint">Sin instalador</span>'}
          ${completa === false ? '<span class="badge-reproceso-sm">Incompleta</span>' : ''}
        </div>
        ${expanded ? this._opDetailHtml(op, installers, row, estatus) : ''}
      </div>
    `;
  },

  _opDetailHtml(op, installers, row, estatus) {
    const bitacora    = this._bitacoraFor(op.id);
    const tipo         = this._draftTipo[op.id]  || 'nota';
    const texto        = this._draftTexto[op.id] || '';
    const installerOpts = this._instaladores.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    const estatusOpts   = ESTATUS_INSTALACION_STAGES.map(s =>
      `<option value="${esc(s.id)}" ${s.id === estatus ? 'selected' : ''}>${esc(s.id)}</option>`).join('');

    return `
      <div class="inst-op-detail">

        <div class="inst-detail-row">
          <div class="inst-detail-col">
            <label class="field-label">Instaladores</label>
            <div class="inst-chip-row">
              ${installers.map(name => `
                <span class="inst-chip">${esc(name)}
                  <button class="inst-chip-x" data-op="${esc(op.id)}" data-person="${esc(name)}">✕</button>
                </span>
              `).join('') || '<span class="cron-faint">Ninguno asignado</span>'}
            </div>
            <div class="inst-add-row">
              <select class="field-input inst-add-installer" data-op="${esc(op.id)}">
                <option value="">— Agregar instalador —</option>
                ${installerOpts}
              </select>
            </div>
          </div>

          <div class="inst-detail-col">
            <label class="field-label">Estatus instalación</label>
            <select class="field-input inst-estatus-sel" data-op="${esc(op.id)}">${estatusOpts}</select>

            <label class="field-label" style="margin-top:10px">¿Llegó completa de fábrica?</label>
            <div class="inst-completa-row">
              <button class="btn-sm ${row?.llego_completa === true  ? 'btn-primary' : 'btn-secondary'}" data-op="${esc(op.id)}" data-completa="true">Sí</button>
              <button class="btn-sm ${row?.llego_completa === false ? 'btn-primary' : 'btn-secondary'}" data-op="${esc(op.id)}" data-completa="false">No</button>
            </div>
            ${row?.llego_completa === false ? `
              <input type="text" class="field-input inst-faltante-inp" data-op="${esc(op.id)}"
                placeholder="¿Qué faltó?" value="${esc(row?.faltante || '')}">
            ` : ''}
          </div>

          <div class="inst-detail-col">
            <label class="field-label">Fechas</label>
            <div class="inst-dates">
              <span>Envío a sitio: <strong>${op.envioInstalacion ? this._fmtShort(op.envioInstalacion) : '—'}</strong></span>
              <span>Inicio instalación: <strong>${op.inicioInstalacion ? this._fmtShort(op.inicioInstalacion) : '—'}</strong></span>
              <span>Fin instalación: <strong>${row?.fecha_fin ? this._fmtShort(new Date(row.fecha_fin + 'T12:00:00')) : '—'}</strong></span>
            </div>
            ${estatus !== 'COMPLETADO' ? `<button class="btn-primary btn-sm inst-btn-completar" data-op="${esc(op.id)}">✔ Marcar instalación completa</button>` : ''}
          </div>
        </div>

        <div class="inst-bitacora">
          <div class="inst-bitacora-hdr">Bitácora</div>
          <div class="inst-bitacora-compose">
            <select class="field-input inst-tipo-sel" data-op="${esc(op.id)}">
              <option value="nota"        ${tipo==='nota'?'selected':''}>📝 Nota</option>
              <option value="inicio"      ${tipo==='inicio'?'selected':''}>▶ Inicio</option>
              <option value="pausa"       ${tipo==='pausa'?'selected':''}>⏸ Pausa</option>
              <option value="reanudado"   ${tipo==='reanudado'?'selected':''}>▶ Reanudado</option>
              <option value="cambio_sitio" ${tipo==='cambio_sitio'?'selected':''}>🔁 Cambio en sitio</option>
              <option value="reproceso"   ${tipo==='reproceso'?'selected':''}>⚠ Reproceso</option>
            </select>
            <textarea class="field-input inst-texto-inp" data-op="${esc(op.id)}" placeholder="Comentario...">${esc(texto)}</textarea>
            <div class="inst-compose-actions">
              ${tipo === 'reproceso' ? `<button class="btn-secondary btn-sm inst-btn-reproceso-form" data-op="${esc(op.id)}">📋 Llenar formulario de reproceso</button>` : ''}
              <button class="btn-primary btn-sm inst-btn-guardar" data-op="${esc(op.id)}">Guardar</button>
            </div>
          </div>
          <ul class="inst-bitacora-list">
            ${bitacora.map(e => `
              <li class="inst-bitacora-item ${e.es_reproceso ? 'inst-bitacora-reproceso' : ''}">
                <span class="inst-bitacora-tipo">${this._tipoIcon(e.tipo)}</span>
                <span class="inst-bitacora-texto">${esc(e.texto || '')}</span>
                <span class="inst-bitacora-fecha">${new Date(e.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
              </li>
            `).join('') || '<li class="cron-faint">Sin entradas todavía.</li>'}
          </ul>
        </div>
      </div>
    `;
  },

  _tipoIcon(tipo) {
    return { nota: '📝', inicio: '▶', pausa: '⏸', reanudado: '▶', cambio_sitio: '🔁', reproceso: '⚠', fin: '✔' }[tipo] || '📝';
  },

  _bindInstalacion(wrap) {
    wrap.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggle;
        if (this._expanded.has(id)) this._expanded.delete(id); else this._expanded.add(id);
        this._draw();
      });
    });

    wrap.querySelectorAll('.inst-add-installer').forEach(sel => {
      sel.addEventListener('change', async () => {
        const opId = sel.dataset.op;
        const person = sel.value;
        if (!person) return;
        try {
          await DB.setAsignacion(opId, 'instalacion', person);
          this._dbData.asignaciones.push({ op_id: opId, etapa: 'instalacion', persona: person, fecha_asignacion: todayIso() });
          await this._mirrorInstalador(opId);
          this._draw();
        } catch (e) { alert('Error: ' + e.message); }
      });
    });

    wrap.querySelectorAll('.inst-chip-x').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId = btn.dataset.op, person = btn.dataset.person;
        this._dbData.asignaciones = this._dbData.asignaciones.filter(
          a => !(a.op_id === opId && a.etapa === 'instalacion' && a.persona === person));
        DB.removeAsignacion(opId, person, 'instalacion').catch(e => console.warn('[Instalacion] remove:', e.message));
        await this._mirrorInstalador(opId);
        this._draw();
      });
    });

    wrap.querySelectorAll('.inst-estatus-sel').forEach(sel => {
      sel.addEventListener('change', async () => {
        const opId = sel.dataset.op;
        const value = sel.value;
        const op = this._ops.find(o => o.id === opId);
        const optId = this._fieldIds.estatusInstalacionOpts?.[normStr(value)];
        if (!optId || !this._fieldIds.estatusInstalacion) return;
        try {
          await PlantaAPI.setField(opId, this._fieldIds.estatusInstalacion, optId);
          if (op) op.estatusInstalacion = value;
          PlantaAPI.clearCache();
          this._draw();
        } catch (e) { alert('Error: ' + e.message); }
      });
    });

    wrap.querySelectorAll('[data-completa]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId = btn.dataset.op;
        const val  = btn.dataset.completa === 'true';
        try {
          const saved = await DB.upsertInstalacionOp({ op_id: opId, llego_completa: val });
          this._upsertLocalInstalacionOp(saved);
          this._draw();
        } catch (e) { alert('Error: ' + e.message); }
      });
    });

    wrap.querySelectorAll('.inst-faltante-inp').forEach(inp => {
      inp.addEventListener('change', async () => {
        const opId = inp.dataset.op;
        try {
          const saved = await DB.upsertInstalacionOp({ op_id: opId, faltante: inp.value });
          this._upsertLocalInstalacionOp(saved);
        } catch (e) { console.warn('[Instalacion] faltante save:', e.message); }
      });
    });

    wrap.querySelectorAll('.inst-tipo-sel').forEach(sel => {
      sel.addEventListener('change', () => { this._draftTipo[sel.dataset.op] = sel.value; this._draw(); });
    });
    wrap.querySelectorAll('.inst-texto-inp').forEach(ta => {
      ta.addEventListener('input', () => { this._draftTexto[ta.dataset.op] = ta.value; });
    });

    wrap.querySelectorAll('.inst-btn-reproceso-form').forEach(btn => {
      btn.addEventListener('click', () => {
        const opId = btn.dataset.op;
        const op = this._ops.find(o => o.id === opId);
        const url = buildReprocesoFormUrl({
          cliente: op?.project || '',
          op:      op?.noOp || '',
          motivo:  this._draftTexto[opId] || '',
        });
        window.open(url, '_blank');
      });
    });

    wrap.querySelectorAll('.inst-btn-guardar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId  = btn.dataset.op;
        const tipo  = this._draftTipo[opId] || 'nota';
        const texto = (this._draftTexto[opId] || '').trim();
        if (!texto) return;
        btn.disabled = true;
        try {
          const saved = await DB.addBitacoraEntry({ op_id: opId, tipo, texto, es_reproceso: tipo === 'reproceso' });
          this._dbData.bitacoraInstalacion.unshift(saved);
          delete this._draftTexto[opId];
          this._draftTipo[opId] = 'nota';
          this._draw();
        } catch (e) {
          alert('Error: ' + e.message);
          btn.disabled = false;
        }
      });
    });

    wrap.querySelectorAll('.inst-btn-completar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opId = btn.dataset.op;
        const op = this._ops.find(o => o.id === opId);
        btn.disabled = true; btn.textContent = '...';
        try {
          const optId = this._fieldIds.estatusInstalacionOpts?.[normStr('COMPLETADO')];
          if (optId && this._fieldIds.estatusInstalacion) {
            await PlantaAPI.setField(opId, this._fieldIds.estatusInstalacion, optId);
          }
          const saved = await DB.upsertInstalacionOp({ op_id: opId, fecha_fin: todayIso() });
          this._upsertLocalInstalacionOp(saved);
          const entry = await DB.addBitacoraEntry({ op_id: opId, tipo: 'fin', texto: 'Instalación completada' });
          this._dbData.bitacoraInstalacion.unshift(entry);
          if (op) op.estatusInstalacion = 'COMPLETADO';
          PlantaAPI.clearCache();
          this._draw();
        } catch (e) {
          alert('Error: ' + e.message);
          btn.disabled = false; btn.textContent = '✔ Marcar instalación completa';
        }
      });
    });
  },

  _upsertLocalInstalacionOp(row) {
    if (!row) return;
    const arr = this._dbData.instalacionOps;
    const idx = arr.findIndex(r => r.op_id === row.op_id);
    if (idx >= 0) arr[idx] = row; else arr.push(row);
  },

  // Mirrors the *first* assigned installer into ClickUp's single-select
  // INSTALADORES dropdown — best-effort, since ClickUp can only hold one
  // value there even when several installers are assigned in the app.
  async _mirrorInstalador(opId) {
    const names  = this._instaladoresFor(opId);
    const optId  = names.length === 1 ? this._fieldIds.instaladorOpts?.[normStr(names[0])] : null;
    if (!optId || !this._fieldIds.instaladores) return;
    try {
      await PlantaAPI.setField(opId, this._fieldIds.instaladores, optId);
      PlantaAPI.clearCache();
    } catch (e) { console.warn('[Instalacion] mirror instalador failed:', e.message); }
  },

  // ── 📊 Rendimiento de instaladores ───────────────────────────

  _renderRendimiento() {
    const asignaciones = (this._dbData?.asignaciones || []).filter(a => a.etapa === 'instalacion');
    const names = [...new Set(asignaciones.map(a => a.persona))].sort();
    if (!names.length) return '<div class="cron-empty">Todavía no hay instaladores asignados.</div>';

    const opsById = Object.fromEntries(this._ops.map(o => [o.id, o]));
    const rows = names.map(name => {
      const myOpIds = asignaciones.filter(a => a.persona === name).map(a => a.op_id);
      const total = myOpIds.length;
      const finishedRows = myOpIds
        .map(id => this._installRow(id))
        .filter(r => r && r.fecha_fin);
      const completed = finishedRows.length;
      const durations = finishedRows.map(r => {
        const op = opsById[r.op_id];
        const start = op?.inicioInstalacion;
        if (!start) return null;
        return daysBetween(start, new Date(r.fecha_fin + 'T12:00:00'));
      }).filter(d => d !== null && d >= 0);
      const avgDays = durations.length ? (durations.reduce((a,b)=>a+b,0) / durations.length) : null;
      const reprocesos = (this._dbData?.bitacoraInstalacion || [])
        .filter(e => e.es_reproceso && myOpIds.includes(e.op_id)).length;
      const incompletas = myOpIds.filter(id => this._installRow(id)?.llego_completa === false).length;
      return { name, total, completed, avgDays, reprocesos, incompletas };
    }).sort((a, b) => b.completed - a.completed);

    return `
      <table class="ranking-table">
        <thead><tr>
          <th>Instalador</th><th>OPs asignadas</th><th>Completadas</th>
          <th>Prom. días/OP</th><th>Reprocesos</th><th>Llegaron incompletas</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${esc(r.name)}</td>
              <td style="text-align:center">${r.total}</td>
              <td style="text-align:center">${r.completed}</td>
              <td style="text-align:center">${r.avgDays !== null ? r.avgDays.toFixed(1) : '—'}</td>
              <td style="text-align:center">${r.reprocesos || 0}</td>
              <td style="text-align:center">${r.incompletas || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },
};
