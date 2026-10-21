// Oberfläche der Käseabend-App. Rechnet nichts selbst – das macht logic.js.

import {
  CATEGORIES, MIN_SCORE, MAX_SCORE, raterAverage, cheeseScore, categoryAverages,
  groupRanking, playerRanking, formatScore, validateName, cleanName,
  scoresFromForm, ratingProgress, genitive,
} from './logic.js';
import { createStore } from './store.js';

const ME_KEY = 'kaeseabend-ich';
const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastEl = document.getElementById('toast');

const state = {
  store: null,
  data: { players: [], cheeses: [], ratings: [] },
  meId: safeGet(ME_KEY),
  view: 'gruppe',            // 'gruppe' | 'personen'
  personId: null,            // ausgewählte Person in „Personen“
  sheet: null,               // { type: 'cheese' | 'add' | 'who' | 'addPerson', id? }
  error: null,
  lastScores: new Map(),
};

// ── Hilfen ─────────────────────────────────────────────────────

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => esc((name || '?').trim().slice(0, 1).toUpperCase());
const me = () => state.data.players.find((p) => p.id === state.meId) || null;
const playerName = (id) => state.data.players.find((p) => p.id === id)?.name ?? 'Unbekannt';
const cheeseById = (id) => state.data.cheeses.find((c) => c.id === id);

let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function bewertungen(n) { return n === 1 ? '1 Bewertung' : `${n} Bewertungen`; }

// ── Daten laden ────────────────────────────────────────────────

let reloadTimer;
async function reload() {
  try {
    state.data = await state.store.loadAll();
    state.error = null;
  } catch (e) {
    state.error = e.message;
  }
  if (state.meId && !me() && !state.error) state.meId = null;
  render();
}
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reload, 150);
}

// ── Hauptansicht ───────────────────────────────────────────────

function render() {
  if (!state.meId && state.sheet?.type !== 'addPerson') state.sheet = { type: 'who' };

  const listKey = state.view === 'gruppe' ? 'gruppe' : `person:${state.personId}`;
  const before = listKey === state.lastListKey ? measureRows() : new Map();
  app.innerHTML = renderMain();
  state.lastListKey = state.view === 'gruppe' ? 'gruppe' : `person:${state.personId}`;
  animateRows(before);
  rememberScores();
  renderSheet();
}

function renderMain() {
  const m = me();
  const banner = state.error
    ? `<div class="banner error">${esc(state.error)}</div>`
    : state.store?.mode === 'demo'
      ? `<div class="banner"><strong>Demo-Modus:</strong> Die Daten bleiben nur auf diesem Gerät. Sobald du Supabase in <code>config.js</code> eingetragen hast, sehen alle dieselben Daten.</div>`
      : '';

  const count = state.data.cheeses.length;
  return `
    <header class="top">
      <h1 class="title">Käseabend</h1>
      ${m ? `<button class="me" data-action="who"><span class="avatar">${initials(m.name)}</span>${esc(m.name)}</button>` : ''}
    </header>
    <p class="subtitle">${count === 0 ? 'Noch kein Käse eingetragen' : count === 1 ? '1 Käse am Tisch' : `${count} Käse am Tisch`}</p>
    ${banner}
    <div class="segments" role="group" aria-label="Ansicht">
      <button data-action="view" data-view="gruppe" aria-pressed="${state.view === 'gruppe'}">Gruppe</button>
      <button data-action="view" data-view="personen" aria-pressed="${state.view === 'personen'}">Personen</button>
    </div>
    ${state.view === 'gruppe' ? renderGroup() : renderPeople()}
    <button class="fab" data-action="add">+ Käse</button>
  `;
}

