// ─────────────────────────────────────────────────────────────
// js/config.js — Plant configuration and shared utilities
// ─────────────────────────────────────────────────────────────

// ── Production stages in order ────────────────────────────────
const STAGES = [
  { id: 'corte',        label: 'Corte',        color: '#3B6D11' },
  { id: 'enchape',      label: 'Enchape',      color: '#533AB7' },
  { id: 'ebanisteria',  label: 'Ebanistería',  color: '#8B3A1C' },
  { id: 'pintura',      label: 'Pintura',      color: '#9B5C0A' },
];

const STAGE_IDS    = STAGES.map(s => s.id);
const STAGE_LABELS = Object.fromEntries(STAGES.map(s => [s.id, s.label]));
const STAGE_COLORS = Object.fromEntries(STAGES.map(s => [s.id, s.color]));

// Field key names → ClickUp custom field property names (must match ClickUp field labels after camelCase normalization)
const STAGE_INICIO = { corte: 'inicioCorte', enchape: 'inicioEnchape', ebanisteria: 'inicioArmado', pintura: 'inicioPintura' };
const STAGE_FIN    = { corte: 'finCorte',    enchape: 'finEnchape',    ebanisteria: 'finArmado',    pintura: 'finPintura'    };

// ── ClickUp statuses that count as "in plant" ─────────────────
const ACTIVE_STATUSES = new Set(['fabrica', 'corte', 'enchape', 'ebanisteria', 'en ebanisteria', 'en pintura', 'pendiente de revision', 'reproceso', 'pendiente por obra', 'pendiente chapilla']);

// Statuses that haven't entered any concrete production stage yet — only
// these are eligible for the priority-based fecha límite push. An OP
// already in corte/enchape/ebanistería/pintura is in progress and its
// date should not move.
const PRIORITY_SHIFTABLE_STATUSES = new Set(['fabrica', 'pendiente por obra', 'pendiente chapilla']);

// ── ClickUp statuses tracked by the Bitácora de Instalación ────
// Separate from ACTIVE_STATUSES so every existing fábrica view keeps
// seeing exactly what it saw before — these OPs have already left fábrica.
const INSTALL_STATUSES = new Set(['empaque', 'en instalacion']);

const INSTALL_STATUS_DISPLAY = {
  'empaque':        { label: 'Empaque',        cls: 'sb-obra'   },
  'en instalacion': { label: 'En Instalación', cls: 'sb-purple' },
};

// The 5-option "ESTATUS INSTALACIÓN" ClickUp dropdown, in workflow order —
// colors match the ones already configured on that field in ClickUp.
const ESTATUS_INSTALACION_STAGES = [
  { id: 'SIN COMENZAR',   color: '#b5bcc2' },
  { id: 'EN PROCESO',     color: '#81B1FF' },
  { id: 'EN REPARACIÓN',  color: '#e79163' },
  { id: 'RETOQUES',       color: '#b14242' },
  { id: 'COMPLETADO',     color: '#2ecd6f' },
];
const ESTATUS_INSTALACION_COLORS = Object.fromEntries(ESTATUS_INSTALACION_STAGES.map(s => [s.id, s.color]));

// ── Formulario de Reprocesos (Google Forms) ─────────────────────
// Lets the bitácora open the company's real reproceso form pre-filled
// instead of the coordinator re-typing everything from scratch. Entry IDs
// were read directly from the live form (docs.google.com/forms/d/e/
// 1FAIpQLSeBB2x_LCWqHBhl1GNYbBx5Px1FOeaRw8HMU6EaMXF_zER7sw).
const REPROCESO_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSeBB2x_LCWqHBhl1GNYbBx5Px1FOeaRw8HMU6EaMXF_zER7sw/viewform';
const REPROCESO_FORM_ENTRIES = {
  fechaYear:  '1847747903_year',
  fechaMonth: '1847747903_month',
  fechaDay:   '1847747903_day',
  encargado:  '1264151880',
  cliente:    '1674418086',
  op:         '1601530923',
  cantidad:   '1271350687',
  acabado:    '2128723638',
  pieza:      '1110334385',
  origen:     '1602377585',   // Diseño | Fabrica | Instalacion | Cliente
  disenador:  '1286190452',
  motivo:     '1149267137',
};

function buildReprocesoFormUrl({ cliente, op, motivo } = {}) {
  const now = new Date();
  const params = new URLSearchParams({ usp: 'pp_url' });
  params.set(`entry.${REPROCESO_FORM_ENTRIES.fechaYear}`,  String(now.getFullYear()));
  params.set(`entry.${REPROCESO_FORM_ENTRIES.fechaMonth}`, String(now.getMonth() + 1));
  params.set(`entry.${REPROCESO_FORM_ENTRIES.fechaDay}`,   String(now.getDate()));
  params.set(`entry.${REPROCESO_FORM_ENTRIES.origen}`, 'Instalacion');
  if (cliente) params.set(`entry.${REPROCESO_FORM_ENTRIES.cliente}`, cliente);
  if (op)      params.set(`entry.${REPROCESO_FORM_ENTRIES.op}`,      op);
  if (motivo)  params.set(`entry.${REPROCESO_FORM_ENTRIES.motivo}`,  motivo);
  return `${REPROCESO_FORM_BASE}?${params.toString()}`;
}

