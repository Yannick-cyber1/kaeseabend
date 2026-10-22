/**
 * ============================================================================
 * Käseabend – Tasting & Scorecard Web-App (Oberfläche)
 * Rechnen: logic.js · Speichern: store.js (Supabase für alle / Demo lokal)
 * ============================================================================
 */
import {
  CRITERIA, FLAVOR_TAGS, DEFAULT_SCORE, MIN_SCORE, MAX_SCORE,
  snapScore, ratingScore, findRating, ratingFromInputs, cheeseSummary,
  leaderboard, awards, radarData, formatScore, formatSpread, cleanText,
  validateName, nextTesterId, randomAvatar, buildShareText, escapeHtml as esc,
} from './logic.js';
import { createStore } from './store.js';

const ME_KEY = 'ka_me';
const CHEESE_KEY = 'ka_cheese';
const $ = (id) => document.getElementById(id);

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* egal */ } }

const state = {
  store: null,
  testers: [],
  cheeses: [],
  ratings: [],
  meId: lsGet(ME_KEY),
  cheeseId: lsGet(CHEESE_KEY),
  tab: 'taste',
  error: null,
  busy: false,
};

let radarChartInstance = null;
let cheeseSelectSignature = '';

// --- Hilfen ------------------------------------------------------------------

function showToast(msg, icon = '✓') {
  const el = $('toast');
  if (!el) return;
  $('toast-msg').innerText = msg;
  $('toast-icon').innerText = icon;
  el.classList.remove('translate-y-20', 'opacity-0');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.add('translate-y-20', 'opacity-0'), 2400);
}

const testerById = (id) => state.testers.find((t) => t.id === id) || null;
const cheeseById = (id) => state.cheeses.find((c) => c.id === id) || null;
const board = () => leaderboard(state.cheeses, state.testers, state.ratings);

function persistSelection() {
  lsSet(ME_KEY, state.meId);
  lsSet(CHEESE_KEY, state.cheeseId);
}

/** Korrigiert Auswahl nach Löschungen. Gibt true zurück, wenn sich der Käse geändert hat. */
function ensureSelection() {
  let cheeseChanged = false;
  if (!cheeseById(state.cheeseId)) {
    state.cheeseId = state.cheeses[0]?.id ?? null;
    cheeseChanged = true;
  }
  if (state.meId && !testerById(state.meId)) state.meId = null;
  persistSelection();
  return cheeseChanged;
}

// --- Daten laden & Live-Aktualisierung ---------------------------------------

async function reload({ withForm = false } = {}) {
  try {
    const data = await state.store.loadAll();
    state.testers = data.testers;
    state.cheeses = data.cheeses;
    state.ratings = data.ratings;
    state.error = null;
  } catch (e) {
    state.error = e.message;
  }
  const cheeseChanged = ensureSelection();
  renderAll({ withForm: withForm || cheeseChanged });
}

let reloadTimer;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => reload(), 200);
}

function renderAll({ withForm = false } = {}) {
  renderStatus();
  renderHeaderTesterPills();
  renderCheeseSelect();
  renderTasteVisibility();
  if (withForm) loadActiveRatingIntoForm();
  updateCheeseBadge();
  renderLeaderboard();
  renderMatrix();
  renderCheeseManageList();
  if (!$('modal-tester').classList.contains('hidden')) renderTesterModalList();
  renderWhoModal();
}

function renderStatus() {
  const el = $('status-banner');
  if (!el) return;
  if (state.error) {
    el.className = 'mb-4 rounded-xl border border-rose-800/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200';
    el.innerHTML = `⚠️ ${esc(state.error)}`;
  } else if (state.store?.mode === 'demo') {
    el.className = 'mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200';
    el.innerHTML = '<strong>Demo-Modus:</strong> Daten bleiben nur auf diesem Gerät. Sobald Supabase in <code>config.js</code> eingetragen ist, sehen alle dieselben Daten.';
  } else {
    el.className = 'hidden';
    el.innerHTML = '';
  }

  const modeText = $('data-mode-text');
  if (modeText) {
    modeText.innerText = state.store?.mode === 'online'
      ? 'Alle Daten liegen gemeinsam online – jeder sieht live dieselben Werte.'
      : 'Demo-Modus: Alle Bewertungen liegen nur lokal in diesem Browser.';
  }
  const resetBtn = $('btn-reset-demo');
  if (resetBtn) resetBtn.classList.toggle('hidden', state.store?.mode !== 'demo');
}

