// ─────────────────────────────────────────────────────────────
// js/config.js — Plant configuration and shared utilities
// ─────────────────────────────────────────────────────────────

// ── Production stages in order ────────────────────────────────
const STAGES = [
  { id: 'corte',         label: 'Corte',         color: '#3B6D11' },
  { id: 'chapilla',      label: 'Chapilla',       color: '#185FA5' },
  { id: 'enchapillado',  label: 'Enchapillado',   color: '#533AB7' },
  { id: 'armado',        label: 'Armado',         color: '#8B3A1C' },
  { id: 'pintura',       label: 'Pintura',        color: '#9B5C0A' },
];

const STAGE_IDS    = STAGES.map(s => s.id);
const STAGE_LABELS = Object.fromEntries(STAGES.map(s => [s.id, s.label]));
const STAGE_COLORS = Object.fromEntries(STAGES.map(s => [s.id, s.color]));

// Field key names derived from stage ids
const STAGE_INICIO = { corte: 'inicioCorte', chapilla: 'inicioChapilla', enchapillado: 'inicioEnchapillado', armado: 'inicioArmado', pintura: 'inicioPintura' };
const STAGE_FIN    = { corte: 'finCorte',    chapilla: 'finChapilla',    enchapillado: 'finEnchapillado',    armado: 'finArmado',    pintura: 'finPintura'    };

// ── ClickUp statuses that count as "in plant" ─────────────────
const ACTIVE_STATUSES = new Set(['fabrica', 'en ebanisteria', 'en pintura', 'pendiente de revision']);

const STATUS_DISPLAY = {
  'fabrica':               { label: 'Fábrica',              cls: 'sb-green'  },
  'en ebanisteria':        { label: 'En Ebanistería',       cls: 'sb-amber'  },
  'en pintura':            { label: 'En Pintura',           cls: 'sb-purple' },
  'pendiente de revision': { label: 'Pend. Revisión',       cls: 'sb-gray'   },
};

// ── Performance targets per role ─────────────────────────────
const TARGETS = {
  ebanista:   { weekly: 5,  monthly: 20 },
  pintor:     { weekly: 3,  monthly: 12 },
  contratista:{ weekly: 3,  monthly: 12 },
};

// ── Contratistas conocidos (auto-clasificados en primer sync) ─
const CONTRATISTAS_CONOCIDOS = new Set([
  'jose','simon','david','alex','valentin','lizardo','dimas',
]);

// ── Default ClickUp connection ────────────────────────────────
// Key stored in localStorage takes priority over this default.
// Note: this file is in GitHub — keep repo private if this key is sensitive.
const DEFAULT_API_KEY = 'pk_88470791_HQLTVBC5M58X1SD3H6BHDSYQFLIX931H';
const DEFAULT_LIST_ID = '90090072307';

// ── Shared utilities ──────────────────────────────────────────

const normStr = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const esc     = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const el      = id => document.getElementById(id);

function tsToDate(ms) {
  if (ms === null || ms === undefined || ms === '') return null;
  const n = Number(ms);
  return isNaN(n) || n === 0 ? null : new Date(n);
}

function fmtDate(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function fmtDateFull(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function isoToDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? null : d;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function daysSince(d) {
  if (!d) return null;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Derive current stage from OP date fields
function getCurrentStage(op) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    const s = STAGES[i].id;
    if (op[STAGE_INICIO[s]] && !op[STAGE_FIN[s]]) return s;
  }
  // No open stage — find the last completed one to suggest next
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (op[STAGE_FIN[STAGES[i].id]]) {
      return i < STAGES.length - 1 ? STAGES[i + 1].id : null;
    }
  }
  return null;
}

// Count how many stages are fully done
function countCompletedStages(op) {
  return STAGES.filter(s => !!op[STAGE_FIN[s.id]]).length;
}

// First date any work started on this OP
function firstActivityDate(op) {
  for (const s of STAGES) {
    if (op[STAGE_INICIO[s.id]]) return op[STAGE_INICIO[s.id]];
  }
  return null;
}

// Sub-processes per stage (optional granularity)
const STAGE_SUBPROCESOS = {
  enchapillado: [
    { id: 'sabanas',  label: 'Sábanas'  },
    { id: 'canteo',   label: 'Canteo'   },
    { id: 'enchapar', label: 'Enchapar' },
  ],
  corte: [
    { id: 'ensamble', label: 'Ensamble' },
  ],
};

function subproLabel(id) {
  for (const subs of Object.values(STAGE_SUBPROCESOS)) {
    const found = subs.find(s => s.id === id);
    if (found) return found.label;
  }
  return id;
}
