/**
 * Käseabend – reine Rechenlogik (ohne Oberfläche, ohne Datenbank).
 * Prüfbar mit:  node --test tests/
 */

export const CRITERIA = [
  { key: 'optics',  short: 'Optik',     label: '1. Optik & Haptik',       hint: 'Rindenbeschaffenheit, Teigfarbe, Reifegradanzeichen' },
  { key: 'aroma',   short: 'Duft',      label: '2. Duft & Aroma',         hint: 'Intensität, Milchnote, Nuss, Pilz, Kellerduft' },
  { key: 'texture', short: 'Textur',    label: '3. Textur & Mundgefühl',  hint: 'Schmelz, Cremigkeit, Festigkeit, Salzkristalle' },
  { key: 'taste',   short: 'Geschmack', label: '4. Geschmack & Harmonie', hint: 'Salz, Würze, Süße, Säure, Vielschichtigkeit' },
  { key: 'finish',  short: 'Abgang',    label: '5. Abgang & Nachhall',    hint: 'Wie lange bleibt der Geschmack harmonisch präsent?' },
];

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;
export const DEFAULT_SCORE = 7.5;
export const MAX_NOTE_LENGTH = 500;

export const FLAVOR_TAGS = [
  'Buttrig', 'Nussig', 'Salzkristalle', 'Würzig', 'Pikant', 'Pilzig/Wald',
  'Fruchtig', 'Heu/Kräuter', 'Animalisch', 'Schmelzend', 'Mürbe', 'Cremig', 'Milchfrisch',
];

export const AVATARS = ['🍷', '🥖', '🧀', '🍇', '🍐', '🥨', '🍻', '🍴'];

const EPS = 1e-9;

// ── Einzelnoten ────────────────────────────────────────────────

/** Rundet auf 0,5-Schritte und begrenzt auf 1–10. */
export function snapScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SCORE;
  const snapped = Math.round(n * 2) / 2;
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, snapped));
}

/** Gültige Note: Zahl von 1 bis 10 in 0,5-Schritten. */
export function isValidScore(value) {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= MIN_SCORE - EPS && value <= MAX_SCORE + EPS
    && Math.abs(value * 2 - Math.round(value * 2)) < EPS;
}

/** Gesamtnote einer Person für einen Käse = Mittel der 5 Kriterien, sonst null. */
export function ratingScore(rating) {
  if (!rating) return null;
  let sum = 0;
  for (const c of CRITERIA) {
    if (!isValidScore(rating[c.key])) return null;
    sum += rating[c.key];
  }
  return sum / CRITERIA.length;
}

export function findRating(ratings, cheeseId, testerId) {
  return ratings.find((r) => r.cheese_id === cheeseId && r.tester_id === testerId) || null;
}

/** Baut aus Formularwerten eine saubere Bewertung. */
export function ratingFromInputs(values, tags = [], note = '') {
  const out = {};
  for (const c of CRITERIA) out[c.key] = snapScore(values[c.key]);
  out.tags = [...new Set(tags)].filter((t) => FLAVOR_TAGS.includes(t));
  out.note = String(note ?? '').trim().slice(0, MAX_NOTE_LENGTH);
  return out;
}

// ── Auswertung pro Käse ────────────────────────────────────────

/**
 * Zusammenfassung eines Käses über alle (noch vorhandenen) Tester.
 * total = Mittel der persönlichen Gesamtnoten; jede Person zählt gleich.
 * stdDev = Streuung dieser Gesamtnoten (für „Spaltpilz“ / „Konsens“).
 */
export function cheeseSummary(cheeseId, testers, ratings) {
  const ids = new Set(testers.map((t) => t.id));
  const list = ratings.filter((r) => r.cheese_id === cheeseId && ids.has(r.tester_id) && ratingScore(r) !== null);
  const avg = {};
  if (list.length === 0) {
    for (const c of CRITERIA) avg[c.key] = null;
    return { count: 0, avg, total: null, stdDev: null };
  }
  for (const c of CRITERIA) avg[c.key] = list.reduce((s, r) => s + r[c.key], 0) / list.length;
  const scores = list.map(ratingScore);
  const total = scores.reduce((s, v) => s + v, 0) / scores.length;
  const stdDev = Math.sqrt(scores.reduce((s, v) => s + (v - total) ** 2, 0) / scores.length);
  return { count: list.length, avg, total, stdDev };
}

function byName(a, b) {
  return a.cheese.name.localeCompare(b.cheese.name, 'de', { sensitivity: 'base' });
}

/**
 * Rangliste: bewertete Käse nach Gesamtnote absteigend (bei Gleichstand mehr
 * Stimmen zuerst, dann alphabetisch). Gleiche Note = gleicher Platz (1, 1, 3).
 * Unbewertete Käse hängen hinten an (rank: null).
 */