function renderGroup() {
  const { cheeses, ratings, players } = state.data;
  if (cheeses.length === 0) return emptyState();
  const { ranked, unrated } = groupRanking(cheeses, ratings);

  const row = (item) => {
    const mine = ratings.find((r) => r.cheese_id === item.cheese.id && r.player_id === state.meId);
    const todo = state.meId && raterAverage(mine) === null;
    const meta = [
      item.cheese.origin ? esc(item.cheese.origin) : null,
      item.count ? `${item.count} von ${players.length} bewertet` : null,
      todo ? '<span class="todo">Du fehlst noch</span>' : null,
    ].filter(Boolean).join(' · ');
    return `
      <li><button class="row" data-action="open" data-id="${item.cheese.id}">
        <span class="rank num ${item.rank ? `r${item.rank}` : ''}">${item.rank ?? '·'}</span>
        <span class="row-main">
          <div class="row-name">${esc(item.cheese.name)}</div>
          <div class="row-meta">${meta || '&nbsp;'}</div>
        </span>
        <span class="score num ${item.score === null ? 'none' : ''}">${formatScore(item.score)}</span>
      </button></li>`;
  };

  return `
    ${ranked.length ? `<ol class="list">${ranked.map(row).join('')}</ol>` : ''}
    ${unrated.length ? `<div class="section-label">Noch nicht bewertet</div><ul class="list">${unrated.map(row).join('')}</ul>` : ''}
  `;
}

function renderPeople() {
  const { players, cheeses, ratings } = state.data;
  if (!state.personId || !players.some((p) => p.id === state.personId)) {
    state.personId = state.meId || players[0]?.id || null;
  }
  const chips = players.map((p) => `
    <button class="chip" data-action="person" data-id="${p.id}" aria-pressed="${p.id === state.personId}">
      ${esc(p.name)}${p.id === state.meId ? ' (du)' : ''}
    </button>`).join('');

  let body = '';
  if (cheeses.length === 0) {
    body = emptyState();
  } else if (state.personId) {
    const name = playerName(state.personId);
    const { ranked, open } = playerRanking(state.personId, cheeses, ratings);
    const row = (item) => `
      <li><button class="row" data-action="open" data-id="${item.cheese.id}">
        <span class="rank num ${item.rank ? `r${item.rank}` : ''}">${item.rank ?? '·'}</span>
        <span class="row-main">
          <div class="row-name">${esc(item.cheese.name)}</div>
          <div class="row-meta">${item.rating
            ? CATEGORIES.map((c) => `${c.label} ${item.rating[c.key]}`).join(' · ')
            : 'noch offen'}</div>
        </span>
        <span class="score num ${item.score === null ? 'none' : ''}">${formatScore(item.score)}</span>
      </button></li>`;
    body = `
      <div class="section-label">${esc(genitive(name))} Rangliste</div>
      ${ranked.length ? `<ol class="list">${ranked.map(row).join('')}</ol>`
        : `<div class="empty"><strong>Noch nichts bewertet</strong>${esc(name)} hat noch keinen Käse bewertet.</div>`}
      ${open.length ? `<div class="section-label">Noch offen</div><ul class="list">${open.map(row).join('')}</ul>` : ''}
    `;
  }

  return `
    <div class="chips">${chips}<button class="chip add" data-action="addPerson">+ Person</button></div>
    ${body}
  `;
}

function emptyState() {
  return `<div class="empty"><div class="big">🧀</div><strong>Noch kein Käse da</strong>Tippe unten auf „+ Käse“, um den ersten einzutragen.</div>`;
}

// ── Reihenfolge-Animation (Zeilen gleiten an ihren neuen Platz) ──

function measureRows() {
  const map = new Map();
  app.querySelectorAll('.row[data-id]').forEach((el) => map.set(el.dataset.id, el.getBoundingClientRect().top));
  return map;
}

function animateRows(before) {
  if (!before.size) return;
  app.querySelectorAll('.row[data-id]').forEach((el) => {
    const id = el.dataset.id;
    const old = before.get(id);
    const now = el.getBoundingClientRect().top;
    const prevScore = state.lastScores.get(id);
    const { score } = cheeseScore(id, state.data.ratings);
    if (old !== undefined && Math.abs(old - now) > 2) {
      el.animate([{ transform: `translateY(${old - now}px)` }, { transform: 'none' }], {
        duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)',
      });
    }
    if (prevScore !== undefined && prevScore !== score) {
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
  });
}