// --- Tabs --------------------------------------------------------------------

function switchTab(tabId) {
  state.tab = tabId;
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.remove('bg-amber-500', 'text-stone-950', 'font-semibold');
    btn.classList.add('text-stone-300');
  });
  $(`tab-${tabId}`)?.classList.remove('hidden');
  const activeBtn = $(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-stone-300');
    activeBtn.classList.add('bg-amber-500', 'text-stone-950', 'font-semibold');
  }
  if (tabId === 'leaderboard') renderLeaderboard();
  else if (tabId === 'matrix') renderMatrix();
  else if (tabId === 'manage') renderCheeseManageList();
}

// --- Tester-Auswahl im Kopf ----------------------------------------------------

function renderHeaderTesterPills() {
  const container = $('header-tester-pills');
  if (!container) return;
  container.innerHTML = state.testers.map((t) => {
    const isActive = t.id === state.meId;
    return `
      <button onclick="setTester('${t.id}')" class="shrink-0 px-2.5 py-1 text-xs rounded-lg font-medium transition flex items-center gap-1.5 ${
        isActive ? 'bg-amber-500 text-stone-950 font-bold shadow' : 'bg-stone-800/80 text-stone-300 hover:bg-stone-700 hover:text-white'
      }">
        <span>${esc(t.avatar || '👤')}</span>
        <span>${esc(t.name)}</span>
      </button>`;
  }).join('');
  const active = testerById(state.meId);
  const label = $('active-tester-name');
  if (label) label.innerText = active ? active.name : '–';
}

function setTester(testerId) {
  if (!testerById(testerId)) return;
  state.meId = testerId;
  persistSelection();
  renderHeaderTesterPills();
  loadActiveRatingIntoForm();
  renderMatrix();
}

// --- „Wer bist du?“ beim ersten Öffnen ----------------------------------------

function renderWhoModal() {
  const modal = $('modal-who');
  if (!modal) return;
  const needed = !state.error && !state.meId;
  modal.classList.toggle('hidden', !needed);
  if (!needed) return;
  $('who-list').innerHTML = state.testers.map((t) => `
    <button onclick="pickMe('${t.id}')" class="w-full flex items-center gap-3 p-3 rounded-xl bg-stone-950 border border-stone-800 hover:border-amber-500 text-left transition">
      <span class="text-xl">${esc(t.avatar || '👤')}</span>
      <span class="font-bold text-white">${esc(t.name)}</span>
    </button>`).join('') || '<p class="text-xs text-stone-400">Noch niemand angelegt – trag dich unten ein.</p>';
}

function pickMe(id) {
  setTester(id);
  $('modal-who').classList.add('hidden');
  showToast(`Hallo ${testerById(id)?.name ?? ''}!`, '👋');
}

async function addMeAsNew() {
  const input = $('who-new-input');
  const err = $('who-error');
  const name = cleanText(input.value, 40);
  const msg = validateName(name, state.testers.map((t) => t.name));
  if (msg) { err.innerText = msg; return; }
  err.innerText = '';
  try {
    const t = await state.store.addTester({ name, avatar: randomAvatar() });
    input.value = '';
    await reload();
    pickMe(t.id);
  } catch (e) { err.innerText = e.message; }
}

// --- Käse-Auswahl & Formular ----------------------------------------------------

function renderTasteVisibility() {
  const hasCheese = state.cheeses.length > 0;
  $('taste-main')?.classList.toggle('hidden', !hasCheese);
  $('taste-empty')?.classList.toggle('hidden', hasCheese);
}

function renderCheeseSelect() {
  const select = $('select-cheese');
  if (!select) return;
  const signature = state.cheeses.map((c) => `${c.id}|${c.name}|${c.category}`).join('§');
  if (signature !== cheeseSelectSignature) {
    select.innerHTML = state.cheeses.map((c) => `
      <option value="${c.id}">${esc(c.name)}${c.category ? ` (${esc(c.category)})` : ''}</option>`).join('');
    cheeseSelectSignature = signature;
  }
  if (state.cheeseId) select.value = state.cheeseId;
}

