// ─────────────────────────────────────────────────────────────
// js/storage.js — localStorage helpers for all app state
// ─────────────────────────────────────────────────────────────

const Storage = {

  // ── Assignments: opId → { person, stage, estimatedDate, note } ──
  getAssignments() {
    try { return JSON.parse(localStorage.getItem('wp_assignments') || '{}'); } catch { return {}; }
  },
  getAssignment(opId) { return this.getAssignments()[opId] || null; },
  setAssignment(opId, data) {
    const all = this.getAssignments();
    all[opId] = { ...data, _updatedAt: Date.now() };
    localStorage.setItem('wp_assignments', JSON.stringify(all));
  },
  removeAssignment(opId) {
    const all = this.getAssignments();
    delete all[opId];
    localStorage.setItem('wp_assignments', JSON.stringify(all));
  },

  // ── Production log: completed OPs ────────────────────────────
  getProductionLog() {
    try { return JSON.parse(localStorage.getItem('wp_production_log') || '[]'); } catch { return []; }
  },
  addToProductionLog(entry) {
    const log = this.getProductionLog();
    log.unshift({ ...entry, _loggedAt: Date.now() });
    localStorage.setItem('wp_production_log', JSON.stringify(log));
  },
  removeFromProductionLog(opId) {
    const log = this.getProductionLog().filter(e => e.id !== opId);
    localStorage.setItem('wp_production_log', JSON.stringify(log));
  },

  // ── Priority order: ordered array of op ids ───────────────────
  getPriority() {
    try { return JSON.parse(localStorage.getItem('wp_priority') || '[]'); } catch { return []; }
  },
  setPriority(arr) { localStorage.setItem('wp_priority', JSON.stringify(arr)); },

  // ── Person roles: name → 'ebanista' | 'pintor' ───────────────
  getRoles() {
    try { return JSON.parse(localStorage.getItem('wp_roles') || '{}'); } catch { return {}; }
  },
  setRole(name, role) {
    const roles = this.getRoles();
    roles[name] = role;
    localStorage.setItem('wp_roles', JSON.stringify(roles));
  },

  // ── Contratistas: opId → { name, fechaPrometida, fechaReal } ──
  getContratistas() {
    try { return JSON.parse(localStorage.getItem('wp_contratistas') || '{}'); } catch { return {}; }
  },
  setContratista(opId, data) {
    const all = this.getContratistas();
    if (data === null) { delete all[opId]; }
    else               { all[opId] = data; }
    localStorage.setItem('wp_contratistas', JSON.stringify(all));
  },
};