function rememberScores() {
  state.lastScores = new Map(state.data.cheeses.map((c) => [c.id, cheeseScore(c.id, state.data.ratings).score]));
}

// ── Blätter ────────────────────────────────────────────────────

function openSheet(sheet) { state.sheet = sheet; renderSheet(true); }
function closeSheet() {
  if (!state.meId) return openSheet({ type: 'who' }); // „Wer bist du?“ muss beantwortet werden
  state.sheet = null; sheetRoot.innerHTML = '';
}

/** fresh = komplett neu zeichnen; sonst nur Zahlen auffrischen (Formular bleibt erhalten). */
function renderSheet(fresh = false) {
  const s = state.sheet;
  if (!s) { sheetRoot.innerHTML = ''; return; }

  if (s.type === 'cheese') {
    const cheese = cheeseById(s.id);
    if (!cheese) { state.sheet = null; sheetRoot.innerHTML = ''; toast('Dieser Käse wurde gelöscht.'); return; }
    const stats = sheetRoot.querySelector('#cheese-stats');
    if (!fresh && stats && sheetRoot.dataset.for === s.id) {
      stats.innerHTML = renderCheeseStats(cheese);
      return;
    }
    sheetRoot.dataset.for = s.id;
    sheetRoot.innerHTML = wrapSheet(renderCheeseSheet(cheese));
    updatePreview();
    return;
  }

  if (!fresh && sheetRoot.firstElementChild) return; // Formulare nicht beim Live-Update zerstören
  sheetRoot.dataset.for = '';
  if (s.type === 'who') sheetRoot.innerHTML = wrapSheet(renderWhoSheet(), !state.meId);
  if (s.type === 'add') sheetRoot.innerHTML = wrapSheet(renderAddSheet());
  if (s.type === 'addPerson') sheetRoot.innerHTML = wrapSheet(renderAddPersonSheet());
  sheetRoot.querySelector('input')?.focus();
}

function wrapSheet(inner, locked = false) {
  return `<div class="overlay" data-action="${locked ? '' : 'backdrop'}">
    <div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${inner}</div>
  </div>`;
}

function head(title, sub = '', closable = true) {
  return `<div class="sheet-head"><div><h2>${title}</h2>${sub ? `<div class="hint" style="margin:0">${sub}</div>` : ''}</div>
    ${closable ? '<button class="close" data-action="close" aria-label="Schließen">×</button>' : ''}</div>`;
}

function renderCheeseSheet(cheese) {
  const mine = state.data.ratings.find((r) => r.cheese_id === cheese.id && r.player_id === state.meId);
  const options = (sel) => [`<option value="">–</option>`]
    .concat(Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, i) => {
      const v = i + MIN_SCORE;
      return `<option value="${v}" ${sel === v ? 'selected' : ''}>${v}</option>`;
    })).join('');

  return `
    ${head(esc(cheese.name), cheese.origin ? esc(cheese.origin) : '')}
    <div id="cheese-stats">${renderCheeseStats(cheese)}</div>

    <form class="card" id="rate-form" style="margin-top:14px">
      <h3>${mine ? 'Deine Bewertung ändern' : 'Deine Bewertung'} · ${esc(me()?.name ?? '')}</h3>
      <div class="form-grid">
        ${CATEGORIES.map((c) => `
          <div class="field">
            <label for="f-${c.key}">${c.label}</label>
            <select id="f-${c.key}" name="${c.key}" class="num">${options(mine?.[c.key])}</select>
          </div>`).join('')}
      </div>
      <div class="preview">
        <span>Deine Note</span>
        <span class="score num" id="preview-score">–</span>
      </div>
      <button class="btn" type="submit" id="save-btn" disabled>Speichern</button>
    </form>

    <button class="btn ghost" data-action="delete" data-id="${cheese.id}">Käse löschen</button>
  `;
}

