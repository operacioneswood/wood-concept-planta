// ─────────────────────────────────────────────────────────────
// js/novedades.js — "🔔 Actualizaciones" de Planta: resumen imprimible de
// lo que llegó a fábrica en un periodo y hasta qué etapa avanzó cada OP.
//
// La información sale del historial de estados de ClickUp ("Tiempo en estado"),
// así que cuenta igual si el estado se cambió en ClickUp o en la bitácora.
// No usa tablas propias: no hay nada que instalar en Supabase.
//
// Limitaciones de ClickUp: de cada estado solo se conoce la ÚLTIMA vez que la
// OP entró a él, y no dice quién hizo el cambio.
// ─────────────────────────────────────────────────────────────

const Novedades = {
  _periodo:  '7',            // 'ultima' | '7' | '14' | '30' | 'rango'
  _desde:    '',
  _hasta:    '',
  _excluir:  new Set(),      // proyectos que se quitan del informe
  _items:    [],             // [{ op, proj, eventos[] }]
  _err:      null,
  _cargando: false,
  _seq:      0,
  _nodos:    {},             // id → { name, parent }  (para hallar el proyecto de cada OP)
  _LS:       'wp_novedades_ultima',
  _MESES:    ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'],

  // Estados que cuentan como movimiento (nombres sin acentos, en minúsculas).
  // grupo → se cuenta en las cifras del resumen.
  ETAPAS: {
    'enviado a fabrica':     { label: 'Enviado a fábrica',     icon: '📥', grupo: 'llegada' },
    'corte':                 { label: 'Corte',                 icon: '✂️', grupo: 'corte' },
    'pendiente chapilla':    { label: 'Pendiente chapilla',    icon: '⏳', grupo: null },
    'enchape':               { label: 'Enchape',               icon: '📏', grupo: 'enchape' },
    'ebanisteria':           { label: 'Ebanistería',           icon: '🔨', grupo: 'ebanisteria' },
    'en ebanisteria':        { label: 'Ebanistería',           icon: '🔨', grupo: 'ebanisteria' },
    'pendiente de revision': { label: 'Pendiente de revisión', icon: '🔍', grupo: null },
    'en pintura':            { label: 'Pintura',               icon: '🎨', grupo: 'pintura' },
    'pendiente por obra':    { label: 'Pendiente por obra',    icon: '⏸',  grupo: null },
    'reproceso':             { label: 'Reproceso',             icon: '⚠',  grupo: 'reproceso' },
    'empaque':               { label: 'Empaque',               icon: '📦', grupo: 'empaque' },
    'bodega':                { label: 'Bodega',                icon: '🏬', grupo: null },
    'enviado a instalacion': { label: 'Enviado a instalación', icon: '🚚', grupo: 'instalacion' },
    'en instalacion':        { label: 'En instalación',        icon: '🔧', grupo: 'instalacion' },
  },

  // Cifras del resumen, en este orden.
  GRUPOS: [
    ['llegada',     'Llegaron a fábrica'],
    ['corte',       'Pasaron a Corte'],
    ['enchape',     'Pasaron a Enchape'],
    ['ebanisteria', 'Pasaron a Ebanistería'],
    ['pintura',     'Pasaron a Pintura'],
    ['empaque',     'Pasaron a Empaque'],
    ['instalacion', 'Pasaron a Instalación'],
    ['reproceso',   'Entraron a Reproceso'],
  ],

  // ── Entrada ──────────────────────────────────────────────────
  open() {
    this._ensureCss();
    this._excluir = new Set();
    this._periodo = '7';
    this._desde = this._hasta = '';
    this._items = [];
    this._err = null;
    this._build();
    this._recargar();
  },

  close() {
    document.getElementById('nv-overlay')?.remove();
    document.body.style.overflow = '';
    this._seq++;   // descarta cualquier carga en curso
  },

  _ultimaImpresion() {
    try { const v = localStorage.getItem(this._LS); return v ? new Date(v) : null; } catch { return null; }
  },

  // ── Periodo ──────────────────────────────────────────────────
  _range() {
    const to = new Date();
    let from;
    if (this._periodo === 'rango') {
      from = this._desde ? new Date(this._desde + 'T00:00:00') : new Date(Date.now() - 7 * 86400000);
      const h = this._hasta ? new Date(this._hasta + 'T23:59:59') : to;
      return { from, to: h };
    }
    if (this._periodo === 'ultima') {
      from = this._ultimaImpresion() || new Date(Date.now() - 7 * 86400000);
    } else {
      from = new Date(Date.now() - parseInt(this._periodo, 10) * 86400000);
    }
    return { from, to };
  },

  // ── Datos: historial de estados desde ClickUp ────────────────
  async _recargar() {
    const seq = ++this._seq;
    this._cargando = true;
    this._err = null;
    this._refresh();
    try {
      const items = await this._leerClickUp(this._range());
      if (seq !== this._seq) return;
      this._items = items;
    } catch (e) {
      if (seq !== this._seq) return;
      this._items = [];
      this._err = e.message || String(e);
    }
    this._cargando = false;
    this._refresh();
  },

  async _tareasActualizadas(listId, from) {
    const tareas = [];
    for (let page = 0; page < 50; page++) {
      const data = await PlantaAPI._call(`list/${listId}/task`, {
        date_updated_gt: String(from.getTime()),
        include_closed:  'true',
        subtasks:        'true',
        page:            String(page),
      });
      const lote = data.tasks || [];
      tareas.push(...lote);
      if (lote.length < 100 || data.last_page) break;
    }
    return tareas;
  },

  // Historial de estados de hasta 100 tareas por llamada.
  async _historial(ids) {
    const out = {};
    const trozos = [];
    for (let i = 0; i < ids.length; i += 100) trozos.push(ids.slice(i, i + 100));
    const partes = await Promise.all(trozos.map(async trozo => {
      const url = new URL('https://api.clickup.com/api/v2/task/bulk_time_in_status/task_ids');
      trozo.forEach(id => url.searchParams.append('task_ids', id));
      const res = await fetch(url.toString(), { headers: { Authorization: PlantaAPI.getApiKey() } });
      if (!res.ok) {
        throw new Error(res.status === 401
          ? 'ClickUp rechazó la llave (API key). Revísala en Configuración.'
          : `ClickUp no entregó el historial de estados (error ${res.status}). Revisa que esté activado el ClickApp "Tiempo en estado".`);
      }
      return res.json();
    }));
    partes.forEach(p => Object.assign(out, p));
    return out;
  },

  // Completa los nodos que faltan hacia arriba hasta llegar al proyecto (tarea raíz).
  async _resolverRaices(subs) {
    for (let ronda = 0; ronda < 8; ronda++) {
      const faltan = new Set();
      subs.forEach(t => {
        let cur = this._nodos[t.id], g = 0;
        while (cur && cur.parent && g++ < 15) {
          if (!this._nodos[cur.parent]) { faltan.add(cur.parent); break; }
          cur = this._nodos[cur.parent];
        }
      });
      if (!faltan.size) return;
      await Promise.all([...faltan].map(async id => {
        try {
          const t = await PlantaAPI._call(`task/${id}`);
          this._nodos[id] = { name: t.name || '', parent: t.parent || null };
        } catch {
          this._nodos[id] = { name: '', parent: null };
        }
      }));
    }
  },

  _raiz(id) {
    let cur = this._nodos[id], g = 0;
    while (cur && cur.parent && g++ < 15 && this._nodos[cur.parent]) cur = this._nodos[cur.parent];
    return (cur && cur.name) || '(Sin proyecto)';
  },

  _etq(estado) {
    const e = this.ETAPAS[normStr(estado)];
    if (e) return e.label;
    const s = String(estado || '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  },

  async _leerClickUp({ from, to }) {
    if (!PlantaAPI.getApiKey()) throw new Error('Falta la llave (API key) de ClickUp: configúrala en Configuración.');
    const { listIds } = await PlantaAPI._resolveToListIds(PlantaAPI.getListId());
    const lotes = await Promise.all(listIds.map(l => this._tareasActualizadas(l, from)));
    const vistas = new Set();
    const tareas = lotes.flat().filter(t => vistas.has(t.id) ? false : (vistas.add(t.id), true));
    tareas.forEach(t => { this._nodos[t.id] = { name: t.name || '', parent: t.parent || null }; });

    const subs = tareas.filter(t => t.parent);   // las OPs son subtareas
    if (!subs.length) return [];
    const { fieldIds } = PlantaAPI._detectFields(tareas);
    const noOpDe = t => {
      const cf = (t.custom_fields || []).find(c => c.id === fieldIds.noOp);
      return cf && cf.value !== null && cf.value !== undefined ? String(cf.value).trim() : '';
    };

    const [hist] = await Promise.all([this._historial(subs.map(t => t.id)), this._resolverRaices(subs)]);

    const desdeMs = from.getTime(), hastaMs = to.getTime();
    const items = [];
    subs.forEach(t => {
      const h = hist[t.id];
      if (!h) return;
      const entradas = [...(h.status_history || [])];
      const cur = h.current_status;
      if (cur && !entradas.some(e => normStr(e.status) === normStr(cur.status))) entradas.push(cur);
      // Cuándo entró la OP a cada estado (ClickUp: "since"), en orden.
      const regs = entradas
        .map(e => ({ status: e.status, n: normStr(e.status), ts: Number((e.total_time && e.total_time.since) ?? e.since) }))
        .filter(r => r.ts > 0)
        .sort((a, b) => a.ts - b.ts);
      const eventos = [];
      regs.forEach((r, i) => {
        const et = this.ETAPAS[r.n];
        if (!et || r.ts < desdeMs || r.ts > hastaMs) return;
        eventos.push({ ts: new Date(r.ts), label: et.label, icon: et.icon, grupo: et.grupo, previo: i > 0 ? this._etq(regs[i - 1].status) : null });
      });
      if (!eventos.length) return;
      items.push({
        op:   { id: t.id, name: (t.name || '').trim(), noOp: noOpDe(t) },
        proj: this._raiz(t.id),
        eventos,
      });
    });
    return items;
  },

  // ── Documento (vista previa + impresión) ─────────────────────
  _fmtFecha(d) { return `${d.getDate()} ${this._MESES[d.getMonth()]}`; },

  _docCss() {
    return `
.nv-sheet{font-family:'Segoe UI',Arial,sans-serif;color:#111;font-size:10pt;line-height:1.4;background:#fff;padding:18px 16px}
.nv-title{border-bottom:2.5pt solid #8B1A1A;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.nv-title h1{font-size:15pt;color:#8B1A1A;margin:0;letter-spacing:-.02em}
.nv-per{font-size:9.5pt;color:#555;text-align:right}
.nv-tiles{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 6px}
.nv-tile{flex:1;min-width:105px;border:1px solid #d8d2cb;border-radius:6px;padding:8px 6px;text-align:center}
.nv-tile b{display:block;font-size:20pt;line-height:1.1;color:#111}
.nv-tile span{font-size:8pt;color:#666;text-transform:uppercase;letter-spacing:.04em}
.nv-h2{font-size:11pt;font-weight:700;color:#8B1A1A;margin:16px 0 6px;border-bottom:1px solid #e8e0db;padding-bottom:3px;break-after:avoid}
.nv-vacio{color:#888;font-style:italic;padding:14px 0}
.nv-proj{margin:0 0 16px}
.nv-proj-h{background:#1a1714;color:#fff;padding:7px 12px;font-weight:700;font-size:10pt;letter-spacing:.05em;text-transform:uppercase;display:flex;justify-content:space-between;gap:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-after:avoid}
.nv-proj-h span{font-weight:500;font-size:8.5pt;opacity:.8;text-transform:none;letter-spacing:0}
.nv-row{display:flex;gap:10px;padding:6px 4px;border-bottom:.5pt solid #e5e0da;break-inside:avoid}
.nv-d{width:44px;flex:none;color:#666;font-size:9pt;padding-top:1px}
.nv-i{width:18px;flex:none;text-align:center}
.nv-t{flex:1}
.nv-t b{color:#8B1A1A}
.nv-et{font-weight:700}
.nv-et small{font-weight:400;color:#666}
.nv-prev0{color:#777}
.nv-flecha{color:#999;margin:0 3px}
.nv-foot{margin-top:14px;font-size:8pt;color:#999;text-align:right}
`;
  },

  _rutaHtml(it) {
    const partes = [];
    const primero = it.eventos[0];
    if (primero.previo) partes.push(`<span class="nv-prev0">${esc(primero.previo)}</span>`);
    it.eventos.forEach(e => partes.push(`<span class="nv-et">${esc(e.label)} <small>${this._fmtFecha(e.ts)}</small></span>`));
    return partes.join('<span class="nv-flecha">→</span>');
  },

  _docHtml(data) {
    const { items, from, to } = data;
    const sel = items.filter(it => !this._excluir.has(it.proj));
    const hoy = new Date();
    const f = d => `${d.getDate()} ${this._MESES[d.getMonth()]} ${d.getFullYear()}`;
    const per = `${f(from)} – ${f(to)}`;
    const ultimoEv = it => it.eventos[it.eventos.length - 1].ts;

    const cuenta = g => sel.filter(it => it.eventos.some(e => e.grupo === g)).length;
    const ultimo = {};
    sel.forEach(it => { const t = ultimoEv(it); if (!ultimo[it.proj] || t > ultimo[it.proj]) ultimo[it.proj] = t; });
    const proyectos = Object.keys(ultimo).sort((a, b) => ultimo[b] - ultimo[a]);

    const tile = (n, l) => `<div class="nv-tile"><b>${n}</b><span>${l}</span></div>`;
    const resumen = `
      <div class="nv-tiles">
        ${tile(proyectos.length, 'Proyectos con actividad')}
        ${this.GRUPOS.map(([g, l]) => tile(cuenta(g), l)).join('')}
      </div>`;

    const bloques = proyectos.map(p => {
      const lista = sel.filter(it => it.proj === p).sort((a, b) => ultimoEv(b) - ultimoEv(a));
      return `
        <div class="nv-proj">
          <div class="nv-proj-h">${esc(p)}<span>${lista.length} OP${lista.length !== 1 ? 's' : ''}</span></div>
          ${lista.map(it => {
            const u = it.eventos[it.eventos.length - 1];
            return `
            <div class="nv-row">
              <div class="nv-d">${this._fmtFecha(u.ts)}</div>
              <div class="nv-i">${u.icon}</div>
              <div class="nv-t"><b>${esc(it.op.noOp || '—')}</b> · ${esc(it.op.name)}<br>${this._rutaHtml(it)}</div>
            </div>`;
          }).join('')}
        </div>`;
    }).join('');

    return `
<div class="nv-sheet">
  <div class="nv-title">
    <h1>Resumen de actualizaciones — Planta</h1>
    <div class="nv-per">${per}<br>Generado el ${f(hoy)}</div>
  </div>
  ${sel.length ? resumen : `<div class="nv-vacio">${this._cargando ? 'Consultando ClickUp…' : 'No hay movimientos de estado registrados en este periodo.'}</div>`}
  ${sel.length ? `<div class="nv-detalle"><div class="nv-h2">Detalle por proyecto · ${sel.length} OP${sel.length !== 1 ? 's' : ''} con movimiento</div>${bloques}</div>` : ''}
  <div class="nv-foot">Wood Concept · Planta · Fuente: historial de estados de ClickUp</div>
</div>`;
  },

  _collect() {
    const { from, to } = this._range();
    return { items: this._items, from, to };
  },

  _print() {
    if (this._cargando) { alert('Espera a que termine de cargar.'); return; }
    const data = this._collect();
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Resumen de actualizaciones — Planta</title>
<style>@page{size:letter portrait;margin:0.6in 0.7in} body{margin:0} ${this._docCss()} .nv-sheet{padding:0}</style></head>
<body>${this._docHtml(data)}</body></html>`;
    const win = window.open('', '_blank', 'width=900,height=800');
    if (!win) { alert('Permite ventanas emergentes para imprimir.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    try { localStorage.setItem(this._LS, new Date().toISOString()); } catch {}
    this._refreshOpciones();
    setTimeout(() => win.print(), 300);
  },

  // ── Interfaz ─────────────────────────────────────────────────
  _ensureCss() {
    if (document.getElementById('nv-css')) return;
    const st = document.createElement('style');
    st.id = 'nv-css';
    st.textContent = `
.nv-ov{position:fixed;inset:0;z-index:9000;background:rgba(20,16,12,.55);overflow:auto;-webkit-overflow-scrolling:touch}
.nv-card{background:#faf8f5;width:100%;max-width:980px;margin:0 auto;min-height:100%}
.nv-hdr{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1a1714;color:#fff;font-weight:600}
.nv-x{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 6px}
.nv-body{padding:14px 16px}
.nv-ctl{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px}
.nv-ctl label{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:600;color:#6b645c}
.nv-ctl select,.nv-ctl input[type=date]{font-size:15px;padding:7px 9px;border:1px solid #d8d2cb;border-radius:7px;background:#fff}
.nv-projbox{border:1px solid #d8d2cb;border-radius:8px;background:#fff;padding:8px 12px;margin-bottom:10px;font-size:13px}
.nv-projbox summary{cursor:pointer;font-weight:600}
.nv-projbox label{display:flex;gap:8px;align-items:center;padding:5px 0;cursor:pointer}
.nv-warn{font-size:13px;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin-bottom:10px}
.nv-nota{font-size:12px;color:#6b645c;margin-bottom:10px}
#nv-prev{overflow:auto;background:#e9e4dc;padding:12px;border-radius:8px}
#nv-prev .nv-sheet{max-width:780px;margin:0 auto;box-shadow:0 1px 6px rgba(0,0,0,.2)}
` + this._docCss();
    document.head.appendChild(st);
  },

  _build() {
    this.close();
    const ov = document.createElement('div');
    ov.className = 'nv-ov';
    ov.id = 'nv-overlay';
    ov.innerHTML = `
<div class="nv-card">
  <div class="nv-hdr"><span>🔔 Actualizaciones de Planta</span><button class="nv-x" data-a="close" title="Cerrar">✕</button></div>
  <div class="nv-body">
    <div class="nv-ctl">
      <label>Periodo
        <select id="nv-periodo" data-f="periodo"></select>
      </label>
      <span id="nv-rango" style="display:none;gap:8px;align-items:flex-end">
        <label>Desde <input type="date" data-f="desde"></label>
        <label>Hasta <input type="date" data-f="hasta"></label>
      </span>
      <button class="btn-primary" data-a="print">🖨 Imprimir informe</button>
    </div>
    <div class="nv-nota">Lo que llegó a fábrica (Enviado a fábrica) y hasta qué etapa avanzó cada OP, según el historial de estados de ClickUp.</div>
    <div id="nv-warn"></div>
    <details class="nv-projbox" id="nv-projbox"><summary id="nv-projsum">Proyectos</summary><div id="nv-projlist"></div></details>
    <div id="nv-prev"><div class="nv-vacio">Consultando ClickUp…</div></div>
  </div>
</div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    this._refreshOpciones();

    ov.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset?.f === 'periodo') {
        this._periodo = t.value;
        document.getElementById('nv-rango').style.display = this._periodo === 'rango' ? 'flex' : 'none';
        this._recargar();
      } else if (t.dataset?.f === 'desde' || t.dataset?.f === 'hasta') {
        this['_' + t.dataset.f] = t.value;
        this._recargar();
      } else if (t.dataset?.proj !== undefined) {
        if (t.checked) this._excluir.delete(t.dataset.proj); else this._excluir.add(t.dataset.proj);
        this._refresh(true);
      }
    });
    ov.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') this.close();
      else if (a === 'print') this._print();
      else if (a === 'todos')   { this._excluir.clear(); this._refresh(); }
      else if (a === 'ninguno') { this._projNombres().forEach(p => this._excluir.add(p)); this._refresh(); }
    });
  },

  _refreshOpciones() {
    const sel = document.getElementById('nv-periodo');
    if (!sel) return;
    const ult = this._ultimaImpresion();
    const f = d => `${this._fmtFecha(d)}, ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    sel.innerHTML = `
      <option value="7">Últimos 7 días</option>
      <option value="14">Últimos 14 días</option>
      <option value="30">Últimos 30 días</option>
      <option value="ultima">Desde la última impresión${ult ? ` (${f(ult)})` : ' (aún no hay: usa 7 días)'}</option>
      <option value="rango">Rango de fechas…</option>`;
    sel.value = this._periodo;
  },

  _projNombres() {
    return [...new Set(this._items.map(it => it.proj))].sort((a, b) => a.localeCompare(b));
  },

  _refresh(soloVista) {
    const warn = document.getElementById('nv-warn');
    if (warn) warn.innerHTML = this._err ? `<div class="nv-warn">⚠ ${esc(this._err)}</div>` : '';

    const nombres = this._projNombres();
    const resumenProy = () => {
      const sum = document.getElementById('nv-projsum');
      if (sum) {
        const n = nombres.filter(p => !this._excluir.has(p)).length;
        sum.innerHTML = `Proyectos: <b>${n === nombres.length ? 'todos' : n + ' de ' + nombres.length}</b> (${nombres.length} con actividad)`;
      }
    };
    if (!soloVista) {
      const cuenta = p => this._items.filter(it => it.proj === p).length;
      const list = document.getElementById('nv-projlist');
      if (list) {
        list.innerHTML = nombres.length
          ? `<div style="margin:4px 0 6px"><button class="nv-link" data-a="todos" style="background:none;border:0;color:#8B1A1A;text-decoration:underline;cursor:pointer">Todos</button> · <button class="nv-link" data-a="ninguno" style="background:none;border:0;color:#8B1A1A;text-decoration:underline;cursor:pointer">Ninguno</button></div>` +
            nombres.map(p => `<label><input type="checkbox" data-proj="${esc(p)}" ${this._excluir.has(p) ? '' : 'checked'}> ${esc(p)} <span style="color:#888">(${cuenta(p)})</span></label>`).join('')
          : `<div style="color:#888;padding:4px 0">${this._cargando ? 'Cargando…' : 'Sin actividad en este periodo.'}</div>`;
      }
    }
    resumenProy();
    const prev = document.getElementById('nv-prev');
    if (prev) prev.innerHTML = this._docHtml(this._collect());
  },
};
