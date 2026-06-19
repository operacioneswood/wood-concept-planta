// ─────────────────────────────────────────────────────────────
// js/rendimiento.js — Rendimiento tab: performance by person
//   Ebanistas  → count completed stages from historial table
//   Contratistas + Pintores → count completed OPs from produccion table
// ─────────────────────────────────────────────────────────────

const Rendimiento = {
  _period: 'monthly',

  render({ ebanistas, dbData }) {
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
        this.render({ ebanistas, dbData });
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

    const sections = [];

    if (ebanistasData.length) {
      sections.push(`
        <div class="rend-section-title">
          Ebanistas
          <span class="rend-section-sub">por etapa completada</span>
        </div>
        <div class="rend-grid">
          ${ebanistasData.map(name => this._cardHistorial(name, 'ebanista', filteredHistorial)).join('')}
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
          ${contratistasData.map(name => this._cardProduccion(name, 'contratista', filteredProduccion)).join('')}
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
          ${pintoresData.map(name => this._cardProduccion(name, 'pintor', filteredProduccion)).join('')}
        </div>
      `);
    }

    el('rendimiento-body').innerHTML = `
      <div class="rend-period-label">${this._periodLabel(now)}</div>
      ${sections.join('')}
    `;
  },

  // Ebanistas: each row in historial with fecha_fin = 1 etapa completed
  _cardHistorial(name, role, filteredHistorial) {
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
            ${myRows.slice(0, 4).map(r => `
              <div class="rend-log-item">
                <span class="${r.es_reproceso ? 'rend-log-repro' : ''}">${esc(STAGE_LABELS[r.etapa] || r.etapa)}</span>
                <span class="muted-txt">${esc(r.fecha_fin || '')}</span>
              </div>
            `).join('')}
            ${myRows.length > 4 ? `<div class="muted-txt rend-log-more">+${myRows.length - 4} más</div>` : ''}
          </div>
        ` : '<div class="muted-txt rend-empty">Sin etapas completadas en este período</div>'}
      </div>
    `;
  },

  // Contratistas + Pintores: each row in produccion = 1 OP completed
  _cardProduccion(name, role, filteredProduccion) {
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
      </div>
    `;
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