function renderCheeseStats(cheese) {
  const { players, ratings } = state.data;
  const { score, count } = cheeseScore(cheese.id, ratings);
  const avgs = categoryAverages(cheese.id, ratings);
  const { done, missing } = ratingProgress(cheese.id, players, ratings);
  const { ranked } = groupRanking(state.data.cheeses, ratings);
  const place = ranked.find((x) => x.cheese.id === cheese.id)?.rank;

  const bars = CATEGORIES.map((c) => `
    <div class="bar"><span>${c.label}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${avgs[c.key] ? (avgs[c.key] / MAX_SCORE) * 100 : 0}%"></span></span>
      <span class="num">${formatScore(avgs[c.key])}</span></div>`).join('');

  const people = done.map((p) => {
    const r = ratings.find((x) => x.cheese_id === cheese.id && x.player_id === p.id);
    return `<li><span class="avatar">${initials(p.name)}</span>
      <span class="who"><div>${esc(p.name)}</div><div class="detail num">${CATEGORIES.map((c) => `${c.label} ${r[c.key]}`).join(' · ')}</div></span>
      <span class="score small num">${formatScore(raterAverage(r))}</span></li>`;
  }).concat(missing.map((p) => `<li class="missing"><span class="avatar">${initials(p.name)}</span>
      <span class="who">${esc(p.name)}</span><span class="detail">noch offen</span></li>`)).join('');

  return `
    <div class="hero">
      <span class="score num ${score === null ? 'none' : ''}">${formatScore(score)}</span>
      <span class="of">${score === null ? 'noch keine Bewertung' : `${place}. Platz · ${bewertungen(count)}`}</span>
    </div>
    ${count ? `<div class="card"><h3>Gruppenschnitt je Kategorie</h3><div class="bars">${bars}</div></div>` : ''}
    <div class="card"><h3>Wer hat wie bewertet</h3><ul class="people">${people}</ul></div>
  `;
}

function renderWhoSheet() {
  const list = state.data.players.map((p) => `
    <button data-action="pickMe" data-id="${p.id}"><span class="avatar">${initials(p.name)}</span>${esc(p.name)}</button>`).join('');
  return `
    ${head('Wer bist du?', 'Dein Handy merkt sich das. Du kannst es oben rechts jederzeit ändern.', !!state.meId)}
    <div class="pick">${list}</div>
    <button class="btn secondary" data-action="addPerson">+ Neue Person hinzufügen</button>
  `;
}

function renderAddSheet() {
  return `
    ${head('Käse hinzufügen')}
    <form id="add-form" class="form-grid" style="margin-top:18px" autocomplete="off">
      <input type="text" name="name" placeholder="Name, z. B. Comté 18 Monate" maxlength="60" required>
      <input type="text" name="origin" placeholder="Herkunft (optional), z. B. Frankreich" maxlength="60">
      <div class="error-text" id="add-error"></div>
      <button class="btn" type="submit" style="margin-top:0">Hinzufügen</button>
    </form>
  `;
}

function renderAddPersonSheet() {
  return `
    ${head('Neue Person', '', !!state.meId || state.data.players.length > 0)}
    <form id="person-form" class="form-grid" style="margin-top:18px" autocomplete="off">
      <input type="text" name="name" placeholder="Vorname" maxlength="40" required>
      <div class="error-text" id="person-error"></div>
      <button class="btn" type="submit" style="margin-top:0">Hinzufügen</button>
    </form>
  `;
}

function updatePreview() {
  const form = sheetRoot.querySelector('#rate-form');
  if (!form) return;
  const scores = scoresFromForm(Object.fromEntries(new FormData(form)));
  sheetRoot.querySelector('#preview-score').textContent = scores ? formatScore(raterAverage(scores)) : '–';
  sheetRoot.querySelector('#save-btn').disabled = !scores;
}