function updateCheeseBadge() {
  const c = cheeseById(state.cheeseId);
  const container = $('cheese-badge-desc');
  const avgEl = $('cheese-group-avg');
  if (!c || !container) {
    if (container) container.innerHTML = '';
    if (avgEl) avgEl.innerHTML = '--';
    return;
  }
  const chips = [];
  if (c.milk) chips.push(`<span class="px-2 py-0.5 rounded bg-stone-800 text-amber-300 font-medium">🥛 ${esc(c.milk)}</span>`);
  if (c.origin) chips.push(`<span class="px-2 py-0.5 rounded bg-stone-800 text-stone-300">🌍 ${esc(c.origin)}</span>`);
  if (c.age) chips.push(`<span class="px-2 py-0.5 rounded bg-stone-800 text-stone-300">⏳ ${esc(c.age)}</span>`);
  if (c.pairing) chips.push(`<span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">🍷 Pairing: ${esc(c.pairing)}</span>`);
  container.innerHTML = chips.join('');

  const s = cheeseSummary(c.id, state.testers, state.ratings);
  if (avgEl) {
    avgEl.innerHTML = `${formatScore(s.total)} <span class="text-xs text-stone-500 font-normal">/ 10</span>
      <span class="block text-[10px] text-stone-500 font-normal">${s.count} von ${state.testers.length}</span>`;
  }
}

function onCheeseChange() {
  const select = $('select-cheese');
  if (!select) return;
  state.cheeseId = select.value;
  persistSelection();
  updateCheeseBadge();
  loadActiveRatingIntoForm();
}

function renderSliders() {
  const container = $('rating-sliders-container');
  if (!container) return;
  container.innerHTML = CRITERIA.map((crit) => `
    <div class="bg-stone-900/60 border border-stone-800/80 rounded-xl p-4 transition hover:border-stone-700">
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-bold text-white">${crit.label}</span>
        <div class="flex items-center gap-2">
          <button type="button" onclick="stepSlider('${crit.key}', -0.5)" class="w-8 h-8 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-bold transition">-</button>
          <span class="font-mono text-base font-black text-amber-400 w-10 text-center" id="val-${crit.key}">${DEFAULT_SCORE.toFixed(1)}</span>
          <button type="button" onclick="stepSlider('${crit.key}', 0.5)" class="w-8 h-8 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-bold transition">+</button>
        </div>
      </div>
      <p class="text-[11px] text-stone-400 mb-3">${crit.hint}</p>
      <input type="range" id="slider-${crit.key}" min="${MIN_SCORE}" max="${MAX_SCORE}" step="0.5" value="${DEFAULT_SCORE}" oninput="onSliderInput('${crit.key}')" class="w-full accent-amber-500 cursor-pointer bg-stone-800 h-2 rounded-lg">
      <div class="flex justify-between text-[10px] text-stone-400 mt-1 font-mono">
        <span>1.0 (flach)</span>
        <span>5.5 (solide)</span>
        <span>10.0 (Götterstoff)</span>
      </div>
    </div>`).join('');
}

function stepSlider(key, delta) {
  const slider = $(`slider-${key}`);
  if (!slider) return;
  slider.value = snapScore(parseFloat(slider.value) + delta);
  onSliderInput(key);
}

function onSliderInput(key) {
  const slider = $(`slider-${key}`);
  const display = $(`val-${key}`);
  if (!slider || !display) return;
  display.innerText = snapScore(slider.value).toFixed(1);
  updateLiveAverage();
}

function readSliderValues() {
  const values = {};
  for (const c of CRITERIA) values[c.key] = $(`slider-${c.key}`)?.value ?? DEFAULT_SCORE;
  return values;
}

function updateLiveAverage() {
  const r = ratingFromInputs(readSliderValues());
  const el = $('current-total-live');
  if (el) el.innerHTML = `${formatScore(ratingScore(r))} <span class="text-xs text-stone-500 font-normal">/ 10</span>`;
}

