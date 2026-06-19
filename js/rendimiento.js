// ─────────────────────────────────────────────────────────────
// js/rendimiento.js — Rendimiento tab: performance by person
// ─────────────────────────────────────────────────────────────

const Rendimiento = {
  _period: 'monthly',

  render({ ebanistas, dbData }) {
    const personasMap = App.buildPersonasMap(dbData);
    const rawLog      = dbData?.produccion || [];
    const log         = rawLog.map(r => ({
      name:          r.nombre_op,
      person:        r.persona,
      completedDate: r.fecha_salida,
      isReproceso:   r.es_reproceso,
    }));

    // Controls
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

    // Filter log to current period
    const now      = new Date();
    const filtered = log.filter(e => {
      if (!e.completedDate) return false;
      const d = isoToDate(e.completedDate);
      if (!d) return false;
      if (this._period === 'weekly') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0,0,0,0);
        return d >= startOfWeek;
      } else {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
    });

    const people = ebanistas.length ? ebanistas : Object.keys(personasMap);

    if (!people.length) {
      el('rendimiento-body').innerHTML = '<div class="empty-state"><p>Sincroniza con ClickUp para ver el personal.</p></div>';
      return;
    }

    el('rendimiento-body').innerHTML = `
      <div class="rend-period-label">${this._periodLabel(now)}</div>
      <div class="rend-grid">
        ${people.map(name => this._renderPersonCard(name, personasMap[name] || 'ebanista', filtered)).join('')}
      </div>
    `;
  },

  _renderPersonCard(name, role, filteredLog) {
    const target    = TARGETS[role] || TARGETS.ebanista;
    const meta      = this._period === 'weekly' ? target.weekly : target.monthly;
    const myLog     = filteredLog.filter(e => e.person === name);
    const normal    = myLog.filter(e => !e.isReproceso).length;
    const reproceso = myLog.filter(e => e.isReproceso).length;
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
          <div class="rend-bar-label">${total} / ${meta}</div>
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
                <span class="${e.isReproceso ? 'rend-log-repro' : ''}">${esc(e.name)}</span>
                <span class="muted-txt">${esc(e.completedDate || '')}</span>
              </div>
            `).join('')}
            ${myLog.length > 4 ? `<div class="muted-txt rend-log-more">+${myLog.length - 4} más</div>` : ''}
          </div>
        ` : '<div class="muted-txt rend-empty">Sin completados en este período</div>'}
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
