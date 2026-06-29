// ─────────────────────────────────────────────────────────────
// js/tiempos.js — Tiempos modal: register start/end times per stage
// ─────────────────────────────────────────────────────────────

const Tiempos = {
  _op: null,

  _dateToFecha(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _dateToHora(d) {
    if (!d) return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  async open(op) {
    this._op = op;
    const overlay = el('tiempos-overlay');
    if (!overlay) return;

    el('tiempos-op-label').textContent = `${op.noOp ? op.noOp + ' — ' : ''}${op.name}`;
    el('tiempos-tbody').innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">Cargando...</td></tr>';
    overlay.style.display = 'flex';

    let map = {};
    try {
      const existing = await DB.getTiempos(op.id);
      for (const t of (existing || [])) map[t.etapa] = t;
    } catch (e) {
      console.warn('[Tiempos] load failed:', e.message);
    }

    // Pre-populate from ClickUp dates for stages not yet in Supabase
    for (const ts of TIEMPO_STAGES) {
      if (map[ts.id]) continue;
      const inicioKey  = STAGE_INICIO[ts.id];
      const finKey     = STAGE_FIN[ts.id];
      const inicioDate = op[inicioKey];
      const finDate    = op[finKey];
      if (inicioDate || finDate) {
        map[ts.id] = {
          fecha_inicio: this._dateToFecha(inicioDate),
          hora_inicio:  this._dateToHora(inicioDate),
          fecha_fin:    this._dateToFecha(finDate),
          hora_fin:     this._dateToHora(finDate),
        };
      }
    }

    this._renderRows(map);
  },

  _renderRows(map) {
    const tbody = el('tiempos-tbody');
    if (!tbody) return;

    // Build rows: one main row per TIEMPO_STAGE + collapsed sub-rows
    const rows = TIEMPO_STAGES.flatMap(s => {
      const t   = map[s.id] || {};
      const dur = this._calcDuration(t.fecha_inicio, t.hora_inicio, t.fecha_fin, t.hora_fin);

      const mainRow = `
        <tr data-etapa="${esc(s.id)}" class="t-main-row">
          <td class="t-etapa-lbl" style="color:${s.color}">
            <span>${esc(s.label)}</span>
            ${s.subs?.length ? `<button class="t-expand-btn" data-stage="${esc(s.id)}" title="Ver subprocesos">⊕</button>` : ''}
          </td>
          <td><input type="date" class="t-inp t-fi" value="${t.fecha_inicio || ''}"></td>
          <td><input type="time" class="t-inp t-hi" value="${t.hora_inicio || ''}"></td>
          <td><input type="date" class="t-inp t-ff" value="${t.fecha_fin   || ''}"></td>
          <td><input type="time" class="t-inp t-hf" value="${t.hora_fin    || ''}"></td>
          <td class="t-dur" id="tdur-${esc(s.id)}">${dur}</td>
        </tr>
      `;

      const subRows = (s.subs || []).map(sub => {
        const st   = map[sub.id] || {};
        const sdur = this._calcDuration(st.fecha_inicio, st.hora_inicio, st.fecha_fin, st.hora_fin);
        return `
          <tr data-etapa="${esc(sub.id)}" class="t-sub-row t-sub-of-${esc(s.id)}" style="display:none">
            <td class="t-etapa-lbl t-sub-lbl" style="color:${s.color}">↳ ${esc(sub.label)}</td>
            <td><input type="date" class="t-inp t-fi" value="${st.fecha_inicio || ''}"></td>
            <td><input type="time" class="t-inp t-hi" value="${st.hora_inicio || ''}"></td>
            <td><input type="date" class="t-inp t-ff" value="${st.fecha_fin   || ''}"></td>
            <td><input type="time" class="t-inp t-hf" value="${st.hora_fin    || ''}"></td>
            <td class="t-dur" id="tdur-${esc(sub.id)}">${sdur}</td>
          </tr>
        `;
      });

      return [mainRow, ...subRows];
    });

    tbody.innerHTML = rows.join('');

    // Live duration update on any field change
    tbody.querySelectorAll('tr[data-etapa]').forEach(row => {
      row.querySelectorAll('.t-inp').forEach(inp => {
        inp.addEventListener('change', () => this._refreshDuration(row));
      });
    });

    // Expand/collapse sub-process rows
    tbody.querySelectorAll('.t-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stage   = btn.dataset.stage;
        const subRows = tbody.querySelectorAll(`.t-sub-of-${stage}`);
        const isOpen  = btn.textContent === '⊖';
        subRows.forEach(r => r.style.display = isOpen ? 'none' : '');
        btn.textContent = isOpen ? '⊕' : '⊖';
      });
    });

    // Auto-expand stages that already have sub-data saved
    for (const s of TIEMPO_STAGES) {
      if (!s.subs?.length) continue;
      const hasSubData = s.subs.some(sub => map[sub.id]);
      if (hasSubData) {
        const btn = tbody.querySelector(`.t-expand-btn[data-stage="${s.id}"]`);
        if (btn) btn.click();
      }
    }
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
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}min`);
    return parts.length ? parts.join(' ') : '0min';
  },

  async save() {
    const op = this._op;
    if (!op) return;

    const btn  = el('btn-tiempos-save');
    const orig = btn.textContent;
    btn.textContent = 'Guardando...'; btn.disabled = true;

    const toMs = (fecha, hora) => {
      if (!fecha) return null;
      const dt = new Date(`${fecha}T${hora || '00:00'}:00`);
      return isNaN(dt.getTime()) ? null : dt.getTime();
    };

    try {
      const rows = document.querySelectorAll('#tiempos-tbody tr[data-etapa]');

      // 1. Save all rows to Supabase
      for (const row of rows) {
        const etapa = row.dataset.etapa;
        const fi = row.querySelector('.t-fi').value;
        const hi = row.querySelector('.t-hi').value;
        const ff = row.querySelector('.t-ff').value;
        const hf = row.querySelector('.t-hf').value;
        if (!fi && !hi && !ff && !hf) continue;
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

      // 2. Sync to ClickUp for all main stages with data
      const fieldIds = App._data?.fieldIds || {};
      console.log('[Tiempos] op.id:', op.id);
      console.log('[Tiempos] fieldIds:', JSON.stringify(fieldIds));
      const cuErrors  = [];
      let   cuSynced  = 0;

      for (const row of rows) {
        const etapa = row.dataset.etapa;
        if (!STAGE_INICIO[etapa]) continue; // skip sub-stages
        const fi = row.querySelector('.t-fi').value;
        const hi = row.querySelector('.t-hi').value;
        const ff = row.querySelector('.t-ff').value;
        const hf = row.querySelector('.t-hf').value;
        console.log(`[Tiempos] etapa=${etapa} fi="${fi}" hi="${hi}" ff="${ff}" hf="${hf}"`);

        const inicioKey  = STAGE_INICIO[etapa];
        const finKey     = STAGE_FIN[etapa];
        const inicioFId  = fieldIds[inicioKey];
        const finFId     = fieldIds[finKey];
        console.log(`[Tiempos] ${inicioKey}=${inicioFId}  ${finKey}=${finFId}`);

        if (fi) {
          if (!inicioFId) {
            cuErrors.push(`Sin campo ClickUp para ${inicioKey}`);
          } else {
            const ms = toMs(fi, hi);
            console.log(`[Tiempos] inicio ms=${ms} → ${ms ? new Date(ms).toISOString() : 'null'}`);
            if (ms) {
              try {
                await PlantaAPI.setField(op.id, inicioFId, ms);
                op[inicioKey] = new Date(ms);
                cuSynced++;
                console.log(`[Tiempos] inicio OK cuSynced=${cuSynced}`);
              } catch (e) {
                console.error(`[Tiempos] inicio FAIL:`, e);
                cuErrors.push(`Inicio ${STAGE_LABELS[etapa] || etapa}: ${e.message}`);
              }
            }
          }
        }
        if (ff) {
          if (!finFId) {
            cuErrors.push(`Sin campo ClickUp para ${finKey}`);
          } else {
            const ms = toMs(ff, hf);
            console.log(`[Tiempos] fin ms=${ms} → ${ms ? new Date(ms).toISOString() : 'null'}`);
            if (ms) {
              try {
                await PlantaAPI.setField(op.id, finFId, ms);
                op[finKey] = new Date(ms);
                cuSynced++;
                console.log(`[Tiempos] fin OK cuSynced=${cuSynced}`);
              } catch (e) {
                console.error(`[Tiempos] fin FAIL:`, e);
                cuErrors.push(`Fin ${STAGE_LABELS[etapa] || etapa}: ${e.message}`);
              }
            }
          }
        }
      }

      console.log(`[Tiempos] sync done: cuSynced=${cuSynced} cuErrors=${JSON.stringify(cuErrors)}`);
      if (cuSynced > 0) PlantaAPI.clearCache();
      if (cuErrors.length) {
        console.error('[Tiempos] ClickUp errors:', cuErrors);
        alert('Guardado en base de datos ✓\nClickUp no se pudo actualizar:\n• ' + cuErrors.join('\n• '));
      }

      btn.textContent = '✓ Guardado';
      App._dbData.tiempos = await DB.getAllTiempos().catch(() => App._dbData.tiempos);
      Proyectos.render({ ...App._data, dbData: App._dbData });
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