// ── Aktionen ───────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !el.dataset.action) return;
  const { action, id } = el.dataset;

  if (action === 'backdrop') { if (e.target === el) closeSheet(); return; }
  if (action === 'close') return closeSheet();
  if (action === 'view') { state.view = el.dataset.view; return render(); }
  if (action === 'person') { state.personId = id; return render(); }
  if (action === 'open') return openSheet({ type: 'cheese', id });
  if (action === 'add') return openSheet({ type: 'add' });
  if (action === 'who') return openSheet({ type: 'who' });
  if (action === 'addPerson') return openSheet({ type: 'addPerson' });

  if (action === 'pickMe') {
    state.meId = id; safeSet(ME_KEY, id);
    state.personId = id;
    state.sheet = null; sheetRoot.innerHTML = '';
    render();
    toast(`Hallo ${playerName(id)}!`);
    return;
  }

  if (action === 'delete') {
    const cheese = cheeseById(id);
    if (!cheese || !confirm(`„${cheese.name}“ und alle Bewertungen dazu löschen?`)) return;
    try {
      await state.store.deleteCheese(id);
      state.sheet = null; sheetRoot.innerHTML = '';
      await reload();
      toast('Gelöscht');
    } catch (err) { toast(err.message); }
  }
});

sheetRoot.addEventListener('change', (e) => { if (e.target.matches('select')) updatePreview(); });

sheetRoot.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(form));

  if (form.id === 'rate-form') {
    const scores = scoresFromForm(values);
    if (!scores) return;
    btn.disabled = true; btn.textContent = 'Speichere …';
    try {
      await state.store.saveRating(state.sheet.id, state.meId, scores);
      state.sheet = null; sheetRoot.innerHTML = '';
      await reload();
      toast(`Gespeichert · deine Note ${formatScore(raterAverage(scores))}`);
    } catch (err) {
      toast(err.message); btn.disabled = false; btn.textContent = 'Speichern';
    }
    return;
  }

  if (form.id === 'add-form') {
    const name = cleanName(values.name);
    const msg = validateName(name, [], { maxLength: 60 });
    if (msg) { form.querySelector('#add-error').textContent = msg; return; }
    btn.disabled = true;
    try {
      const cheese = await state.store.addCheese({ name, origin: cleanName(values.origin), created_by: state.meId });
      await reload();
      openSheet({ type: 'cheese', id: cheese.id }); // direkt bewerten
    } catch (err) { form.querySelector('#add-error').textContent = err.message; btn.disabled = false; }
    return;
  }

  if (form.id === 'person-form') {
    const name = cleanName(values.name);
    const msg = validateName(name, state.data.players.map((p) => p.name));
    if (msg) { form.querySelector('#person-error').textContent = msg; return; }
    btn.disabled = true;
    try {
      const p = await state.store.addPlayer(name);
      await reload();
      if (!state.meId) {
        state.meId = p.id; safeSet(ME_KEY, p.id);
        toast(`Hallo ${p.name}!`);
      } else {
        toast(`${p.name} ist dabei`);
      }
      state.personId = p.id;
      state.sheet = null; sheetRoot.innerHTML = '';
      render();
    } catch (err) { form.querySelector('#person-error').textContent = err.message; btn.disabled = false; }
  }
});

// ── Start ──────────────────────────────────────────────────────

(async function start() {
  try {
    state.store = await createStore();
  } catch {
    app.innerHTML = '<div class="banner error" style="margin-top:30vh">Die App konnte nicht starten. Bitte Internetverbindung prüfen und neu laden.</div>';
    return;
  }
  await reload();
  state.store.subscribe(reloadSoon);
  // Sicherheitsnetz, falls die Live-Verbindung mal hängt:
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
  setInterval(() => { if (!document.hidden) reload(); }, 20000);
})();