function loadActiveRatingIntoForm() {
  const r = findRating(state.ratings, state.cheeseId, state.meId);
  for (const c of CRITERIA) {
    const val = r ? r[c.key] : DEFAULT_SCORE;
    const slider = $(`slider-${c.key}`);
    const display = $(`val-${c.key}`);
    if (slider) slider.value = val;
    if (display) display.innerText = Number(val).toFixed(1);
  }
  renderFlavorTags(r ? r.tags || [] : []);
  const notes = $('tasting-notes');
  if (notes) notes.value = r ? r.note || '' : '';
  const status = $('form-status');
  if (status) status.innerText = r ? 'Du hast diesen Käse schon bewertet – Änderungen überschreiben deine Note.' : '';
  updateLiveAverage();
}

function renderFlavorTags(selected = []) {
  const container = $('flavor-tags');
  if (!container) return;
  container.innerHTML = FLAVOR_TAGS.map((tag) => {
    const on = selected.includes(tag);
    return `
      <button type="button" data-tag="${esc(tag)}" onclick="toggleTag(this)" class="tag-chip px-2.5 py-1 text-xs rounded-lg transition ${
        on ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
      }">${esc(tag)}</button>`;
  }).join('');
}

function toggleTag(btn) {
  ['bg-amber-500', 'text-stone-950', 'font-bold', 'bg-stone-900', 'border', 'border-stone-800', 'text-stone-400']
    .forEach((cls) => btn.classList.toggle(cls));
}

function getSelectedTags() {
  return [...document.querySelectorAll('#flavor-tags .tag-chip')]
    .filter((b) => b.classList.contains('bg-amber-500'))
    .map((b) => b.dataset.tag);
}

function resetCurrentFormToDefault() {
  for (const c of CRITERIA) {
    const s = $(`slider-${c.key}`);
    const v = $(`val-${c.key}`);
    if (s) s.value = DEFAULT_SCORE;
    if (v) v.innerText = DEFAULT_SCORE.toFixed(1);
  }
  renderFlavorTags([]);
  const notes = $('tasting-notes');
  if (notes) notes.value = '';
  updateLiveAverage();
  showToast('Formular auf 7.5 Standard gesetzt', '↺');
}

function setBusy(busy) {
  state.busy = busy;
  ['save-btn', 'save-next-btn'].forEach((id) => {
    const b = $(id);
    if (b) { b.disabled = busy; b.classList.toggle('opacity-50', busy); }
  });
}

async function saveRating(nextTester = false) {
  if (state.busy) return;
  if (!state.cheeseId) { showToast('Bitte zuerst einen Käse anlegen', '🧀'); return; }
  if (!state.meId) { renderWhoModal(); return; }
  const rating = ratingFromInputs(readSliderValues(), getSelectedTags(), $('tasting-notes')?.value);
  setBusy(true);
  try {
    await state.store.saveRating(state.cheeseId, state.meId, rating);
    await reload();
    showToast(`Gespeichert · ${testerById(state.meId)?.name ?? ''}: ${formatScore(ratingScore(rating))}`);
    if (nextTester) setTester(nextTesterId(state.testers, state.meId));
    else loadActiveRatingIntoForm();
  } catch (e) {
    showToast(e.message, '⚠️');
  } finally {
    setBusy(false);
  }
}

// --- Rangliste & Awards -----------------------------------------------------------

