// Reine Rechenlogik der Käseabend-App – ohne Oberfläche, ohne Datenbank.
// Alles hier ist mit `node --test tests/` prüfbar.

export const CATEGORIES = [
  { key: 'geruch', label: 'Geruch' },
  { key: 'textur', label: 'Textur' },
  { key: 'geschmack', label: 'Geschmack' },
  { key: 'abgang', label: 'Abgang' },
];

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

const EPS = 1e-9;

/** Gültige Einzelpunktzahl: ganze Zahl von 1 bis 10. */
export function isValidScore(value) {
  return Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/** Durchschnitt einer Bewertung über alle Kategorien – oder null, wenn etwas fehlt. */
export function raterAverage(rating) {
  if (!rating) return null;
  let sum = 0;
  for (const c of CATEGORIES) {
    const v = rating[c.key];
    if (!isValidScore(v)) return null;
    sum += v;
  }
  return sum / CATEGORIES.length;
}

/** Nur vollständige Bewertungen zu einem Käse. */
export function completeRatingsFor(cheeseId, ratings) {
  return ratings.filter((r) => r.cheese_id === cheeseId && raterAverage(r) !== null);
}

/**
 * Gesamtnote eines Käses = Mittelwert der Durchschnittsnoten aller Bewerter.
 * Jede Person zählt gleich viel.
 */
export function cheeseScore(cheeseId, ratings) {
  const list = completeRatingsFor(cheeseId, ratings);
  if (list.length === 0) return { score: null, count: 0 };
  const total = list.reduce((s, r) => s + raterAverage(r), 0);
  return { score: total / list.length, count: list.length };
}

/** Gruppenschnitt je Kategorie für einen Käse (für die Detailansicht). */
export function categoryAverages(cheeseId, ratings) {
  const list = completeRatingsFor(cheeseId, ratings);
  const out = {};
  for (const c of CATEGORIES) {
    out[c.key] = list.length ? list.reduce((s, r) => s + r[c.key], 0) / list.length : null;
  }
  return out;
}

/** Platzierung nach Wettkampf-Art: gleiche Note = gleicher Platz (1, 1, 3). */
function assignRanks(sorted) {
  let lastScore = null;
  let lastRank = 0;
  return sorted.map((item, i) => {
    let rank;
    if (lastScore !== null && Math.abs(item.score - lastScore) < EPS) {
      rank = lastRank;
    } else {
      rank = i + 1;
    }
    lastScore = item.score;
    lastRank = rank;
    return { ...item, rank };
  });
}

function byName(a, b) {
  return a.cheese.name.localeCompare(b.cheese.name, 'de', { sensitivity: 'base' });
}

/**
 * Gruppen-Rangliste. Bewertete Käse nach Gesamtnote absteigend,
 * bei Gleichstand mehr Bewertungen zuerst, dann alphabetisch.
 * Unbewertete Käse stehen in `unrated` (alphabetisch).
 */
export function groupRanking(cheeses, ratings) {
  const rated = [];
  const unrated = [];
  for (const cheese of cheeses) {
    const { score, count } = cheeseScore(cheese.id, ratings);
    if (score === null) unrated.push({ cheese, score: null, count: 0, rank: null });
    else rated.push({ cheese, score, count });
  }
  rated.sort((a, b) => {
    if (Math.abs(b.score - a.score) >= EPS) return b.score - a.score;
    if (b.count !== a.count) return b.count - a.count;
    return byName(a, b);
  });
  unrated.sort(byName);
  return { ranked: assignRanks(rated), unrated };
}

/**
 * Persönliche Rangliste: nur Käse, die diese Person vollständig bewertet hat,
 * sortiert nach ihrer eigenen Durchschnittsnote. `open` = noch nicht bewertet.
 */
export function playerRanking(playerId, cheeses, ratings) {
  const rated = [];
  const open = [];
  for (const cheese of cheeses) {
    const r = ratings.find((x) => x.cheese_id === cheese.id && x.player_id === playerId);
    const avg = raterAverage(r);
    if (avg === null) open.push({ cheese, score: null, rank: null });
    else rated.push({ cheese, score: avg, rating: r });
  }
  rated.sort((a, b) => (Math.abs(b.score - a.score) >= EPS ? b.score - a.score : byName(a, b)));
  open.sort(byName);
  return { ranked: assignRanks(rated), open };
}

/** Deutsche Darstellung mit einer Nachkommastelle: 7.75 → "7,8". */
export function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  const rounded = Math.round(value * 10 + EPS) / 10;
  return rounded.toFixed(1).replace('.', ',');
}

/** Prüft einen Namen (Person oder Käse). Gibt Fehlermeldung oder null zurück. */
export function validateName(name, existingNames = [], { maxLength = 40, what = 'Name' } = {}) {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return `Bitte einen ${what} eingeben.`;
  if (trimmed.length > maxLength) return `Der ${what} ist zu lang (max. ${maxLength} Zeichen).`;
  const lower = trimmed.toLocaleLowerCase('de');
  if (existingNames.some((n) => (n ?? '').trim().toLocaleLowerCase('de') === lower)) {
    return `„${trimmed}“ gibt es schon.`;
  }
  return null;
}

/** Bereinigt einen Namen für das Speichern. */
export function cleanName(name) {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

/** Baut aus Formularwerten (Strings aus Dropdowns) ein Bewertungsobjekt oder null. */
export function scoresFromForm(values) {
  const out = {};
  for (const c of CATEGORIES) {
    const v = Number.parseInt(values[c.key], 10);
    if (!isValidScore(v)) return null;
    out[c.key] = v;
  }
  return out;
}

/** Wie viele Personen haben einen Käse (vollständig) bewertet, wer fehlt noch? */
export function ratingProgress(cheeseId, players, ratings) {
  const done = new Set(completeRatingsFor(cheeseId, ratings).map((r) => r.player_id));
  return {
    done: players.filter((p) => done.has(p.id)),
    missing: players.filter((p) => !done.has(p.id)),
  };
}

/** Deutscher Genitiv für Namen: „Oles“, aber „Hannes’“. */
export function genitive(name) {
  const n = (name ?? '').trim();
  return /[sßxz]$/i.test(n) ? `${n}’` : `${n}s`;
}
