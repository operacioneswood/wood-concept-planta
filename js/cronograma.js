// ─────────────────────────────────────────────────────────────
// js/cronograma.js — Cronograma tab: Fábrica + Pintura schedules
// ─────────────────────────────────────────────────────────────

const Cronograma = {
  _ops:      [],
  _dbData:   null,
  _fieldIds: {},
  _sub:      'fabrica',
  _fabView:  'proyecto',   // 'proyecto' | 'urgencia'

  render({ ops, fieldIds, dbData }) {
    this._ops      = ops      || [];
    this._fieldIds = fieldIds || {};
    this._dbData   = dbData;
    this._draw();
  },

  _draw() {
    const wrap = el('cronograma-container');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="cron-subtabs">
        <button class="cron-subtab ${this._sub === 'fabrica' ? 'active' : ''}" data-sub="fabrica">🏭 Fábrica</button>
        <button class="cron-subtab ${this._sub === 'pintura' ? 'active' : ''}" data-sub="pintura">🎨 Pintura</button>
      </div>
      <div class="cron-body">
        ${this._sub === 'fabrica' ? this._renderFabrica() : this._renderPintura()}
      </div>
    `;
    wrap.querySelectorAll('.cron-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._sub = btn.dataset.sub;
        this._draw();
      });
    });
    wrap.querySelectorAll('.cron-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._fabView = btn.dataset.view;
        this._draw();
      });
    });
    const printBtn = wrap.querySelector('#btn-print-pintura');
    if (printBtn) printBtn.addEventListener('click', () => this._printPintura());
    this._bindEdits(wrap);
    wrap.querySelectorAll('.btn-print-proj').forEach(btn => {
      btn.addEventListener('click', () => {
        const projName = btn.dataset.proj;
        const projOps  = this._ops.filter(op => (op.project || 'Sin proyecto') === projName);
        this._printProyecto(projName, projOps);
      });
    });
  },

  // ── Fábrica ───────────────────────────────────────────────

  _fabViewToggle() {
    return `
      <div class="cron-view-toggle">
        <button class="cron-view-btn ${this._fabView === 'proyecto' ? 'active' : ''}" data-view="proyecto">Por proyecto</button>
        <button class="cron-view-btn ${this._fabView === 'urgencia' ? 'active' : ''}" data-view="urgencia">Por urgencia</button>
      </div>
    `;
  },

  _renderFabrica() {
    return this._fabView === 'urgencia'
      ? this._fabViewToggle() + this._renderFabricaUrgencia()
      : this._fabViewToggle() + this._renderFabricaProyecto();
  },

  _renderFabricaProyecto() {
    const byProject = {};
    for (const op of this._ops) {
      const proj = op.project || 'Sin proyecto';
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(op);
    }

    const sorted = Object.entries(byProject).sort(([, a], [, b]) => {
      const earliest = arr => arr.reduce((min, op) =>
        op.salidaFabrica && (!min || op.salidaFabrica < min) ? op.salidaFabrica : min
      , null);
      const da = earliest(a), db = earliest(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });

    if (!sorted.length) return '<div class="cron-empty">Sin OPs activos.</div>';

    return sorted.map(([project, ops]) => {
      const { overdue, urgent } = this._urgencyCounts(ops);
      const urgHtml = this._urgBadgesHtml(overdue, urgent);

      const opsorted = [...ops].sort((a, b) => {
        if (!a.salidaFabrica && !b.salidaFabrica) return 0;
        if (!a.salidaFabrica) return 1;
        if (!b.salidaFabrica) return -1;
        return a.salidaFabrica - b.salidaFabrica;
      });

      const rows = opsorted.map(op => {
        const st = this._statusInfo(op.salidaFabrica);
        const savedComment = localStorage.getItem('wp_cron_comment_' + op.id) || '';
        return `
          <tr>
            <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
            <td class="cron-name">${esc(op.name)}</td>
            <td class="cron-etapa-cell">${this._opStatusBadge(op)}</td>
            <td class="cron-fecha-lbl cron-envio-lbl">${op.envioFabrica ? this._fmtShort(op.envioFabrica) : '<span class="cron-faint">—</span>'}</td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="salidaFabrica"
                value="${this._toInputVal(op.salidaFabrica)}">
            </td>
            <td class="cron-fecha-lbl">${op.salidaFabrica ? this._fmtShort(op.salidaFabrica) : '<span class="cron-faint">—</span>'}</td>
            <td><span class="cron-badge ${st.cls}">${st.label}</span></td>
            <td><input type="text" class="cron-comment-inp" data-opid="${esc(op.id)}" placeholder="Notas…" value="${esc(savedComment)}"></td>
          </tr>
        `;
      }).join('');

      return `
        <div class="cron-block">
          <div class="cron-block-hdr">
            <span class="cron-hdr-name">${esc(project)}</span>
            <span class="cron-hdr-meta">
              <span class="cron-hdr-count">${ops.length} OP${ops.length !== 1 ? 's' : ''}</span>
              ${urgHtml}
              <button class="btn-print-proj cron-print-btn" data-proj="${esc(project)}" title="Imprimir cronograma de ${esc(project)}">🖨</button>
            </span>
          </div>
          <table class="cron-tbl">
            <thead><tr>
              <th>No. OP</th>
              <th>Descripción</th>
              <th>Etapa</th>
              <th>Envío Fáb.</th>
              <th>Fecha límite</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Comentarios</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');
  },

  _renderFabricaUrgencia() {
    // All OPs except those in pintura, sorted most urgent first
    const fabOps = this._ops
      .filter(op => op.status !== 'en pintura' && op.status !== 'pendiente por obra')
      .sort((a, b) => {
        if (!a.salidaFabrica && !b.salidaFabrica) return 0;
        if (!a.salidaFabrica) return 1;
        if (!b.salidaFabrica) return -1;
        return a.salidaFabrica - b.salidaFabrica;
      });

    if (!fabOps.length) return '<div class="cron-empty">Sin OPs en fábrica.</div>';

    const { overdue, urgent } = this._urgencyCounts(fabOps);

    const rows = fabOps.map(op => {
      const st = this._statusInfo(op.salidaFabrica);
      return `
        <tr>
          <td><span class="cron-badge ${st.cls}">${st.label}</span></td>
          <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
          <td class="cron-proyecto">${esc(op.project || '—')}</td>
          <td class="cron-name">${esc(op.name)}</td>
          <td class="cron-etapa-cell">${this._opStatusBadge(op)}</td>
          <td>
            <input type="date" class="cron-date-inp"
              data-opid="${esc(op.id)}"
              data-fieldkey="salidaFabrica"
              value="${this._toInputVal(op.salidaFabrica)}">
          </td>
          <td class="cron-fecha-lbl">${op.salidaFabrica ? this._fmtShort(op.salidaFabrica) : '<span class="cron-faint">—</span>'}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="cron-block">
        <div class="cron-block-hdr">
          <span class="cron-hdr-name">Todos los OPs en fábrica</span>
          <span class="cron-hdr-meta">
            <span class="cron-hdr-count">${fabOps.length} OPs</span>
            ${this._urgBadgesHtml(overdue, urgent)}
          </span>
        </div>
        <table class="cron-tbl cron-tbl-wide">
          <thead><tr>
            <th>Estado</th>
            <th>No. OP</th>
            <th>Proyecto</th>
            <th>Descripción</th>
            <th>Etapa</th>
            <th>Fecha límite</th>
            <th>Fecha</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  // ── Pintura ───────────────────────────────────────────────

  _renderPintura() {
    const pinturaOps = this._ops.filter(op => op.status === 'en pintura' && op.pintor);

    const byPainter = {};
    for (const op of pinturaOps) {
      if (!byPainter[op.pintor]) byPainter[op.pintor] = [];
      byPainter[op.pintor].push(op);
    }

    const painters = Object.keys(byPainter).sort();

    if (!painters.length) {
      return `<div class="cron-empty">
        Sin OPs en pintura actualmente.
        <span class="cron-empty-hint">Aparecen aquí los OPs con estado "EN PINTURA" y un pintor asignado en ClickUp.</span>
      </div>`;
    }

    const paintTables = painters.map(painter => {
      const ops = [...byPainter[painter]].sort((a, b) => {
        if (!a.salidaFabrica && !b.salidaFabrica) return 0;
        if (!a.salidaFabrica) return 1;
        if (!b.salidaFabrica) return -1;
        return a.salidaFabrica - b.salidaFabrica;
      });

      const { overdue, urgent } = this._urgencyCounts(ops);
      const urgHtml = this._urgBadgesHtml(overdue, urgent);

      const rows = ops.map(op => {
        const st = this._statusInfo(op.salidaFabrica);
        return `
          <tr>
            <td class="cron-proyecto">${esc(op.project || '—')}</td>
            <td>${op.noOp ? `<span class="cron-op-num">${esc(op.noOp)}</span>` : '<span class="cron-faint">—</span>'}</td>
            <td class="cron-name">${esc(op.name)}</td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="inicioPintura"
                value="${this._toInputVal(op.inicioPintura)}"
                title="Inicio Pintura">
            </td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="finPintura"
                value="${this._toInputVal(op.finPintura)}"
                title="Fin Pintura">
            </td>
            <td>
              <input type="date" class="cron-date-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="salidaFabrica"
                value="${this._toInputVal(op.salidaFabrica)}"
                title="Fecha Entrega (límite)">
            </td>
            <td>
              <input type="text" class="cron-text-inp"
                data-opid="${esc(op.id)}"
                data-fieldkey="acabado"
                value="${esc(op.acabado || '')}"
                placeholder="Acabado...">
            </td>
            <td><span class="cron-badge ${st.cls}">${st.label}</span></td>
          </tr>
        `;
      }).join('');

      return `
        <div class="cron-block">
          <div class="cron-block-hdr cron-painter-hdr">
            <span class="cron-hdr-name">🎨 ${esc(painter)}</span>
            <span class="cron-hdr-meta">
              <span class="cron-hdr-count">${ops.length} OP${ops.length !== 1 ? 's' : ''}</span>
              ${urgHtml}
            </span>
          </div>
          <table class="cron-tbl cron-tbl-wide">
            <thead><tr>
              <th>Cliente</th>
              <th>No. OP</th>
              <th>Descripción</th>
              <th>Inicio Pintura</th>
              <th>Fin Pintura</th>
              <th>Fecha Entrega</th>
              <th>Acabado</th>
              <th>Estado</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');

    return `
      <div class="cron-print-bar">
        <button class="cron-print-btn" id="btn-print-pintura">🖨 Imprimir cronogramas</button>
      </div>
      ${paintTables}
    `;
  },

  // ── Print single project schedule ─────────────────────────
  _printProyecto(projName, ops) {
    const today  = new Date();
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const todayFmt = `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;

    const sorted = [...ops].sort((a, b) => {
      if (!a.salidaFabrica && !b.salidaFabrica) return 0;
      if (!a.salidaFabrica) return 1;
      if (!b.salidaFabrica) return -1;
      return a.salidaFabrica - b.salidaFabrica;
    });

    const rows = sorted.map((op, idx) => {
      const saved      = localStorage.getItem('wp_cron_comment_' + op.id) || '';
      const comentario = saved || (op.status === 'pendiente por obra' ? 'Pendiente por obra' : '');
      return `<tr>
        <td class="td-num">${idx + 1}</td>
        <td class="td-op">${esc(op.noOp || '—')}</td>
        <td class="td-desc">${esc(op.name)}</td>
        <td class="td-date">${op.salidaFabrica ? this._fmtLong(op.salidaFabrica) : '—'}</td>
        <td class="td-comment">${esc(comentario)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cronograma — ${esc(projName)}</title>
<style>
  @page { size: letter portrait; margin: 0.65in 0.75in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #111; background: #fff; }
  .proj-hdr {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2.5pt solid #4a7c59; padding-bottom: 8pt; margin-bottom: 12pt;
  }
  .proj-title { font-size: 15pt; font-weight: 700; color: #4a7c59; letter-spacing: -0.02em; }
  .proj-date  { font-size: 9.5pt; color: #666; }
  table { width: 100%; border-collapse: collapse; orphans: 3; widows: 3; }
  thead tr { background: #eef4f0; }
  th {
    font-size: 9pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: #555;
    padding: 6pt 7pt; text-align: left;
    border-bottom: 1.5pt solid #a8c4b4; white-space: nowrap;
  }
  td { padding: 6.5pt 7pt; border-bottom: 0.5pt solid #ddeae0; vertical-align: middle; line-height: 1.35; }
  tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #f7faf8; }
  .td-num  { width: 18pt; text-align: center; color: #888; font-size: 9.5pt; }
  .td-op   { width: 70pt; font-weight: 700; color: #4a7c59; white-space: nowrap; }
  .td-desc { color: #111; }
  .td-date { width: 90pt; white-space: nowrap; font-size: 10pt; }
  .td-comment { color: #555; font-size: 10pt; }
  .tbl-footer { margin-top: 10pt; font-size: 8.5pt; color: #aaa; text-align: right; }
</style>
</head>
<body>
<div class="proj-hdr">
  <div class="proj-title">Cronograma — ${esc(projName)}</div>
  <div class="proj-date">${todayFmt}</div>
</div>
<table>
  <thead>
    <tr>
      <th class="td-num">#</th>
      <th class="td-op">No. OP</th>
      <th class="td-desc">Descripción</th>
      <th class="td-date">Fecha</th>
      <th class="td-comment">Comentarios</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="tbl-footer">${ops.length} ítem${ops.length !== 1 ? 's' : ''} · Wood Concept Planta</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Permite ventanas emergentes para imprimir.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  },

  // ── Print pintura schedules ────────────────────────────────
  _printPintura() {
    const pinturaOps = this._ops.filter(op => op.status === 'en pintura' && op.pintor);
    const byPainter  = {};
    for (const op of pinturaOps) {
      if (!byPainter[op.pintor]) byPainter[op.pintor] = [];
      byPainter[op.pintor].push(op);
    }
    const painters = Object.keys(byPainter).sort();

    const today   = new Date();
    const months  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const todayFmt = `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;

    const paintersHtml = painters.map((painter, pi) => {
      const ops = [...byPainter[painter]].sort((a, b) => {
        if (!a.salidaFabrica && !b.salidaFabrica) return 0;
        if (!a.salidaFabrica) return 1;
        if (!b.salidaFabrica) return -1;
        return a.salidaFabrica - b.salidaFabrica;
      });

      const rows = ops.map((op, idx) => {
        return `<tr>
          <td class="td-num">${idx + 1}</td>
          <td class="td-proj">${esc(op.project || '—')}</td>
          <td class="td-op">${esc(op.noOp || '—')}</td>
          <td class="td-desc">${esc(op.name)}</td>
          <td class="td-date">${op.inicioPintura ? this._fmtLong(op.inicioPintura) : ''}</td>
          <td class="td-date td-fin"></td>
          <td class="td-date">${op.salidaFabrica ? this._fmtLong(op.salidaFabrica) : ''}</td>
          <td class="td-aca">${esc(op.acabado || '')}</td>
        </tr>`;
      }).join('');

      return `
        <div class="painter-page">
          <div class="painter-hdr">
            <div class="painter-title">Cronograma de Pintura — ${esc(painter)}</div>
            <div class="painter-date">${todayFmt}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th class="td-num">#</th>
                <th class="td-proj">Cliente / Proyecto</th>
                <th class="td-op">No. OP</th>
                <th class="td-desc">Descripción</th>
                <th class="td-date">Inicio Pintura</th>
                <th class="td-date td-fin">Fin Pintura</th>
                <th class="td-date">Fecha Entrega</th>
                <th class="td-aca">Acabado</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="tbl-footer">${ops.length} ítem${ops.length !== 1 ? 's' : ''} · Wood Concept Planta</div>
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cronograma Pintura — ${todayFmt}</title>
<style>
  @page { size: letter portrait; margin: 0.65in 0.75in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #111; background: #fff; }

  .painter-page { width: 100%; }

  /* ── Page header ── */
  .painter-hdr {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2.5pt solid #8B1A1A;
    padding-bottom: 8pt;
    margin-bottom: 12pt;
  }
  .painter-title { font-size: 15pt; font-weight: 700; color: #8B1A1A; letter-spacing: -0.02em; }
  .painter-date  { font-size: 9.5pt; color: #666; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; orphans: 3; widows: 3; }
  thead tr { background: #f4eeea; }
  th {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #555;
    padding: 6pt 7pt;
    text-align: left;
    border-bottom: 1.5pt solid #c8b8b0;
    white-space: nowrap;
  }
  td {
    padding: 6.5pt 7pt;
    border-bottom: 0.5pt solid #e8e0db;
    vertical-align: middle;
    line-height: 1.35;
  }
  tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #faf8f6; }

  /* ── Column widths ── */
  .td-num  { width: 18pt;  text-align: center; color: #888; font-size: 9.5pt; }
  .td-proj { width: 115pt; font-size: 10pt; color: #111; }
  .td-op   { width: 58pt;  font-weight: 700; color: #8B1A1A; white-space: nowrap; }
  .td-desc { color: #111; }
  .td-date { width: 70pt;  white-space: nowrap; font-size: 10pt; }
  .td-fin  { background: #fffdf0; }
  .painter-page + .painter-page { page-break-before: always; }
  .painter-page:last-child { page-break-after: avoid; }
  .td-aca  { width: 82pt;  font-size: 10pt; }

  /* ── Footer ── */
  .tbl-footer { margin-top: 10pt; font-size: 8.5pt; color: #aaa; text-align: right; }
</style>
</head>
<body>
${paintersHtml}
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Permite ventanas emergentes para imprimir.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  },

  // ── Helpers ───────────────────────────────────────────────

  _urgencyCounts(ops) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let overdue = 0, urgent = 0;
    for (const op of ops) {
      if (!op.salidaFabrica) continue;
      const diff = Math.ceil((op.salidaFabrica - today) / 86400000);
      if (diff < 0) overdue++;
      else if (diff <= 7) urgent++;
    }
    return { overdue, urgent };
  },

  _urgBadgesHtml(overdue, urgent) {
    const parts = [];
    if (overdue > 0) parts.push(`<span class="cron-urg cron-red">${overdue} vencido${overdue > 1 ? 's' : ''}</span>`);
    if (urgent  > 0) parts.push(`<span class="cron-urg cron-amber">${urgent} urgente${urgent > 1 ? 's' : ''}</span>`);
    return parts.join('');
  },

  _opStatusBadge(op) {
    const key = normStr(op.status || '');
    const sd  = STATUS_DISPLAY[key];
    if (sd) return `<span class="status-badge ${sd.cls}">${esc(sd.label)}</span>`;
    const stageLabel = STAGE_LABELS[key];
    if (stageLabel) return `<span class="cron-etapa-pill" style="color:${STAGE_COLORS[key]}">${esc(stageLabel)}</span>`;
    return op.status ? `<span class="cron-etapa-lbl">${esc(op.statusRaw || op.status)}</span>` : '<span class="cron-faint">—</span>';
  },

  _statusInfo(d) {
    if (!d) return { label: 'Sin fecha', cls: 'cron-none' };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff  = Math.ceil((d - today) / 86400000);
    if (diff < 0)   return { label: `Vencido ${-diff}d`, cls: 'cron-red'   };
    if (diff === 0) return { label: 'Hoy',                cls: 'cron-red'   };
    if (diff <= 3)  return { label: `${diff}d`,           cls: 'cron-red'   };
    if (diff <= 7)  return { label: `${diff}d`,           cls: 'cron-amber' };
    return               { label: `${diff}d`,           cls: 'cron-green' };
  },

  _fmtShort(d) {
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  },

  _fmtLong(d) {
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  },

  _toInputVal(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  // ── Edit bindings ─────────────────────────────────────────

  _bindEdits(root) {
    root.querySelectorAll('.cron-date-inp').forEach(inp => {
      inp.addEventListener('change', async () => {
        const { opid, fieldkey } = inp.dataset;
        const op = App._data?.ops.find(o => o.id === opid);
        if (!op) return;
        const val = inp.value;
        if (!val) return;
        const ms = new Date(val + 'T00:00:00').getTime();
        inp.disabled = true;
        try {
          if (fieldkey === 'salidaFabrica') {
            // Built-in ClickUp due date
            await PlantaAPI.setDueDate(opid, ms);
          } else {
            // Custom date field (e.g. inicioPintura)
            const fid = this._fieldIds[fieldkey];
            if (!fid) {
              alert(`Campo ClickUp no detectado para "${fieldkey}". Haz ↻ forzar sincronización.`);
              inp.disabled = false;
              return;
            }
            await PlantaAPI.setField(opid, fid, ms);
          }
          op[fieldkey] = new Date(ms);
          inp.style.outline = '2px solid var(--green)';
          setTimeout(() => { inp.style.outline = ''; inp.disabled = false; }, 1200);
          this._draw();
        } catch (e) {
          alert('Error al actualizar ClickUp: ' + e.message);
          inp.style.outline = '2px solid var(--red)';
          inp.disabled = false;
        }
      });
    });

    root.querySelectorAll('.cron-comment-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const { opid } = inp.dataset;
        if (!opid) return;
        const val = inp.value.trim();
        if (val) {
          localStorage.setItem('wp_cron_comment_' + opid, val);
        } else {
          localStorage.removeItem('wp_cron_comment_' + opid);
        }
      });
    });

    root.querySelectorAll('.cron-text-inp').forEach(inp => {
      inp.addEventListener('change', async () => {
        const { opid, fieldkey } = inp.dataset;
        const fid = this._fieldIds[fieldkey];
        const op  = App._data?.ops.find(o => o.id === opid);
        if (!op || !fid) return;
        inp.disabled = true;
        try {
          await PlantaAPI.setField(opid, fid, inp.value.trim());
          op[fieldkey] = inp.value.trim();
          inp.style.outline = '2px solid var(--green)';
          setTimeout(() => { inp.style.outline = ''; inp.disabled = false; }, 1200);
        } catch (e) {
          alert('Error al actualizar ClickUp: ' + e.message);
          inp.style.outline = '2px solid var(--red)';
          inp.disabled = false;
        }
      });
    });
  },
};