function renderLeaderboard() {
  const list = board();
  const rated = list.filter((i) => i.summary.count > 0);
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const podiumEl = $('podium-view');
  if (podiumEl) {
    podiumEl.innerHTML = rated.slice(0, 3).map((item, idx) => `
      <div class="flex items-center justify-between p-3 rounded-xl ${idx === 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-stone-900/60 border border-stone-800'}">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-2xl">${medals[item.rank] || '🏅'}</span>
          <div class="min-w-0">
            <div class="font-bold text-white text-sm truncate">${esc(item.cheese.name)}</div>
            <div class="text-[11px] text-stone-400">${esc(item.cheese.category || 'Käse')} • ${item.summary.count} Tester</div>
          </div>
        </div>
        <div class="text-right">
          <span class="text-xl font-mono font-black text-amber-400">${formatScore(item.summary.total)}</span>
          <span class="text-[10px] text-stone-500 block">/ 10</span>
        </div>
      </div>`).join('') || '<div class="text-xs text-stone-500 text-center py-4">Noch keine Bewertungen.</div>';
  }

  const tbody = $('leaderboard-tbody');
  if (tbody) {
    tbody.innerHTML = list.map((item) => {
      const s = item.summary;
      const rank = item.rank;
      const rankBadge = rank === null ? '–' : (medals[rank] ? `${medals[rank]} ${rank}.` : `${rank}.`);
      const cell = (key) => `<td class="py-3 px-3 text-center font-mono text-stone-300">${s.count ? formatScore(s.avg[key]) : '-'}</td>`;
      const sub = [item.cheese.milk, item.cheese.origin].filter(Boolean).map(esc).join(' | ');
      return `
        <tr class="hover:bg-stone-900/50 transition">
          <td class="py-3 px-3 font-bold font-mono whitespace-nowrap ${rank && rank <= 3 ? 'text-amber-400' : 'text-stone-400'}">${rankBadge}</td>
          <td class="py-3 px-3">
            <div class="font-bold text-white">${esc(item.cheese.name)}</div>
            ${sub ? `<div class="text-[11px] text-stone-400">${sub}</div>` : ''}
          </td>
          ${CRITERIA.map((c) => cell(c.key)).join('')}
          <td class="py-3 px-3 text-right">
            <span class="font-mono font-bold text-base ${s.total >= 8.5 ? 'text-amber-400' : 'text-stone-200'}">${formatScore(s.total)}</span>
            <span class="text-[10px] text-stone-400 block whitespace-nowrap">${s.count} Votings</span>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="8" class="py-6 text-center text-xs text-stone-500">Noch kein Käse angelegt.</td></tr>';
  }

  const countEl = $('total-ratings-count');
  if (countEl) {
    const n = rated.reduce((s, i) => s + i.summary.count, 0);
    countEl.innerText = n === 1 ? '1 abgegebene Note' : `${n} abgegebene Noten`;
  }

  renderAwards(list);
  if (state.tab === 'leaderboard') renderRadar(list);
}

function renderAwards(list) {
  const container = $('awards-container');
  if (!container) return;
  const a = awards(list);
  if (!a) {
    container.innerHTML = '<div class="col-span-full text-xs text-stone-500 text-center py-4">Noch keine Bewertungen für Awards vorhanden.</div>';
    return;
  }
  container.innerHTML = `
    <div class="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-2xl p-4">
      <div class="text-xl mb-1">👃 Aroma-Bombe</div>
      <div class="text-sm font-bold text-white truncate">${esc(a.aroma.cheese.name)}</div>
      <div class="text-xs text-amber-400 font-mono mt-1">${formatScore(a.aroma.summary.avg.aroma)} / 10 im Duft</div>
      <div class="text-[10px] text-stone-400 mt-0.5">Höchste Duft-Intensität</div>
    </div>
    <div class="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/20 rounded-2xl p-4">
      <div class="text-xl mb-1">🧈 Schmelz-König</div>
      <div class="text-sm font-bold text-white truncate">${esc(a.texture.cheese.name)}</div>
      <div class="text-xs text-orange-400 font-mono mt-1">${formatScore(a.texture.summary.avg.texture)} / 10 in Textur</div>
      <div class="text-[10px] text-stone-400 mt-0.5">Bestes Mundgefühl</div>
    </div>
    <div class="bg-gradient-to-br from-rose-500/10 to-transparent border border-rose-500/20 rounded-2xl p-4">
      <div class="text-xl mb-1">⚡ Spaltpilz</div>
      <div class="text-sm font-bold text-white truncate">${a.contested ? esc(a.contested.cheese.name) : 'Noch offen'}</div>
      <div class="text-xs text-rose-400 font-mono mt-1">${a.contested ? `${formatSpread(a.contested.summary.stdDev)} Notenspanne` : 'Mind. 2 Votings nötig'}</div>
      <div class="text-[10px] text-stone-400 mt-0.5">Hier scheiden sich die Geister</div>
    </div>
    <div class="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-2xl p-4">
      <div class="text-xl mb-1">🤝 Einhelliger Konsens</div>
      <div class="text-sm font-bold text-white truncate">${a.consensus ? esc(a.consensus.cheese.name) : 'Noch offen'}</div>
      <div class="text-xs text-emerald-400 font-mono mt-1">${a.consensus ? `${formatSpread(a.consensus.summary.stdDev)} Abweichung` : 'Mind. 2 Votings nötig'}</div>
      <div class="text-[10px] text-stone-400 mt-0.5">Alle Tester einer Meinung</div>
    </div>`;
}

function renderRadar(list) {
  const canvas = $('radarChart');
  if (!canvas || typeof window.Chart === 'undefined') return;
  const d = radarData(list);
  if (radarChartInstance) radarChartInstance.destroy();
  radarChartInstance = new window.Chart(canvas, {
    type: 'radar',
    data: {
      labels: d.labels,
      datasets: [
        {
          label: d.topName ? `🥇 ${d.topName}` : 'Sieger',
          data: d.top || [0, 0, 0, 0, 0],
          backgroundColor: 'rgba(245, 158, 11, 0.25)',
          borderColor: '#f59e0b',
          borderWidth: 2,
          pointBackgroundColor: '#f59e0b',
          pointRadius: 3,
        },
        {
          label: 'Gesamt-Durchschnitt',
          data: d.overall || [0, 0, 0, 0, 0],
          backgroundColor: 'rgba(120, 113, 108, 0.2)',
          borderColor: '#78716c',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointBackgroundColor: '#78716c',
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        r: {
          min: 0,
          max: 10,
          ticks: { stepSize: 2, display: false },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: { color: '#a8a29e', font: { size: 10, family: 'Plus Jakarta Sans' } },
        },
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e7e5e4', font: { size: 10 }, boxWidth: 12 } },
      },
    },
  });
}

// --- Noten-Matrix -----------------------------------------------------------------

function renderMatrix() {
  const table = $('matrix-table');
  if (!table) return;
  if (state.cheeses.length === 0) {
    table.innerHTML = '<tbody><tr><td class="py-6 text-center text-xs text-stone-500">Noch kein Käse angelegt.</td></tr></tbody>';
    return;
  }
  let html = `
    <thead class="bg-stone-900/80 text-stone-400 text-xs uppercase font-semibold">
      <tr>
        <th class="py-2.5 px-3 rounded-l-lg">Käse</th>
        ${state.testers.map((t) => `<th class="py-2.5 px-3 text-center whitespace-nowrap">${esc(t.avatar || '👤')} ${esc(t.name)}</th>`).join('')}
        <th class="py-2.5 px-3 text-right rounded-r-lg">Schnitt</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-stone-800/50">`;

  for (const c of state.cheeses) {
    const sum = cheeseSummary(c.id, state.testers, state.ratings);
    html += `
      <tr class="hover:bg-stone-900/40 transition">
        <td class="py-3 px-3 font-semibold text-white">
          <div>${esc(c.name)}</div>
          ${c.category ? `<div class="text-[10px] text-stone-400">${esc(c.category)}</div>` : ''}
        </td>`;
    for (const t of state.testers) {
      const score = ratingScore(findRating(state.ratings, c.id, t.id));
      html += `
        <td class="py-3 px-3 text-center">
          <button onclick="jumpToRating('${c.id}', '${t.id}')" title="Klick zum Bearbeiten" class="px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition ${
            score !== null ? 'bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-amber-300' : 'bg-stone-950/40 text-stone-600 hover:text-stone-300 border border-stone-800'
          }">${score !== null ? formatScore(score) : '+'}</button>
        </td>`;
    }
    html += `
        <td class="py-3 px-3 text-right font-mono font-bold text-amber-400">${formatScore(sum.total)}</td>
      </tr>`;
  }
  table.innerHTML = `${html}</tbody>`;
}

function jumpToRating(cheeseId, testerId) {
  state.cheeseId = cheeseId;
  state.meId = testerId;
  persistSelection();
  renderCheeseSelect();
  renderHeaderTesterPills();
  updateCheeseBadge();
  loadActiveRatingIntoForm();
  switchTab('taste');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Zur Bewertung gewechselt', '👉');
}

// --- Käse verwalten ---------------------------------------------------------------

function renderCheeseManageList() {
  const container = $('cheese-manage-list');
  if (!container) return;
  container.innerHTML = state.cheeses.map((c) => `
    <div class="bg-stone-900/70 border border-stone-800 rounded-xl p-3.5 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2 mb-1">
          <h4 class="font-bold text-white text-sm truncate">${esc(c.name)}</h4>
          ${c.category ? `<span class="shrink-0 text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">${esc(c.category)}</span>` : ''}
        </div>
        <p class="text-xs text-stone-400 mb-2">${[c.milk && `🥛 ${esc(c.milk)}`, c.origin && `🌍 ${esc(c.origin)}`].filter(Boolean).join(' • ') || '&nbsp;'}</p>
        <p class="text-[11px] text-stone-400 line-clamp-1">🍷 ${esc(c.pairing || 'Keine Angabe')}</p>
      </div>
      <div class="flex justify-end gap-2 mt-3 pt-2 border-t border-stone-800/80">
        <button onclick="openCheeseModal('${c.id}')" class="px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition">Bearbeiten</button>
        <button onclick="deleteCheese('${c.id}')" class="px-2.5 py-1 text-xs bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg transition">Löschen</button>
      </div>
    </div>`).join('') || '<div class="col-span-full text-xs text-stone-500 text-center py-6">Noch kein Käse im Sortiment.</div>';
}

function openCheeseModal(cheeseId = null) {
  const modal = $('modal-cheese');
  const form = $('cheese-form');
  if (!modal || !form) return;
  form.reset();
  $('cheese-error').innerText = '';
  const c = cheeseId ? cheeseById(cheeseId) : null;
  if (c) {
    $('cheese-modal-title').innerText = '🧀 Käse bearbeiten';
    $('edit-cheese-id').value = c.id;
    $('input-cheese-name').value = c.name;
    setSelectValue($('input-cheese-category'), c.category);
    setSelectValue($('input-cheese-milk'), c.milk);
    $('input-cheese-origin').value = c.origin || '';
    $('input-cheese-age').value = c.age || '';
    $('input-cheese-pairing').value = c.pairing || '';
  } else {
    $('cheese-modal-title').innerText = '🧀 Neuen Käse anlegen';
    $('edit-cheese-id').value = '';
  }
  modal.classList.remove('hidden');
}

/** Setzt ein Auswahlfeld; unbekannte Werte (z. B. ältere Einträge) werden ergänzt. */
function setSelectValue(select, value) {
  if (!select || !value) return;
  if (![...select.options].some((o) => o.value === value)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  select.value = value;
}

function closeCheeseModal() {
  $('modal-cheese')?.classList.add('hidden');
}

async function handleCheeseSubmit(e) {
  e.preventDefault();
  const name = cleanText($('input-cheese-name').value, 80);
  if (!name) { $('cheese-error').innerText = 'Bitte einen Namen eingeben.'; return; }
  const id = $('edit-cheese-id').value;
  const cheese = {
    id: id || null,
    name,
    category: $('input-cheese-category').value,
    milk: $('input-cheese-milk').value,
    origin: cleanText($('input-cheese-origin').value, 80),
    age: cleanText($('input-cheese-age').value, 80),
    pairing: cleanText($('input-cheese-pairing').value, 200),
  };
  const btn = $('cheese-submit');
  btn.disabled = true;
  try {
    const saved = await state.store.saveCheese(cheese);
    if (!id) {
      state.cheeseId = saved.id;
      persistSelection();
    }
    closeCheeseModal();
    await reload({ withForm: !id });
    showToast('Käsesorte gespeichert!');
  } catch (err) {
    $('cheese-error').innerText = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function deleteCheese(cheeseId) {
  const c = cheeseById(cheeseId);
  if (!c) return;
  if (!confirm(`„${c.name}“ wirklich löschen? Alle Noten dafür werden für alle gelöscht.`)) return;
  try {
    await state.store.deleteCheese(cheeseId);
    await reload({ withForm: state.cheeseId === cheeseId });
    showToast('Käse gelöscht', '🗑️');
  } catch (e) { showToast(e.message, '⚠️'); }
}

// --- Tester verwalten -------------------------------------------------------------

function openTesterModal() {
  renderTesterModalList();
  $('tester-error').innerText = '';
  $('modal-tester')?.classList.remove('hidden');
}

function closeTesterModal() {
  $('modal-tester')?.classList.add('hidden');
  renderHeaderTesterPills();
  renderMatrix();
}

function renderTesterModalList() {
  const container = $('tester-modal-list');
  if (!container) return;
  container.innerHTML = state.testers.map((t) => `
    <div class="flex items-center justify-between p-2.5 rounded-xl bg-stone-950 border border-stone-800">
      <div class="flex items-center gap-2">
        <span class="text-base">${esc(t.avatar || '👤')}</span>
        <span class="font-bold text-white text-sm">${esc(t.name)}${t.id === state.meId ? ' <span class="text-[10px] text-amber-400 font-normal">(du)</span>' : ''}</span>
      </div>
      <button onclick="removeTester('${t.id}')" class="px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/60 rounded transition">Löschen</button>
    </div>`).join('');
}

async function addNewTester() {
  const input = $('new-tester-input');
  const err = $('tester-error');
  const name = cleanText(input.value, 40);
  const msg = validateName(name, state.testers.map((t) => t.name));
  if (msg) { err.innerText = msg; return; }
  err.innerText = '';
  try {
    await state.store.addTester({ name, avatar: randomAvatar() });
    input.value = '';
    await reload();
    renderTesterModalList();
    showToast(`${name} hinzugefügt!`);
  } catch (e) { err.innerText = e.message; }
}

async function removeTester(testerId) {
  const t = testerById(testerId);
  if (!t) return;
  if (state.testers.length <= 1) { alert('Mindestens ein Tester muss vorhanden sein.'); return; }
  if (!confirm(`Tester „${t.name}“ wirklich entfernen? Alle Noten von ${t.name} werden für alle gelöscht.`)) return;
  try {
    await state.store.deleteTester(testerId);
    await reload({ withForm: state.meId === testerId });
    renderTesterModalList();
    showToast('Tester entfernt');
  } catch (e) { showToast(e.message, '⚠️'); }
}

// --- Export & Teilen --------------------------------------------------------------

function shareResultsWhatsApp() {
  const text = buildShareText(board(), state.testers);
  const fallback = () => prompt('Hier der Text zum Kopieren:', text);
  if (!navigator.clipboard) { fallback(); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('Rangliste kopiert! Bereit für WhatsApp.', '📋'))
    .catch(fallback);
}

function exportJSON() {
  const data = {
    exportiert: new Date().toISOString(),
    testers: state.testers,
    cheeses: state.cheeses,
    ratings: state.ratings,
  };
  const a = document.createElement('a');
  a.href = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
  a.download = `kaeseabend_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('JSON-Backup heruntergeladen', '📥');
}

async function resetToDemodata() {
  if (state.store?.mode !== 'demo') return;
  if (!confirm('Alle lokalen Daten auf die Demodaten zurücksetzen?')) return;
  await state.store.resetDemo();
  await reload({ withForm: true });
  showToast('Demodaten wiederhergestellt!', '🔄');
}

// --- Für die onclick-Attribute im HTML freigeben ---------------------------------

Object.assign(window, {
  switchTab, setTester, onCheeseChange, stepSlider, onSliderInput, toggleTag,
  resetCurrentFormToDefault, saveRating, jumpToRating, openCheeseModal, closeCheeseModal,
  handleCheeseSubmit, deleteCheese, openTesterModal, closeTesterModal, addNewTester,
  removeTester, shareResultsWhatsApp, exportJSON, resetToDemodata, pickMe, addMeAsNew,
});

// --- Start --------------------------------------------------------------------------

async function start() {
  renderSliders();
  renderFlavorTags([]);
  $('new-tester-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNewTester(); });
  $('who-new-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addMeAsNew(); });

  try {
    state.store = await createStore();
  } catch {
    state.error = 'Die App konnte keine Verbindung aufbauen. Bitte Internet prüfen und neu laden.';
    renderStatus();
    return;
  }
  await reload({ withForm: true });
  state.store.subscribe(reloadSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
  setInterval(() => { if (!document.hidden) reload(); }, 20000);
}

start();
