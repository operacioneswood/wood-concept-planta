// ─────────────────────────────────────────────────────────────
// js/db.js — Supabase client + all CRUD operations
//
// Replaces localStorage for all operational data.
// Credentials are stored in localStorage only as config
// (URL + anon key), never operational data.
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL     = 'https://uldbmnvstmeukkqdunnz.supabase.co';
const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsZGJtbnZzdG1ldWtrcWR1bm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MDEsImV4cCI6MjA5NzQ1MjYwMX0.SvaLILKDyO-c9Hl4OQktBjQYysvMkK9wRsh-JxiNPmo';

const DB = {
  _sb: null,

  init() {
    this._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  },

  // ── Internal helper ───────────────────────────────────────
  async _q(fn) {
    const { data, error } = await fn(this._sb);
    if (error) { console.error('[DB]', error.message); throw error; }
    return data;
  },

  // ════════════════════════════════════════════════════════
  // PERSONAS
  // ════════════════════════════════════════════════════════
  async getPersonas() {
    return this._q(sb => sb.from('personas').select('*').eq('activo', true).order('nombre'));
  },

  async upsertPersona(nombre, tipo) {
    return this._q(sb => sb.from('personas').upsert(
      { nombre, tipo, activo: true },
      { onConflict: 'nombre' }
    ));
  },

  async setPersonaActivo(nombre, activo) {
    return this._q(sb => sb.from('personas').update({ activo }).eq('nombre', nombre));
  },

  // ════════════════════════════════════════════════════════
  // ASIGNACIONES  (op_id + etapa + persona = unique)
  // ════════════════════════════════════════════════════════
  async getAsignaciones() {
    return this._q(sb => sb.from('asignaciones').select('*'));
  },

  async setAsignacion(op_id, etapa, persona, fecha_asignacion = null, comentario = null) {
    // Upsert by (op_id, etapa, persona) — allows multiple people per OP
    return this._q(sb => sb.from('asignaciones').upsert(
      { op_id, etapa, persona,
        fecha_asignacion: fecha_asignacion || new Date().toISOString().slice(0, 10),
        comentario: comentario ?? null,
      },
      { onConflict: 'op_id,etapa,persona' }
    ));
  },

  async removeAsignacion(op_id, persona = null) {
    let q = this._sb.from('asignaciones').delete().eq('op_id', op_id);
    if (persona) q = q.eq('persona', persona);
    const { error } = await q;
    if (error) throw error;
  },

  // ════════════════════════════════════════════════════════
  // HISTORIAL  (auto-generated from ClickUp×Supabase cross)
  // ════════════════════════════════════════════════════════
  async getHistorial() {
    return this._q(sb => sb.from('historial').select('*').order('fecha_fin', { ascending: false }));
  },

  async upsertHistorial({ op_id, etapa, persona, fecha_inicio, fecha_fin, es_reproceso, comentario }) {
    return this._q(sb => sb.from('historial').upsert(
      { op_id, etapa, persona, fecha_inicio, fecha_fin, es_reproceso: !!es_reproceso, comentario: comentario ?? null },
      { onConflict: 'op_id,etapa,persona' }
    ));
  },

  async deleteHistorial(op_id, etapa, persona) {
    const { error } = await this._sb.from('historial').delete()
      .eq('op_id', op_id).eq('etapa', etapa).eq('persona', persona);
    if (error) throw error;
  },

  // ════════════════════════════════════════════════════════
  // PRODUCCION  (log of completed OPs)
  // ════════════════════════════════════════════════════════
  async getProduccion() {
    return this._q(sb => sb.from('produccion').select('*').order('fecha_salida', { ascending: false }));
  },

  async addProduccion({ op_id, nombre_op, proyecto, persona, fecha_salida, es_reproceso, dias_en_planta }) {
    return this._q(sb => sb.from('produccion').insert(
      { op_id, nombre_op, proyecto, persona, fecha_salida, es_reproceso: !!es_reproceso, dias_en_planta: dias_en_planta ?? null }
    ));
  },

  // ════════════════════════════════════════════════════════
  // PRIORIDADES  (ordered list of project ids)
  // ════════════════════════════════════════════════════════
  async getPrioridades() {
    return this._q(sb => sb.from('prioridades').select('*').order('orden'));
  },

  async setPrioridades(orderedProjects) {
    // orderedProjects = [{ proyecto_id, proyecto_nombre }, ...]
    const rows = orderedProjects.map((p, i) => ({
      proyecto_id:     p.proyecto_id,
      proyecto_nombre: p.proyecto_nombre,
      orden:           i,
    }));
    // Delete all then re-insert to maintain order cleanly
    await this._q(sb => sb.from('prioridades').delete().neq('orden', -999));
    if (rows.length) {
      await this._q(sb => sb.from('prioridades').insert(rows));
    }
  },

  // ════════════════════════════════════════════════════════
  // TIEMPOS_OP  (manual time registration per stage)
  // ════════════════════════════════════════════════════════
  async getTiempos(opId) {
    return this._q(sb => sb.from('tiempos_op').select('*').eq('op_id', opId));
  },

  async getAllTiempos() {
    return this._q(sb => sb.from('tiempos_op').select('*'));
  },

  async upsertTiempo({ op_id, nombre_op, etapa, fecha_inicio, hora_inicio, fecha_fin, hora_fin }) {
    return this._q(sb => sb.from('tiempos_op').upsert(
      { op_id, nombre_op, etapa, fecha_inicio, hora_inicio, fecha_fin, hora_fin,
        updated_at: new Date().toISOString() },
      { onConflict: 'op_id,etapa' }
    ));
  },

  // ════════════════════════════════════════════════════════
  // SETUP — create tables if they don't exist (run once)
  // ════════════════════════════════════════════════════════
  async setupTables() {
    const sql = `
      create table if not exists personas (
        id               uuid primary key default gen_random_uuid(),
        nombre           text not null unique,
        tipo             text not null check (tipo in ('ebanista','pintor','ambos')),
        activo           boolean default true,
        created_at       timestamptz default now()
      );

      create table if not exists asignaciones (
        id               uuid primary key default gen_random_uuid(),
        op_id            text not null,
        etapa            text not null,
        persona          text not null,
        fecha_asignacion date not null default current_date,
        created_at       timestamptz default now(),
        unique(op_id, etapa)
      );

      create table if not exists historial (
        id               uuid primary key default gen_random_uuid(),
        op_id            text not null,
        etapa            text not null,
        persona          text not null,
        fecha_inicio     date,
        fecha_fin        date,
        es_reproceso     boolean default false,
        created_at       timestamptz default now(),
        unique(op_id, etapa)
      );

      create table if not exists produccion (
        id               uuid primary key default gen_random_uuid(),
        op_id            text not null,
        nombre_op        text not null,
        proyecto         text,
        persona          text not null,
        fecha_salida     date not null,
        es_reproceso     boolean default false,
        dias_en_planta   integer,
        created_at       timestamptz default now()
      );

      create table if not exists prioridades (
        id               uuid primary key default gen_random_uuid(),
        proyecto_id      text not null unique,
        proyecto_nombre  text,
        orden            integer not null
      );
    `;
    const { error } = await this._sb.rpc('exec_sql', { sql }).single().catch(() => ({ error: null }));
    // exec_sql may not exist — caller should run SQL manually in Supabase dashboard
    return !error;
  },
};