export function leaderboard(cheeses, testers, ratings) {
  const items = cheeses.map((cheese) => ({ cheese, summary: cheeseSummary(cheese.id, testers, ratings) }));
  const rated = items.filter((i) => i.summary.count > 0);
  const unrated = items.filter((i) => i.summary.count === 0).sort(byName);

  rated.sort((a, b) => {
    const d = b.summary.total - a.summary.total;
    if (Math.abs(d) > EPS) return d;
    if (b.summary.count !== a.summary.count) return b.summary.count - a.summary.count;
    return byName(a, b);
  });

  let lastTotal = null;
  let lastRank = 0;
  rated.forEach((item, i) => {
    const same = lastTotal !== null && Math.abs(item.summary.total - lastTotal) < EPS;
    item.rank = same ? lastRank : i + 1;
    lastTotal = item.summary.total;
    lastRank = item.rank;
  });
  unrated.forEach((item) => { item.rank = null; });
  return [...rated, ...unrated];
}

/** Sonderpreise. Gibt null zurück, wenn noch nichts bewertet ist. */
export function awards(board) {
  const rated = board.filter((i) => i.summary.count > 0);
  if (rated.length === 0) return null;
  const pick = (list, value, wantMax = true) => list.reduce((best, item) => {
    const v = value(item);
    const b = value(best);
    return (wantMax ? v > b + EPS : v < b - EPS) ? item : best;
  });
  const multi = rated.filter((i) => i.summary.count >= 2);
  return {
    aroma: pick(rated, (i) => i.summary.avg.aroma),
    texture: pick(rated, (i) => i.summary.avg.texture),
    contested: multi.length ? pick(multi, (i) => i.summary.stdDev, true) : null,
    consensus: multi.length ? pick(multi, (i) => i.summary.stdDev, false) : null,
  };
}

/** Daten für das Radar: Sieger gegen Durchschnitt aller bewerteten Käse. */
export function radarData(board) {
  const rated = board.filter((i) => i.summary.count > 0);
  const labels = CRITERIA.map((c) => c.short);
  if (rated.length === 0) return { labels, top: null, topName: null, overall: null };
  const top = rated[0];
  const overall = CRITERIA.map((c) => rated.reduce((s, i) => s + i.summary.avg[c.key], 0) / rated.length);
  return {
    labels,
    top: CRITERIA.map((c) => top.summary.avg[c.key]),
    topName: top.cheese.name,
    overall,
  };
}

// ── Darstellung & Hilfen ───────────────────────────────────────

/** 8.25 → "8.3", null → "--" */
export function formatScore(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return (Math.round(value * 10 + EPS) / 10).toFixed(1);
}

export function formatSpread(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `±${(Math.round(value * 100 + EPS) / 100).toFixed(2)}`;
}

export function cleanText(value, maxLength = 80) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

/** Prüft einen Namen. Gibt eine Fehlermeldung oder null zurück. */
export function validateName(name, existingNames = [], { maxLength = 40 } = {}) {
  const trimmed = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Bitte einen Namen eingeben.';
  if (trimmed.length > maxLength) return `Der Name ist zu lang (max. ${maxLength} Zeichen).`;
  const lower = trimmed.toLocaleLowerCase('de');
  if (existingNames.some((n) => String(n ?? '').trim().toLocaleLowerCase('de') === lower)) {
    return `„${trimmed}“ gibt es schon.`;
  }
  return null;
}

export function nextTesterId(testers, currentId) {
  if (testers.length === 0) return null;
  const idx = testers.findIndex((t) => t.id === currentId);
  return testers[(idx + 1) % testers.length].id;
}

export function randomAvatar(rand = Math.random) {
  return AVATARS[Math.floor(rand() * AVATARS.length) % AVATARS.length];
}

/** Text für WhatsApp. */
export function buildShareText(board, testers) {
  const medals = ['🥇', '🥈', '🥉'];
  const rated = board.filter((i) => i.summary.count > 0);
  const open = board.filter((i) => i.summary.count === 0);
  let text = '🧀 *KÄSEABEND - ERGEBNISSE & SIEGER* 🧀\n';
  text += `Tester: ${testers.map((t) => t.name).join(', ')}\n\n`;
  if (rated.length === 0) text += 'Noch keine Bewertungen.\n';
  rated.forEach((item) => {
    const medal = item.rank <= 3 ? medals[item.rank - 1] : '•';
    const votes = item.summary.count === 1 ? '1 Stimme' : `${item.summary.count} Stimmen`;
    text += `${medal} *${item.cheese.name}*: ${formatScore(item.summary.total)} / 10 (${votes})\n`;
  });
  if (open.length) text += `\nNoch ohne Bewertung: ${open.map((i) => i.cheese.name).join(', ')}\n`;
  text += '\nBewertet mit 5 Kriterien (Optik, Duft, Textur, Geschmack, Abgang)';
  return text;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