const STATUS_DISPLAY = {
  'fabrica':               { label: 'Fábrica',              cls: 'sb-green'  },
  'en ebanisteria':        { label: 'En Ebanistería',       cls: 'sb-amber'  },
  'en pintura':            { label: 'En Pintura',           cls: 'sb-purple' },
  'pendiente de revision': { label: 'Pend. Revisión',       cls: 'sb-gray'   },
  'reproceso':             { label: 'Reproceso',            cls: 'sb-repro'  },
  'pendiente por obra':    { label: 'Pend. por Obra',       cls: 'sb-obra'   },
  'pendiente chapilla':    { label: 'Pend. Chapilla',       cls: 'sb-chapilla' },
};

// ── Priority-based fecha límite push ────────────────────────────
// When brand-new OPs show up in a ranked project (Tablero priority list),
// a pending proposal is created to push out the fecha límite of every
// "Fábrica" OP belonging to a project ranked *after* it — by (# of new
// OPs) × the real median days-per-OP duration in ebanistería, computed
// live from historial. Requires manual approval from the global banner
// before anything is written to ClickUp. This constant is only the
// fallback used before there's enough history to compute that duration.
const PRIORITY_PUSH_DAYS = 5;

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

// ── Personas excluidas de la web app (siguen en ClickUp) ─────
const EXCLUDED_PERSONAS = new Set([
  'luis polo','manuel/camano','alvaro','andersson','carlos','edward',
  'jose escobar jr.','nolberto','equipo de corte y canteo',
]);
const isExcluded = name => EXCLUDED_PERSONAS.has(normStr(name));

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

// ClickUp workflow statuses that map directly to a production stage.
const STATUS_TO_STAGE = {
  corte:            'corte',
  enchape:          'enchape',
  ebanisteria:      'ebanisteria',
  'en ebanisteria': 'ebanisteria',
  pintura:          'pintura',
  'en pintura':     'pintura',
};

function _dateStage(op) {
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

// Derive current stage from two signals — ClickUp's workflow status and the
// internal Inicio/Fin date fields — and trust whichever shows more progress.
// Either one can lag behind the other (ClickUp status changed manually without
// touching the app, or the app advanced a stage before ClickUp's status caught up),
// so neither source alone is reliable; the furthest-along stage wins.
function getCurrentStage(op) {
  const statusStage = STATUS_TO_STAGE[normStr(op.status || '')] || null;
  const dateStage    = _dateStage(op);

  if (!statusStage) return dateStage;
  if (!dateStage) return statusStage;

  const statusIdx = STAGE_IDS.indexOf(statusStage);
  const dateIdx   = STAGE_IDS.indexOf(dateStage);
  return statusIdx >= dateIdx ? statusStage : dateStage;
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

// Old stage IDs → new stage IDs (for data saved before renames)
const STAGE_ALIASES = { armado: 'ebanisteria', enchapillado: 'enchape' };

// Sub-processes per stage shown in assignment UI
const STAGE_SUBPROCESOS = {
  enchape: [
    { id: 'sabanas',  label: 'Sábanas'  },
    { id: 'canteo',   label: 'Canteo'   },
    { id: 'enchapar', label: 'Enchapar' },
  ],
  corte: [
    { id: 'ensamble', label: 'Ensamble' },
  ],
};

// Tiempos modal stages — 3 main rows with optional sub-process time rows
const TIEMPO_STAGES = [
  {
    id: 'corte', label: 'Corte', color: '#3B6D11',
    subs: [{ id: 'ensamble', label: 'Ensamble' }],
  },
  {
    id: 'enchape', label: 'Enchape', color: '#533AB7',
    subs: [
      { id: 'sabanas',  label: 'Sábanas'  },
      { id: 'canteo',   label: 'Canteo'   },
      { id: 'enchapar', label: 'Enchapar' },
    ],
  },
  {
    id: 'ebanisteria', label: 'Ebanistería', color: '#8B3A1C',
    subs: [],
  },
];

function subproLabel(id) {
  for (const subs of Object.values(STAGE_SUBPROCESOS)) {
    const found = subs.find(s => s.id === id);
    if (found) return found.label;
  }
  return id;
}

// Predefined part names for the hybrid dropdown
const PARTES_PREDEFINIDAS = [
  'Puerta(s)', 'Panel', 'Panelado', 'Mueble', 'Gaveta(s)',
  'Revestimiento', 'Estructura', 'Cubierta', 'Marco', 'Tapa', 'Cajonería',
];
