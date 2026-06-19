// ─────────────────────────────────────────────────────────────
// js/app.js — Application bootstrap, routing, auto-refresh
// ─────────────────────────────────────────────────────────────

const App = {
  _data:            null,
  _refreshTimer:    null,
  _REFRESH_INTERVAL: 5 * 60 * 1000,   // 5 min

  async init() {
    this._setupNav();
    this._setupSettings();
    this._setupCompleteModal();

    // Instant render from cache
    const cached = PlantaAPI._getCache();
    if (cached) {
      this._data = cached;
      this._renderAll();
      this._setStatus('⚡ Desde caché', 'ok');
    } else {
      this._setStatus('Conectando...', 'loading');
    }

    // Fresh fetch in background
    await this._sync({ silent: !!cached });

    // Auto-refresh loop
    this._refreshTimer = setInterval(() => this._sync({ silent: true }), this._REFRESH_INTERVAL);
  },

  // ── Sync ─────────────────────────────────────────────────
  async _sync({ force = false, silent = false } = {}) {
    if (!silent) this._setStatus('Sincronizando...', 'loading');
    try {
      this._data = await PlantaAPI.fetchOPs({
        force,
        onProgress: msg => { if (!silent) this._setStatus(msg, 'loading'); },
      });
      this._renderAll();
      this._setStatus(this._syncLabel(), 'ok');
    } catch (e) {
      console.error('[App] Sync error:', e);
      this._setStatus('Error: ' + e.message, 'error');
    }
  },

  _syncLabel() {
    const d = new Date(this._data?.lastSync || Date.now());
    return `↻ ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  },

  _setStatus(msg, type) {
    const s = el('sync-status');
    if (!s) return;
    s.textContent = msg;
    s.className   = `sync-status sync-${type}`;
  },

  // ── Render all tabs ───────────────────────────────────────
  _renderAll() {
    if (!this._data) return;
    Panel.render(this._data);
    Tablero.render(this._data);
    Proyectos.render(this._data);
    Asignacion.render(this._data);
    Rendimiento.render(this._data);
    this._renderRolesList();
  },

  renderPanel() {
    if (this._data) Panel.render(this._data);
  },

  rerender() {
    this._renderAll();
  },

  // ── Navigation ────────────────────────────────────────────
  _setupNav() {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-screen').forEach(s => s.classList.remove('tab-active'));
        el('tab-' + btn.dataset.tab)?.classList.add('tab-active');
      });
    });

    el('btn-refresh')?.addEventListener('click', () => this._sync({ force: true }));
    el('btn-settings')?.addEventListener('click', () => this._openSettings());
  },

  // ── Settings modal ────────────────────────────────────────
  _setupSettings() {
    el('btn-settings-close')?.addEventListener('click', () => this._closeSettings());
    el('settings-overlay')?.addEventListener('click', e => {
      if (e.target === el('settings-overlay')) this._closeSettings();
    });
    el('cfg-sync-btn')?.addEventListener('click', async () => {
      const key = el('cfg-api-key')?.value.trim();
      const lid = el('cfg-list-id')?.value.trim();
      if (key) PlantaAPI.setApiKey(key);
      if (lid) PlantaAPI.setListId(lid);
      PlantaAPI.clearCache();
      const statusEl = el('cfg-sync-status');
      statusEl.textContent = 'Sincronizando...';
      statusEl.className   = 'cfg-sync-status';
      try {
        await this._sync({ force: true });
        statusEl.textContent = '✓ ' + this._syncLabel();
        statusEl.className   = 'cfg-sync-status cfg-sync-ok';
        this._renderRolesList();
      } catch (e) {
        statusEl.textContent = '✗ ' + e.message;
        statusEl.className   = 'cfg-sync-status cfg-sync-error';
      }
    });
  },

  _openSettings() {
    el('cfg-api-key').value = PlantaAPI.getApiKey();
    el('cfg-list-id').value = PlantaAPI.getListId();
    this._renderRolesList();
    el('settings-overlay').style.display = 'flex';
  },

  _closeSettings() { el('settings-overlay').style.display = 'none'; },

  _renderRolesList() {
    const container = el('cfg-roles-list');
    if (!container) return;
    const people = this._data?.ebanistas || [];
    const roles  = Storage.getRoles();

    if (!people.length) {
      container.innerHTML = '<div class="cfg-hint">Sincroniza con ClickUp para ver el personal del dropdown EBANISTA.</div>';
      return;
    }

    container.innerHTML = people.map(name => `
      <div class="role-row">
        <span class="role-name">${esc(name)}</span>
        <div class="role-radios">
          <label class="role-label">
            <input type="radio" name="role-${esc(name.replace(/\s/g,'_'))}" value="ebanista"
              ${(roles[name] || 'ebanista') === 'ebanista' ? 'checked' : ''}>
            Ebanista
          </label>
          <label class="role-label">
            <input type="radio" name="role-${esc(name.replace(/\s/g,'_'))}" value="pintor"
              ${roles[name] === 'pintor' ? 'checked' : ''}>
            Pintor
          </label>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const raw  = radio.name.replace(/^role-/, '').replace(/_/g, ' ');
        const name = people.find(p => p.replace(/\s/g,'_') === radio.name.replace(/^role-/,'')) || raw;
        Storage.setRole(name, radio.value);
        this._renderAll();
      });
    });
  },

  // ── Complete OP modal ─────────────────────────────────────
  _pendingCompleteOp: null,

  _setupCompleteModal() {
    el('btn-complete-close')?.addEventListener('click', () => this._closeCompleteModal());
    el('btn-complete-cancel')?.addEventListener('click', () => this._closeCompleteModal());
    el('complete-overlay')?.addEventListener('click', e => {
      if (e.target === el('complete-overlay')) this._closeCompleteModal();
    });
    el('btn-complete-confirm')?.addEventListener('click', () => this._confirmComplete());
  },

  openCompleteModal(opId, opName, ebanistas) {
    this._pendingCompleteOp = { opId, opName };

    el('complete-op-name').textContent = opName;

    const people = ebanistas || this._data?.ebanistas || [];
    const sel    = el('complete-person');
    sel.innerHTML = '<option value="">— Persona —</option>' +
      people.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

    // Pre-select the assigned person if set
    const a = Storage.getAssignment(opId);
    if (a?.person) sel.value = a.person;

    el('complete-date').value    = todayIso();
    el('complete-reproceso').checked = false;
    el('complete-overlay').style.display = 'flex';
  },

  _closeCompleteModal() {
    el('complete-overlay').style.display = 'none';
    this._pendingCompleteOp = null;
  },

  _confirmComplete() {
    const { opId, opName } = this._pendingCompleteOp || {};
    if (!opId) return;

    const person      = el('complete-person').value;
    const dateVal     = el('complete-date').value;
    const isReproceso = el('complete-reproceso').checked;

    if (!person)  { alert('Selecciona una persona'); return; }
    if (!dateVal) { alert('Ingresa una fecha'); return; }

    const op         = this._data?.ops.find(o => o.id === opId);
    const completedAt = isoToDate(dateVal);
    const firstDate   = op ? firstActivityDate(op) : null;
    const daysInPlant = (firstDate && completedAt) ? daysBetween(firstDate, completedAt) : null;

    Storage.addToProductionLog({
      id:           opId,
      name:         opName,
      project:      op?.project || '',
      client:       op?.client  || '',
      nivel:        op?.nivel   ?? null,
      person,
      stage:        Storage.getAssignment(opId)?.stage || null,
      completedDate: dateVal,
      isReproceso,
      daysInPlant,
    });

    Storage.removeAssignment(opId);
    Storage.setPriority(Storage.getPriority().filter(id => id !== opId));
    this._closeCompleteModal();
    this._renderAll();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
