// ─────────────────────────────────────────────────────────────
// js/reprocesos.js — Sección "⚠ Reprocesos" (la misma en la bitácora de
// Instalación y en la de Planta).
//
// Lee la tabla compartida `reprocesos` de Supabase. Las respuestas del
// formulario de reprocesos llegan solas (las manda un Apps Script desde la
// hoja de respuestas) y también se pueden agregar a mano. Cada reproceso se
// marca "En sitio" o "Regresa a fábrica" y, al terminar, se oculta de la
// lista de abiertos (queda guardado en "Ver terminados").
// ─────────────────────────────────────────────────────────────

const Reprocesos = {
  _rows:     [],
  _ok:       null,          // null = sin cargar · true = tabla disponible · false = error
  _err:      null,
  _loadedAt: 0,
  _loading:  null,
  _root:     null,
  _ops:      [],
  _opMap:    {},
  _f:        { q: '', atencion: '', origen: '', ver: 'abiertos' },
  _MESES:    ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'],

  // ── Datos ────────────────────────────────────────────────────
  openCount() { return this._rows.filter(r => r.estado !== 'terminado').length; },

  _updateLabels() {
    document.querySelectorAll('[data-repro-count]').forEach(e => { e.textContent = this.openCount(); });
  },

  // Pide la tabla a la base. Se llama al sincronizar y al abrir la sección.
  refresh(force = false) {
    if (this._loading) return this._loading;
    if (!force && this._ok && Date.now() - this._loadedAt < 60000) return Promise.resolve();
    this._loading = (async () => {
      try {
        const { data, error } = await DB._sb.from('reprocesos').select('*')
          .order('fecha', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }).limit(3000);
        if (error) throw error;
        this._rows = data || [];
        this._ok = true; this._err = null;
      } catch (e) {
        this._ok = false; this._err = e.message || String(e);
      }
      this._loadedAt = Date.now();
      this._loading = null;
      this._updateLabels();
      if (this._root && document.body.contains(this._root)) this._draw();
    })();
    return this._loading;
  },

  _setOps(ops) {
    this._ops = ops || [];
    this._opMap = {};
    for (const o of this._ops) {
      if (!o.noOp) continue;
      const k = String(o.noOp).trim();
      this._opMap[k] = o;
      const m = k.match(/^(\d{4,6})-(\d{1,3})$/);          // "26027-5" también se encuentra como "26027-05"
      if (m) this._opMap[`${m[1]}-${String(m[2]).padStart(2, '0')}`] = this._opMap[`${m[1]}-${String(m[2]).padStart(2, '0')}`] || o;
    }
  },

  // "OP. 25177-02/03" → ['25177-02', '25177-03']
  _parseOps(texto) {
    const out = [];
    const pad = n => String(n).padStart(2, '0');
    const re = /(\d{4,6})\s*-\s*(\d{1,3})((?:\s*[\/,y&]\s*\d{1,3})*)/gi;
    let m;
    while ((m = re.exec(texto || ''))) {
      out.push(`${m[1]}-${pad(m[2])}`);
      (m[3].match(/\d{1,3}/g) || []).forEach(n => out.push(`${m[1]}-${pad(n)}`));
    }
    return out;
  },

  // OPs reales a las que se refiere el reproceso: por los números que traiga el texto,
  // o por el valor tal cual (p. ej. "26076", una OP sin guion).
  _opsDe(r) {
    const claves = this._parseOps(r.op_texto);
    const crudo = (r.op_texto || '').trim();
    if (crudo) claves.push(crudo);
    const vistos = new Set();
    const out = [];
    claves.forEach(k => { const o = this._opMap[k]; if (o && !vistos.has(o.id)) { vistos.add(o.id); out.push(o); } });
    return out;
  },

  // ── Entrada ──────────────────────────────────────────────────
  mount(root, { ops } = {}) {
    this._root = root;
    this._setOps(ops);
    this._ensureCss();
    this._draw();
    this.refresh(true);
  },

  // ── Dibujo ───────────────────────────────────────────────────
  _fmt(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return `${d} ${this._MESES[m - 1]}`;
  },

  _hace(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const dias = Math.floor((Date.now() - new Date(y, m - 1, d, 12).getTime()) / 86400000);
    return dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
  },

  _norm(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); },

  _filtrar() {
    const q = this._norm(this._f.q);
    return this._rows.filter(r => {
      if ((this._f.ver === 'terminados') !== (r.estado === 'terminado')) return false;
      if (this._f.atencion === 'sin' && r.atencion) return false;
      if (this._f.atencion && this._f.atencion !== 'sin' && r.atencion !== this._f.atencion) return false;
      if (this._f.origen && this._norm(r.origen) !== this._f.origen) return false;
      if (!q) return true;
      return this._norm([r.cliente, r.op_texto, r.pieza, r.motivo, r.encargado, r.disenador, r.acabado].join(' ')).includes(q);
    });
  },

  _origenCls(o) {
    const k = this._norm(o);
    return k.startsWith('dise') ? 'dis' : k.startsWith('fabr') ? 'fab' : k.startsWith('inst') ? 'ins' : k.startsWith('clie') ? 'cli' : 'otr';
  },

  _card(r) {
    const term = r.estado === 'terminado';
    const ops  = this._opsDe(r);
    const opTxt = ops.length
      ? ops.map(o => `<b>${esc(o.noOp)}</b> · ${esc(o.name)}`).join('<br>')
      : `<b>${esc(r.op_texto || '—')}</b>`;
    const imgs = (r.imagen_url || '').split(/[,\s]+/).filter(u => /^https?:\/\//.test(u));
    return `
      <div class="rp-card ${term ? 'rp-done' : ''}" data-id="${esc(r.id)}">
        <div class="rp-top">
          <span class="rp-badge rp-${this._origenCls(r.origen)}">${esc(r.origen || 'Sin origen')}</span>
          <span class="rp-op">${opTxt}</span>
          <span class="rp-fecha">${esc(this._fmt(r.fecha))}${term ? '' : ` · <i>${esc(this._hace(r.fecha))}</i>`}</span>
        </div>
        <div class="rp-pieza">${esc(r.pieza || '—')}${r.cantidad ? ` <span class="rp-dim">× ${esc(r.cantidad)}</span>` : ''}${r.acabado ? ` <span class="rp-dim">· ${esc(r.acabado)}</span>` : ''}</div>
        ${r.motivo ? `<div class="rp-motivo">${esc(r.motivo)}</div>` : ''}
        <div class="rp-meta">
          ${r.encargado ? `<span>Reportó: ${esc(r.encargado)}</span>` : ''}
          ${r.disenador ? `<span>Diseñador: ${esc(r.disenador)}</span>` : ''}
          ${imgs.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">📎 Imagen${imgs.length > 1 ? ' ' + (i + 1) : ''}</a>`).join('')}
        </div>
        <div class="rp-acts">
          ${term
            ? `<span class="rp-dim">Terminado ${r.terminado_en ? esc(this._fmt(r.terminado_en)) : ''}</span>
               <button class="btn-secondary btn-sm" data-rp="reabrir" data-id="${esc(r.id)}">↩ Reabrir</button>
               <button class="btn-secondary btn-sm" data-rp="borrar" data-id="${esc(r.id)}" title="Borrar definitivamente">🗑</button>`
            : `<label class="rp-sel">Se atiende:
                 <select data-rp="atencion" data-id="${esc(r.id)}">
                   <option value="" ${!r.atencion ? 'selected' : ''}>Sin definir</option>
                   <option value="sitio" ${r.atencion === 'sitio' ? 'selected' : ''}>En sitio</option>
                   <option value="fabrica" ${r.atencion === 'fabrica' ? 'selected' : ''}>Regresa a fábrica</option>
                 </select></label>
               <button class="btn-primary btn-sm" data-rp="terminar" data-id="${esc(r.id)}">✔ Terminado</button>`}
        </div>
      </div>`;
  },

  _draw() {
    const root = this._root;
    if (!root) return;
    const f = this._filtrar();
    const abiertos = this._rows.filter(r => r.estado !== 'terminado').length;
    const terminados = this._rows.length - abiertos;

    // Agrupa por cliente: primero el que tiene el reproceso más reciente.
    const grupos = new Map();
    f.forEach(r => { const k = (r.cliente || 'Sin cliente').trim().toUpperCase(); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); });
    const orden = [...grupos.entries()].sort((a, b) => String(b[1][0].fecha || '').localeCompare(String(a[1][0].fecha || '')));

    const aviso = this._ok === false
      ? `<div class="rp-warn">⚠ No se pudo cargar la tabla de reprocesos (${esc(this._err || '')}). Si es la primera vez, falta crear la tabla <b>reprocesos</b> en Supabase (SQL pendiente).</div>`
      : '';

    root.innerHTML = `
      <div class="rp-wrap">
        <div class="rp-bar">
          <input type="search" class="asign-search-input rp-q" placeholder="Buscar cliente, OP, pieza o motivo..." value="${esc(this._f.q)}">
          <select class="rp-fa" data-rp="f-atencion">
            <option value="">Todos</option>
            <option value="sitio" ${this._f.atencion === 'sitio' ? 'selected' : ''}>En sitio</option>
            <option value="fabrica" ${this._f.atencion === 'fabrica' ? 'selected' : ''}>Regresa a fábrica</option>
            <option value="sin" ${this._f.atencion === 'sin' ? 'selected' : ''}>Sin definir</option>
          </select>
          <select class="rp-fo" data-rp="f-origen">
            <option value="">Cualquier origen</option>
            ${['diseno', 'fabrica', 'instalacion', 'cliente'].map(o => `<option value="${o}" ${this._f.origen === o ? 'selected' : ''}>${{ diseno: 'Diseño', fabrica: 'Fábrica', instalacion: 'Instalación', cliente: 'Cliente' }[o]}</option>`).join('')}
          </select>
          <button class="btn-primary btn-sm" data-rp="nuevo">＋ Nuevo reproceso</button>
        </div>
        <div class="rp-tabs">
          <button class="rp-tab ${this._f.ver === 'abiertos' ? 'on' : ''}" data-rp="ver" data-v="abiertos">Abiertos (${abiertos})</button>
          <button class="rp-tab ${this._f.ver === 'terminados' ? 'on' : ''}" data-rp="ver" data-v="terminados">Ver terminados (${terminados})</button>
        </div>
        ${aviso}
        ${this._ok === null ? '<div class="cron-empty">Cargando reprocesos…</div>'
          : !orden.length ? `<div class="cron-empty">${this._f.ver === 'terminados' ? 'No hay reprocesos terminados.' : 'No hay reprocesos abiertos. 🎉'}</div>`
          : orden.map(([cli, items]) => `
            <div class="cron-block">
              <div class="cron-block-hdr"><span class="cron-hdr-name">${esc(cli)}</span><span class="cron-hdr-meta"><span class="cron-hdr-count">${items.length} reproceso${items.length !== 1 ? 's' : ''}</span></span></div>
              <div class="rp-list">${items.map(r => this._card(r)).join('')}</div>
            </div>`).join('')}
      </div>`;

    const q = root.querySelector('.rp-q');
    q.addEventListener('input', () => {
      this._f.q = q.value;
      const pos = q.selectionStart;
      this._draw();
      const nq = root.querySelector('.rp-q'); nq.focus(); nq.setSelectionRange(pos, pos);
    });
    root.onchange = e => this._onChange(e);
    root.onclick  = e => this._onClick(e);
  },

  _onChange(e) {
    const t = e.target, a = t.dataset?.rp;
    if (a === 'f-atencion') { this._f.atencion = t.value; this._draw(); }
    else if (a === 'f-origen') { this._f.origen = t.value; this._draw(); }
    else if (a === 'atencion') this._update(t.dataset.id, { atencion: t.value || null });
  },

  _onClick(e) {
    const b = e.target.closest('[data-rp]');
    if (!b) return;
    const a = b.dataset.rp, id = b.dataset.id;
    if (a === 'ver') { this._f.ver = b.dataset.v; this._draw(); }
    else if (a === 'nuevo') this._nuevo();
    else if (a === 'terminar') this._update(id, { estado: 'terminado', terminado_en: new Date().toISOString() });
    else if (a === 'reabrir') this._update(id, { estado: 'abierto', terminado_en: null });
    else if (a === 'borrar') this._borrar(id);
  },

  async _update(id, campos) {
    const r = this._rows.find(x => x.id === id);
    if (!r) return;
    const antes = { ...r };
    Object.assign(r, campos);
    this._updateLabels();
    this._draw();
    try {
      const { error } = await DB._sb.from('reprocesos').update(campos).eq('id', id);
      if (error) throw error;
    } catch (e) {
      Object.assign(r, antes);
      this._updateLabels();
      this._draw();
      alert('No se pudo guardar el cambio: ' + (e.message || e));
    }
  },

  async _borrar(id) {
    if (!confirm('¿Borrar este reproceso definitivamente? No se puede deshacer.')) return;
    try {
      const { error } = await DB._sb.from('reprocesos').delete().eq('id', id);
      if (error) throw error;
      this._rows = this._rows.filter(r => r.id !== id);
      this._updateLabels();
      this._draw();
    } catch (e) { alert('No se pudo borrar: ' + (e.message || e)); }
  },

  // ── Agregar a mano ───────────────────────────────────────────
  _nuevo() {
    document.getElementById('rp-modal')?.remove();
    const hoy = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const m = document.createElement('div');
    m.id = 'rp-modal';
    m.className = 'rp-ov';
    const campo = (k, lbl, tipo = 'text', extra = '') => `<label>${lbl}<input type="${tipo}" data-k="${k}" ${extra}></label>`;
    m.innerHTML = `
      <div class="rp-card-modal">
        <div class="rp-mh"><b>＋ Nuevo reproceso</b><button class="rp-x" data-m="x">✕</button></div>
        <div class="rp-mb">
          ${campo('fecha', 'Fecha', 'date', `value="${hoy}"`)}
          ${campo('encargado', 'Nombre del encargado')}
          ${campo('cliente', 'Cliente')}
          ${campo('op_texto', 'OP', 'text', 'list="rp-ops" placeholder="ej. 26058-04"')}
          <datalist id="rp-ops">${this._ops.filter(o => o.noOp).slice(0, 400).map(o => `<option value="${esc(o.noOp)}">${esc(o.name)}</option>`).join('')}</datalist>
          ${campo('cantidad', 'Cantidad')}
          ${campo('acabado', 'Acabado')}
          ${campo('pieza', 'Pieza')}
          <label>Origen del reproceso
            <select data-k="origen"><option>Diseño</option><option>Fabrica</option><option>Instalacion</option><option>Cliente</option></select></label>
          ${campo('disenador', 'Nombre del diseñador')}
          <label>Se atiende
            <select data-k="atencion"><option value="">Sin definir</option><option value="sitio">En sitio</option><option value="fabrica">Regresa a fábrica</option></select></label>
          <label class="rp-full">Motivo del reproceso<textarea data-k="motivo" rows="3"></textarea></label>
        </div>
        <div class="rp-mf"><button class="btn-secondary" data-m="x">Cancelar</button><button class="btn-primary" data-m="ok">Guardar</button></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', async e => {
      const a = e.target.closest('[data-m]')?.dataset.m;
      if (a === 'x' || e.target === m) { m.remove(); return; }
      if (a !== 'ok') return;
      const rec = {};
      m.querySelectorAll('[data-k]').forEach(i => { rec[i.dataset.k] = i.value.trim() || null; });
      if (!rec.cliente && !rec.op_texto) { alert('Escribe al menos el cliente o la OP.'); return; }
      try {
        const { data, error } = await DB._sb.from('reprocesos').insert({ ...rec, estado: 'abierto' }).select().single();
        if (error) throw error;
        this._rows.unshift(data);
        this._updateLabels();
        m.remove();
        this._draw();
      } catch (e2) { alert('No se pudo guardar: ' + (e2.message || e2)); }
    });
  },

  // ── Estilos ──────────────────────────────────────────────────
  _ensureCss() {
    if (document.getElementById('rp-css')) return;
    const st = document.createElement('style');
    st.id = 'rp-css';
    st.textContent = `
.rp-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 0 6px}
.rp-bar .rp-q{flex:1;min-width:200px}
.rp-bar select{font-size:14px;padding:7px 9px;border:1px solid #d8d2cb;border-radius:7px;background:#fff}
.rp-tabs{display:flex;gap:6px;margin:6px 0 12px}
.rp-tab{border:1px solid #d8d2cb;background:#fff;border-radius:18px;padding:5px 14px;font-size:13px;cursor:pointer}
.rp-tab.on{background:#1a1714;color:#fff;border-color:#1a1714}
.rp-warn{font-size:13px;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin-bottom:10px}
.rp-list{padding:6px 10px 10px}
.rp-card{border:1px solid #e3ddd4;border-radius:9px;background:#fff;padding:10px 12px;margin-top:8px}
.rp-card.rp-done{opacity:.75;background:#f7f4ef}
.rp-top{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
.rp-op{flex:1;min-width:160px;font-size:13px}
.rp-op b{color:#8B1A1A}
.rp-fecha{font-size:12px;color:#6b645c;white-space:nowrap}
.rp-badge{font-size:11px;font-weight:700;border-radius:4px;padding:2px 8px;text-transform:uppercase;letter-spacing:.03em}
.rp-dis{background:#ede9fe;color:#5b21b6}.rp-fab{background:#ffedd5;color:#9a3412}.rp-ins{background:#dbeafe;color:#1e40af}.rp-cli{background:#fce7f3;color:#9d174d}.rp-otr{background:#eee;color:#555}
.rp-pieza{font-weight:600;margin-top:6px;font-size:14px}
.rp-dim{font-weight:400;color:#6b645c}
.rp-motivo{margin-top:4px;font-size:13px;white-space:pre-wrap}
.rp-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#6b645c;margin-top:6px}
.rp-meta a{color:#8B1A1A}
.rp-acts{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed #e8e0db}
.rp-sel{font-size:12px;color:#6b645c;display:flex;gap:6px;align-items:center}
.rp-sel select{font-size:13px;padding:4px 6px;border:1px solid #d8d2cb;border-radius:6px;background:#fff}
.rp-ov{position:fixed;inset:0;z-index:9000;background:rgba(20,16,12,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px}
.rp-card-modal{background:#faf8f5;border-radius:12px;width:100%;max-width:620px}
.rp-mh{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1a1714;color:#fff;border-radius:12px 12px 0 0}
.rp-x{background:none;border:0;color:#fff;font-size:20px;cursor:pointer}
.rp-mb{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;padding:14px 16px}
.rp-mb label{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:600;color:#6b645c}
.rp-mb input,.rp-mb select,.rp-mb textarea{font-size:16px;padding:7px 9px;border:1px solid #d8d2cb;border-radius:7px;background:#fff;font-family:inherit}
.rp-full{grid-column:1/-1}
.rp-mf{display:flex;justify-content:flex-end;gap:8px;padding:0 16px 14px}
@media(max-width:560px){.rp-mb{grid-template-columns:1fr}}
`;
    document.head.appendChild(st);
  },
};
