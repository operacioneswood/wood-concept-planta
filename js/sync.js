// ─────────────────────────────────────────────────────────────
// js/sync.js — Auto-historial: cross ClickUp dates × Supabase assignments
//
// For each OP stage where:
//   - ClickUp has a finXxx date  (stage is complete)
//   - Supabase has an asignacion for that op_id + etapa
// → auto-upsert a historial record (non-destructive, uses ON CONFLICT).
// ─────────────────────────────────────────────────────────────

const Sync = {
  async runAutoHistorial(ops, asignaciones) {
    for (const op of ops) {
      for (const s of STAGES) {
        const finKey    = STAGE_FIN[s.id];
        const inicioKey = STAGE_INICIO[s.id];
        const finDate   = op[finKey];
        if (!finDate) continue;

        const rows = asignaciones.filter(a => a.op_id === op.id && a.etapa === s.id);
        if (!rows.length) continue;

        for (const row of rows) {
          try {
            await DB.upsertHistorial({
              op_id:        op.id,
              etapa:        s.id,
              persona:      row.persona,
              fecha_inicio: op[inicioKey] ? op[inicioKey].toISOString().slice(0, 10) : null,
              fecha_fin:    finDate.toISOString().slice(0, 10),
              es_reproceso: false,
              comentario:   row.comentario || null,
            });
          } catch (e) {
            console.warn('[Sync] historial upsert failed for', op.id, s.id, row.persona, e.message);
          }
        }
      }
    }
  },
};
