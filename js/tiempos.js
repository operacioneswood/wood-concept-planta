// ─────────────────────────────────────────────────────────────
// js/tiempos.js — Tiempos modal: register start/end times per stage
// ─────────────────────────────────────────────────────────────

const Tiempos = {
  _op: null,

  async open(op) {
    this._op = op;
    const overlay = el('tiempos-overlay');
    if (!overlay) return;

    // Show loading state
    el('tiempos-op-label').textContent = `${op.noOp ? op.noOp + ' — ' : ''}${op.name}`;
    el('tiempos-tbody').innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">Cargando...</td></tr>';
    overlay.style.display = 'flex';

    // Load existing records
    let map = {};
    try {
      const existing = await DB.getTiempos(op.id);
      for (const t of (existing || [])) map[t.etapa] = t;
    } catch (e) {
      console.warn('[Tiempos] load failed:', e.message);
    }

    this._renderRows(map);
  },

  _renderRows(map) {
    const tbody = el('tiempos-tbody');
    if (!tbody) return;

    tbody.innerHTML = STAGES.map(s => {
      const t = map[s.id] || {};
      const dur = this._calcDuration(t.fecha_inicio, t.hora_inicio, t.fecha_fin, t.hora_fin);
      return `
        <tr data-etapa="${esc(s.id)}">
          <td class="t-etapa-lbl" style="color:${s.color}">${esc(s.label)}</td>
          <td><input type="date" class="t-inp t-fi" value="${t.fecha_inicio || ''}"></td>
          <td><input type="time" class="t-inp t-hi" value="${t.hora_inicio || ''}"></td>
          <td><input type="date" class="t-inp t-ff" value="${t.fecha_fin   || ''}"></td>
          <td><input type="time" class="t-inp t-hf" value="${t.hora_fin    || ''}"></td>
          <td class="t-dur" id="tdur-${esc(s.id)}">${dur}</td>
        </tr>
      `;
    }).join('');

    // Live duration update on any field change
    tbody.querySelectorAll('tr[data-etapa]').forEach(row => {
      row.querySelectorAll('.t-inp').forEach(inp => {
        inp.addEventListener('change', () => this._refreshDuration(row));
      });
    });
  },

  _refreshDuration(row) {
    const fi = row.querySelector('.t-fi').value;
    const hi = row.querySelector('.t-hi').value;
    const ff = row.querySelector('.t-ff').value;
    const hf = row.querySelector('.t-hf').value;
    const durEl = el('tdur-' + row.dataset.etapa);
    if (durEl) durEl.textContent = this._calcDuration(fi, hi, ff, hf);
  },

  _calcDuration(fi, hi, ff, hf) {
    if (!fi || !ff) return '—';
    const start = new Date(`${fi}T${hi || '00:00'}`);
    const end   = new Date(`${ff}T${hf || '00:00'}`);
    const mins  = Math.round((end - start) / 60000);
    if (isNaN(mins) || mins < 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}min`;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  },

  async save() {
    const op = this._op;
    if (!op) return;

    const btn  = el('btn-tiempos-save');
    const orig = btn.textContent;
    btn.textContent = 'Guardando...'; btn.disabled = true;

    try {
      const rows = document.querySelectorAll('#tiempos-tbody tr[data-etapa]');
      for (const row of rows) {
        const etapa = row.dataset.etapa;
        const fi = row.querySelector('.t-fi').value;
        const hi = row.querySelector('.t-hi').value;
        const ff = row.querySelector('.t-ff').value;
        const hf = row.querySelector('.t-hf').value;
        if (!fi && !hi && !ff && !hf) continue; // skip fully empty rows
        await DB.upsertTiempo({
          op_id:        op.id,
          nombre_op:    op.name,
          etapa,
          fecha_inicio: fi || null,
          hora_inicio:  hi || null,
          fecha_fin:    ff || null,
          hora_fin:     hf || null,
        });
      }
      btn.textContent = '✓ Guardado';
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    } catch (e) {
      alert('Error al guardar: ' + e.message);
      btn.textContent = orig; btn.disabled = false;
    }
  },

  close() {
    const overlay = el('tiempos-overlay');
    if (overlay) overlay.style.display = 'none';
    this._op = null;
  },
};
