/**
 * ============================================================================
 * Käseabend – Blind Tasting & Reveal (Oberfläche)
 * Anmeldung mit Passwort pro Name · Noten bleiben verdeckt, bis alle bewertet haben
 * Rechnen: logic.js · Speichern & Prüfen: store.js + Datenbank-Funktionen
 * ============================================================================
 */
import {
  CRITERIA, FLAVOR_TAGS, DEFAULT_SCORE, MIN_SCORE, MAX_SCORE,
  snapScore, ratingScore, findRating, ratingFromInputs, cheeseSummary,
  awards, radarData, formatScore, formatSpread, cleanText, validateName, randomAvatar,
  escapeHtml as esc, isRevealed, progressFor, hasRated, revealedBoard,
  validatePassword, canRemoveTester, buildRevealShareText,
} from './logic.js';
import { createStore } from './store.js';

const TOKEN_KEY = 'ka_token';
const CHEESE_KEY = 'ka_cheese';
const $ = (id) => document.getElementById(id);

const memory = {};
function lsGet(k) { try { return localStorage.getItem(k); } catch { return memory[k] ?? null; } }
function lsSet(k, v) {
  try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { memory[k] = v || null; }
}

const state = {
  store: null,
  token: lsGet(TOKEN_KEY),
  me: null,
  testers: [],
  cheeses: [],
  progress: [],
  ratings: [],
  cheeseId: lsGet(CHEESE_KEY),
  tab: 'taste',
  error: null,
  busy: false,
  login: { open: false, step: 'pick', testerId: null },
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
  showToast.timer = setTimeout(() => el.classList.add('translate-y-20', 'opacity-0'), 2800);
}

const testerById = (id) => state.testers.find((t) => t.id === id) || null;
const cheeseById = (id) => state.cheeses.find((c) => c.id === id) || null;
const progressOf = (cheeseId) => progressFor(cheeseId, state.testers, state.progress);
const myRating = (cheeseId) => (state.me ? findRating(state.ratings, cheeseId, state.me) : null);

function setToken(token) {
  state.token = token || null;
  lsSet(TOKEN_KEY, state.token);
}

// --- Laden & Live-Aktualisierung ------------------------------------------------

async function reload({ withForm = false } = {}) {
  let meBefore = state.me;
  try {
    const data = await state.store.loadAll(state.token);
    Object.assign(state, {
      me: data.me, testers: data.testers, cheeses: data.cheeses,
      progress: data.progress, ratings: data.ratings, error: null,
    });
  } catch (e) {
    state.error = e.message;
  }
  if (!state.error && state.token && !state.me) setToken(null); // Anmeldung ungültig (z. B. gelöscht)
  if (!cheeseById(state.cheeseId)) {
    state.cheeseId = state.cheeses[0]?.id ?? null;
    withForm = true;
  }
  lsSet(CHEESE_KEY, state.cheeseId);
  if (meBefore !== state.me) withForm = true;
  renderAll({ withForm });
}

let reloadTimer;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => reload(), 250);
}

function renderAll({ withForm = false } = {}) {
  renderStatus();
  updateHeaderIdentity();
  renderCheeseSelect();
  renderTasteVisibility();
  if (withForm) loadMyRatingIntoForm();
  updateCheeseBadge();
  renderMatrix();
  renderLeaderboard();
  renderCheeseManageList();
  if (!$('modal-tester').classList.contains('hidden')) renderTesterModalList();
  if (!state.error && !state.me) openLogin();
  else if (state.login.open) renderLogin();
}

function renderStatus() {
  const el = $('status-banner');
  if (!el) return;
  if (state.error) {
    el.className = 'mb-4 rounded-xl border border-rose-800/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200';
    el.innerHTML = `⚠️ ${esc(state.error)}`;
  } else {
    el.className = 'hidden';
    el.innerHTML = '';
  }
}

// --- Anmeldung -----------------------------------------------------------------------

function openLogin() {
  if (!state.login.open) state.login = { open: true, step: 'pick', testerId: null };
  $('modal-onboarding').classList.remove('hidden');
  renderLogin();
}

function promptSwitchUser() {
  state.login = { open: true, step: 'pick', testerId: null };
  $('modal-onboarding').classList.remove('hidden');
  renderLogin();
}

function closeLogin() {
  if (!state.me) return; // ohne Anmeldung geht es nicht weiter
  state.login.open = false;
  $('modal-onboarding').classList.add('hidden');
}

function renderLogin() {
  const { step, testerId } = state.login;
  $('login-cancel').classList.toggle('hidden', !state.me);
  $('login-step-pick').classList.toggle('hidden', step !== 'pick');
  $('login-step-password').classList.toggle('hidden', step !== 'password');

  if (step === 'pick') {
    $('onboarding-user-list').innerHTML = state.testers.map((t) => `
      <button onclick="pickLoginTester('${t.id}')" class="w-full flex items-center justify-between p-3.5 rounded-xl bg-stone-950 border border-stone-800 hover:border-amber-500 hover:bg-stone-800 transition group text-left">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-2xl">${esc(t.avatar || '👤')}</span>
          <div class="min-w-0">
            <div class="font-bold text-white group-hover:text-amber-400 text-sm truncate">${esc(t.name)}${t.id === state.me ? ' <span class="text-[10px] text-amber-400">(angemeldet)</span>' : ''}</div>
            <div class="text-[11px] text-stone-400">${t.has_password ? '🔒 Mit Passwort geschützt' : '✨ Noch frei – Passwort festlegen'}</div>
          </div>
        </div>
        <span class="text-amber-400 text-sm font-bold shrink-0">→</span>
      </button>`).join('') || '<p class="text-xs text-stone-400">Noch niemand da – trag dich unten ein.</p>';
    return;
  }

  const t = testerById(testerId);
  if (!t) { backToPick(); return; }
  const setMode = !t.has_password;
  $('login-avatar').innerText = t.avatar || '👤';
  $('login-name').innerText = t.name;
  $('login-username').value = t.name;
  $('login-hint').innerText = setMode
    ? `Leg ein Passwort für „${t.name}“ fest. Damit kommst nur du wieder unter diesem Namen rein.`
    : `Gib das Passwort für „${t.name}“ ein.`;
  $('login-password').setAttribute('autocomplete', setMode ? 'new-password' : 'current-password');
  $('login-repeat-wrap').classList.toggle('hidden', !setMode);
  $('login-submit').innerText = setMode ? 'Passwort festlegen & loslegen' : 'Anmelden';
  $('login-forgot').classList.toggle('hidden', setMode);
}

function pickLoginTester(id) {
  state.login = { open: true, step: 'password', testerId: id };
  $('login-error').innerText = '';
  $('login-password').value = '';
  $('login-repeat').value = '';
  renderLogin();
  setTimeout(() => $('login-password').focus(), 50);
}

function backToPick() {
  state.login.step = 'pick';
  state.login.testerId = null;
  renderLogin();
}

async function finishLogin(token, label) {
  const old = state.token;
  setToken(token);
  if (old && old !== token) state.store.logout(old).catch(() => {});
  state.login.open = false;
  $('modal-onboarding').classList.add('hidden');
  await reload({ withForm: true });
  showToast(`${label} ${testerById(state.me)?.name ?? ''}!`, '👋');
}

async function submitLogin(e) {
  e.preventDefault();
  const t = testerById(state.login.testerId);
  if (!t) return;
  const pw = $('login-password').value;
  const err = $('login-error');
  const btn = $('login-submit');
  const msg = t.has_password ? (pw ? null : 'Bitte Passwort eingeben.') : validatePassword(pw, $('login-repeat').value);
  if (msg) { err.innerText = msg; return; }
  err.innerText = '';
  btn.disabled = true;
  try {
    const token = t.has_password ? await state.store.login(t.id, pw) : await state.store.setPassword(t.id, pw);
    await finishLogin(token, t.has_password ? 'Willkommen zurück,' : 'Passwort gespeichert – hallo');
  } catch (ex) {
    err.innerText = ex.message;
    if (/schon ein Passwort/.test(ex.message)) await reload(); // jemand war schneller
  } finally {
    btn.disabled = false;
  }
}

async function submitRegister(e) {
  e.preventDefault();
  const err = $('register-error');
  const name = cleanText($('register-name').value, 40);
  const pw = $('register-password').value;
  const msg = validateName(name, state.testers.map((t) => t.name)) || validatePassword(pw);
  if (msg) { err.innerText = msg; return; }
  err.innerText = '';
  const btn = $('register-submit');
  btn.disabled = true;
  try {
    const token = await state.store.register(name, randomAvatar(), pw);
    $('register-name').value = '';
    $('register-password').value = '';
    await finishLogin(token, 'Willkommen,');
  } catch (ex) {
    err.innerText = ex.message;
  } finally {
    btn.disabled = false;
  }
}

async function logoutHere() {
  if (!confirm('Auf diesem Gerät abmelden? Zum Wiederkommen brauchst du dein Passwort.')) return;
  const old = state.token;
  setToken(null);
  closeTesterManagementModal();
  if (old) await state.store.logout(old).catch(() => {});
  state.login = { open: false, step: 'pick', testerId: null };
  await reload({ withForm: true });
}

function updateHeaderIdentity() {
  const user = testerById(state.me);
  $('current-user-name').innerText = user ? user.name : 'Nicht angemeldet';
  $('current-user-avatar').innerText = user ? (user.avatar || '👤') : '🔒';
}

// --- Tabs --------------------------------------------------------------------------

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
  if (tabId === 'matrix') renderMatrix();
  else if (tabId === 'leaderboard') renderLeaderboard();
  else if (tabId === 'manage') renderCheeseManageList();
}

// --- Formular (nur eigene Note) -------------------------------------------------------

function renderTasteVisibility() {
  const has = state.cheeses.length > 0;
  $('taste-main')?.classList.toggle('hidden', !has);
  $('taste-empty')?.classList.toggle('hidden', has);
}

function cheeseStatusIcon(c) {
  if (isRevealed(c)) return '🔓';
  return state.me && hasRated(state.progress, c.id, state.me) ? '✓🔒' : '⏳';
}

function renderCheeseSelect() {
  const select = $('select-cheese');
  if (!select) return;
  const signature = state.cheeses.map((c) => `${c.id}|${c.name}|${c.category}|${cheeseStatusIcon(c)}`).join('§');
  if (signature !== cheeseSelectSignature) {
    select.innerHTML = state.cheeses.map((c) => `
      <option value="${c.id}">${cheeseStatusIcon(c)} ${esc(c.name)}${c.category ? ` (${esc(c.category)})` : ''}</option>`).join('');
    cheeseSelectSignature = signature;
  }
  if (state.cheeseId) select.value = state.cheeseId;
}

function updateCheeseBadge() {
  const c = cheeseById(state.cheeseId);
  const container = $('cheese-badge-desc');
  const card = $('taste-status-card');
  if (!container || !card) return;
  if (!c) { container.innerHTML = ''; card.innerHTML = ''; return; }

  const chips = [];
  if (c.milk) chips.push(`<span class="px-2 py-0.5 rounded bg-stone-800 text-amber-300 font-medium">🥛 ${esc(c.milk)}</span>`);
  if (c.origin) chips.push(`<span class="px-2 py-0.5 rounded bg-stone-800 text-stone-300">🌍 ${esc(c.origin)}</span>`);
  if (c.age) chips.push(`<span class="px-2 py-0.5 rounded bg-stone-800 text-stone-300">⏳ ${esc(c.age)}</span>`);
  if (c.pairing) chips.push(`<span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">🍷 Pairing: ${esc(c.pairing)}</span>`);
  container.innerHTML = chips.join('');

  const prog = progressOf(c.id);
  const mine = ratingScore(myRating(c.id));
  if (isRevealed(c)) {
    const s = cheeseSummary(c.id, state.testers, state.ratings);
    card.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1"><span>🔓</span> Runde aufgedeckt!</span>
        <span class="text-stone-400 font-mono">${prog.count}/${prog.total} Stimmen</span>
      </div>
      <div class="mt-2 flex items-center justify-between">
        <div>
          <div class="text-[10px] uppercase text-stone-500 font-semibold">Deine Note</div>
          <div class="text-xl font-black text-amber-400 font-mono" id="current-total-live">${formatScore(mine)} <span class="text-xs text-stone-500 font-normal">/ 10</span></div>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase text-stone-500 font-semibold">Gruppen-Schnitt</div>
          <div class="text-2xl font-bold text-emerald-400 font-mono">${formatScore(s.total)} <span class="text-xs text-stone-500 font-normal">/ 10</span></div>
        </div>
      </div>`;
  } else {
    card.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1"><span>🔒</span> Blind Tasting</span>
        <span class="text-stone-400 font-mono">${prog.count}/${prog.total} Stimmen</span>
      </div>
      <div class="mt-2 flex items-center justify-between gap-2">
        <div>
          <div class="text-[10px] uppercase text-stone-500 font-semibold">Deine Note</div>
          <div class="text-xl font-black text-amber-400 font-mono" id="current-total-live">${formatScore(mine)} <span class="text-xs text-stone-500 font-normal">/ 10</span></div>
        </div>
        <div class="text-right min-w-0">
          <div class="text-[10px] uppercase text-amber-400 font-semibold">Gruppen-Schnitt</div>
          <div class="text-sm font-bold text-stone-400 font-mono mt-1">🔒 Verborgen</div>
          <div class="text-[10px] text-stone-500 truncate">Warten auf ${esc(prog.missing.join(', ') || '–')}</div>
        </div>
      </div>`;
  }
  updateLiveAverage();
}

function onCheeseChange() {
  state.cheeseId = $('select-cheese').value;
  lsSet(CHEESE_KEY, state.cheeseId);
  updateCheeseBadge();
  loadMyRatingIntoForm();
}

function renderSliders() {
  $('rating-sliders-container').innerHTML = CRITERIA.map((crit) => `
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
        <span>1.0 (flach)</span><span>5.5 (solide)</span><span>10.0 (Götterstoff)</span>
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
  const el = $('current-total-live');
  if (el) el.innerHTML = `${formatScore(ratingScore(ratingFromInputs(readSliderValues())))} <span class="text-xs text-stone-500 font-normal">/ 10</span>`;
}

function loadMyRatingIntoForm() {
  const r = myRating(state.cheeseId);
  for (const c of CRITERIA) {
    const val = r ? r[c.key] : DEFAULT_SCORE;
    const slider = $(`slider-${c.key}`);
    if (slider) slider.value = val;
    const display = $(`val-${c.key}`);
    if (display) display.innerText = Number(val).toFixed(1);
  }
  renderFlavorTags(r ? r.tags || [] : []);
  $('tasting-notes').value = r ? r.note || '' : '';
  $('form-status').innerText = r ? '✓ Du hast schon abgegeben – Speichern überschreibt deine Note.' : '';
  updateLiveAverage();
}

function renderFlavorTags(selected = []) {
  $('flavor-tags').innerHTML = FLAVOR_TAGS.map((tag) => {
    const on = selected.includes(tag);
    return `<button type="button" data-tag="${esc(tag)}" onclick="toggleTag(this)" class="tag-chip px-2.5 py-1 text-xs rounded-lg transition ${
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
    $(`slider-${c.key}`).value = DEFAULT_SCORE;
    $(`val-${c.key}`).innerText = DEFAULT_SCORE.toFixed(1);
  }
  renderFlavorTags([]);
  $('tasting-notes').value = '';
  updateLiveAverage();
  showToast('Formular auf 7.5 Standard gesetzt', '↺');
}

async function saveMyRating() {
  if (state.busy) return;
  if (!state.me) { openLogin(); return; }
  if (!state.cheeseId) { showToast('Bitte zuerst einen Käse anlegen', '🧀'); return; }
  const rating = ratingFromInputs(readSliderValues(), getSelectedTags(), $('tasting-notes').value);
  const btn = $('save-btn');
  state.busy = true;
  btn.disabled = true;
  btn.classList.add('opacity-50');
  try {
    const res = await state.store.saveRating(state.token, state.cheeseId, rating);
    await reload({ withForm: true });
    if (res?.revealed_now) showToast('🎉 Letzte Stimme da! Runde für alle aufgedeckt!', '🔓');
    else showToast(`Deine Note ${formatScore(ratingScore(rating))} ist gesichert!`, '💾');
  } catch (e) {
    showToast(e.message, '⚠️');
    if (/neu anmelden/.test(e.message)) { setToken(null); await reload(); }
  } finally {
    state.busy = false;
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

// --- Blind-Matrix ---------------------------------------------------------------------

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
        <th class="py-2.5 px-3 text-center">Runden-Status</th>
        ${state.testers.map((t) => {
          const isMe = t.id === state.me;
          return `<th class="py-2.5 px-3 text-center whitespace-nowrap ${isMe ? 'text-amber-400 font-bold' : ''}">${esc(t.avatar || '👤')} ${esc(t.name)}${isMe ? ' (Du)' : ''}</th>`;
        }).join('')}
        <th class="py-2.5 px-3 text-right rounded-r-lg">Schnitt</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-stone-800/50">`;

  for (const c of state.cheeses) {
    const prog = progressOf(c.id);
    const revealed = isRevealed(c);
    const sum = cheeseSummary(c.id, state.testers, state.ratings);
    html += `
      <tr class="hover:bg-stone-900/40 transition">
        <td class="py-3 px-3 font-semibold text-white cursor-pointer" onclick="jumpToCheese('${c.id}')">
          <div class="hover:text-amber-400 transition">${esc(c.name)}</div>
          ${c.category ? `<div class="text-[10px] text-stone-400">${esc(c.category)}</div>` : ''}
        </td>
        <td class="py-3 px-3 text-center">${revealed
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1 mx-auto w-fit whitespace-nowrap"><span>🔓</span> Aufgedeckt</span>'
          : `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1 mx-auto w-fit whitespace-nowrap"><span>🔒</span> ${prog.count}/${prog.total} Stimmen</span>`}</td>`;

    for (const t of state.testers) {
      const isMe = t.id === state.me;
      const rated = hasRated(state.progress, c.id, t.id);
      const score = ratingScore(findRating(state.ratings, c.id, t.id));
      let cell;
      if (isMe) {
        cell = score !== null
          ? `<button onclick="jumpToCheese('${c.id}')" title="Deine Note ändern" class="px-2.5 py-1 rounded-lg font-mono text-xs font-bold bg-amber-500 text-stone-950 hover:bg-amber-400 transition shadow whitespace-nowrap">${formatScore(score)} ✏️</button>`
          : `<button onclick="jumpToCheese('${c.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-stone-800 hover:bg-stone-700 text-amber-400 border border-amber-500/30 transition whitespace-nowrap">+ Jetzt bewerten</button>`;
      } else if (revealed && score !== null) {
        cell = `<span class="font-mono text-xs font-bold text-stone-200">${formatScore(score)}</span>`;
      } else if (rated) {
        cell = '<span class="px-2 py-1 rounded-lg text-[11px] font-semibold bg-stone-900 border border-stone-800 text-stone-400 flex items-center justify-center gap-1 mx-auto w-fit" title="Note abgegeben, wird nach allen Stimmen aufgedeckt"><span>✓</span><span>🔒</span></span>';
      } else {
        cell = `<span class="text-stone-600 text-xs whitespace-nowrap">${revealed ? '–' : '⏳ Ausstehend'}</span>`;
      }
      html += `<td class="py-3 px-3 text-center">${cell}</td>`;
    }

    html += `
        <td class="py-3 px-3 text-right font-mono font-bold">${revealed
          ? `<span class="text-emerald-400 text-base">${formatScore(sum.total)}</span><span class="text-[10px] text-stone-500 block">/ 10</span>`
          : '<span class="text-stone-500 text-xs italic whitespace-nowrap">🔒 Verborgen</span>'}</td>
      </tr>`;
  }
  table.innerHTML = `${html}</tbody>`;
}

function jumpToCheese(cheeseId) {
  state.cheeseId = cheeseId;
  lsSet(CHEESE_KEY, cheeseId);
  renderCheeseSelect();
  updateCheeseBadge();
  loadMyRatingIntoForm();
  switchTab('taste');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Rangliste & Awards (nur aufgedeckte Käse) ------------------------------------------

function renderLeaderboard() {
  const board = revealedBoard(state.cheeses, state.testers, state.ratings).filter((i) => i.summary.count > 0);
  const open = state.cheeses.filter((c) => !isRevealed(c));
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const podiumEl = $('podium-view');
  if (podiumEl) {
    podiumEl.innerHTML = board.length === 0
      ? `<div class="text-center py-6 text-stone-500 text-xs border border-dashed border-stone-800 rounded-xl p-4">
           🔒 Noch keine Käsesorte von allen Testern bewertet.<br>Sobald die erste Runde komplett ist, erscheint hier das Podium!
         </div>`
      : board.slice(0, 3).map((item, idx) => `
        <div class="flex items-center justify-between p-3 rounded-xl ${idx === 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-stone-900/60 border border-stone-800'}">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-2xl">${medals[item.rank] || '🏅'}</span>
            <div class="min-w-0">
              <div class="font-bold text-white text-sm truncate">${esc(item.cheese.name)}</div>
              <div class="text-[11px] text-stone-400">${esc(item.cheese.category || 'Käse')} • ${item.summary.count} Stimmen</div>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xl font-mono font-black text-amber-400">${formatScore(item.summary.total)}</span>
            <span class="text-[10px] text-stone-500 block">/ 10</span>
          </div>
        </div>`).join('');
  }

  const tbody = $('leaderboard-tbody');
  if (tbody) {
    const rows = board.map((item) => {
      const s = item.summary;
      const badge = medals[item.rank] ? `${medals[item.rank]} ${item.rank}.` : `${item.rank}.`;
      const sub = [item.cheese.milk, item.cheese.origin].filter(Boolean).map(esc).join(' | ');
      return `
        <tr class="hover:bg-stone-900/50 transition">
          <td class="py-3 px-3 font-bold font-mono whitespace-nowrap ${item.rank <= 3 ? 'text-amber-400' : 'text-stone-500'}">${badge}</td>
          <td class="py-3 px-3"><div class="font-bold text-white">${esc(item.cheese.name)}</div>${sub ? `<div class="text-[11px] text-stone-400">${sub}</div>` : ''}</td>
          <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold whitespace-nowrap">🔓 Offiziell</span></td>
          <td class="py-3 px-3 text-center font-mono text-stone-300">${formatScore(s.avg.aroma)}</td>
          <td class="py-3 px-3 text-center font-mono text-stone-300">${formatScore(s.avg.taste)}</td>
          <td class="py-3 px-3 text-right">
            <span class="font-mono font-bold text-base ${s.total >= 8.5 ? 'text-amber-400' : 'text-stone-200'}">${formatScore(s.total)}</span>
            <span class="text-[10px] text-stone-400 block whitespace-nowrap">${s.count} Votings</span>
          </td>
        </tr>`;
    }).concat(open.map((c) => {
      const p = progressOf(c.id);
      const sub = [c.milk, c.origin].filter(Boolean).map(esc).join(' | ');
      return `
        <tr class="hover:bg-stone-900/50 transition">
          <td class="py-3 px-3 font-bold font-mono text-stone-500">⏳</td>
          <td class="py-3 px-3"><div class="font-bold text-white">${esc(c.name)}</div>${sub ? `<div class="text-[11px] text-stone-400">${sub}</div>` : ''}</td>
          <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[11px] font-semibold whitespace-nowrap">🔒 ${p.count}/${p.total} Stimmen</span></td>
          <td class="py-3 px-3 text-center font-mono text-stone-300">🔒</td>
          <td class="py-3 px-3 text-center font-mono text-stone-300">🔒</td>
          <td class="py-3 px-3 text-right"><span class="text-stone-500 text-xs italic">Wartet auf ${esc(p.missing.join(', ') || '–')}</span></td>
        </tr>`;
    }));
    tbody.innerHTML = rows.join('') || '<tr><td colspan="6" class="py-6 text-center text-xs text-stone-500">Noch kein Käse angelegt.</td></tr>';
  }

  const countEl = $('total-ratings-count');
  if (countEl) countEl.innerText = `${board.length} von ${state.cheeses.length} Runden aufgedeckt`;

  renderAwards(board);
  if (state.tab === 'leaderboard') renderRadar(board);
}

function renderAwards(board) {
  const container = $('awards-container');
  if (!container) return;
  const a = awards(board);
  if (!a) {
    container.innerHTML = '<div class="col-span-full text-xs text-stone-500 text-center py-4 bg-stone-950/40 rounded-xl border border-stone-800">Awards werden vergeben, sobald mindestens eine Runde komplett aufgedeckt wurde.</div>';
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

function renderRadar(board) {
  const canvas = $('radarChart');
  if (!canvas || typeof window.Chart === 'undefined') return;
  const d = radarData(board);
  if (radarChartInstance) radarChartInstance.destroy();
  radarChartInstance = new window.Chart(canvas, {
    type: 'radar',
    data: {
      labels: d.labels,
      datasets: [
        {
          label: d.topName ? `🥇 ${d.topName}` : 'Sieger (Warten auf Reveal)',
          data: d.top || [0, 0, 0, 0, 0],
          backgroundColor: 'rgba(245, 158, 11, 0.25)', borderColor: '#f59e0b', borderWidth: 2,
          pointBackgroundColor: '#f59e0b', pointRadius: 3,
        },
        {
          label: 'Schnitt aller aufgedeckten',
          data: d.overall || [0, 0, 0, 0, 0],
          backgroundColor: 'rgba(120, 113, 108, 0.2)', borderColor: '#78716c', borderWidth: 1.5,
          borderDash: [4, 4], pointBackgroundColor: '#78716c', pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        r: {
          min: 0, max: 10, ticks: { stepSize: 2, display: false },
          grid: { color: 'rgba(255, 255, 255, 0.08)' }, angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: { color: '#a8a29e', font: { size: 10, family: 'Plus Jakarta Sans' } },
        },
      },
      plugins: { legend: { position: 'bottom', labels: { color: '#e7e5e4', font: { size: 10 }, boxWidth: 12 } } },
    },
  });
}

// --- Käse verwalten -------------------------------------------------------------------

function renderCheeseManageList() {
  const container = $('cheese-manage-list');
  if (!container) return;
  container.innerHTML = state.cheeses.map((c) => `
    <div class="bg-stone-900/70 border border-stone-800 rounded-xl p-3.5 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2 mb-1">
          <h4 class="font-bold text-white text-sm truncate">${cheeseStatusIcon(c)} ${esc(c.name)}</h4>
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

function openCheeseModal(cheeseId = null) {
  const form = $('cheese-form');
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
  $('modal-cheese').classList.remove('hidden');
}

function closeCheeseModal() {
  $('modal-cheese').classList.add('hidden');
}

async function handleCheeseSubmit(e) {
  e.preventDefault();
  const name = cleanText($('input-cheese-name').value, 80);
  if (!name) { $('cheese-error').innerText = 'Bitte einen Namen eingeben.'; return; }
  const id = $('edit-cheese-id').value;
  const btn = $('cheese-submit');
  btn.disabled = true;
  try {
    const saved = await state.store.saveCheese({
      id: id || null,
      name,
      category: $('input-cheese-category').value,
      milk: $('input-cheese-milk').value,
      origin: cleanText($('input-cheese-origin').value, 80),
      age: cleanText($('input-cheese-age').value, 80),
      pairing: cleanText($('input-cheese-pairing').value, 200),
    });
    if (!id) { state.cheeseId = saved.id; lsSet(CHEESE_KEY, saved.id); }
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
  if (!c || !confirm(`„${c.name}“ wirklich löschen? Alle Noten dafür werden für alle gelöscht.`)) return;
  try {
    await state.store.deleteCheese(cheeseId);
    await reload();
    showToast('Käse gelöscht', '🗑️');
  } catch (e) { showToast(e.message, '⚠️'); }
}

// --- Tester verwalten -------------------------------------------------------------------

function openTesterManagementModal() {
  renderTesterModalList();
  $('tester-error').innerText = '';
  $('modal-tester').classList.remove('hidden');
}

function closeTesterManagementModal() {
  $('modal-tester').classList.add('hidden');
}

function renderTesterModalList() {
  $('tester-modal-list').innerHTML = state.testers.map((t) => {
    const isMe = t.id === state.me;
    return `
      <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-950 border border-stone-800">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base">${esc(t.avatar || '👤')}</span>
          <span class="font-bold text-white text-sm truncate">${esc(t.name)}</span>
          ${isMe ? '<span class="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-stone-950 font-bold">Du</span>' : ''}
          <span class="text-[10px] text-stone-500 shrink-0">${t.has_password ? '🔒' : 'ohne Passwort'}</span>
        </div>
        ${canRemoveTester(t, state.me)
          ? `<button onclick="removeTester('${t.id}')" class="shrink-0 px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/60 rounded transition">Löschen</button>`
          : ''}
      </div>`;
  }).join('');
}

async function addNewTester() {
  const input = $('new-tester-input');
  const err = $('tester-error');
  const name = cleanText(input.value, 40);
  const msg = validateName(name, state.testers.map((t) => t.name));
  if (msg) { err.innerText = msg; return; }
  err.innerText = '';
  try {
    await state.store.addTester(state.token, name, randomAvatar());
    input.value = '';
    await reload();
    renderTesterModalList();
    showToast(`${name} hinzugefügt – legt beim ersten Öffnen ein Passwort fest.`);
  } catch (e) { err.innerText = e.message; }
}

async function removeTester(testerId) {
  const t = testerById(testerId);
  if (!t) return;
  const self = t.id === state.me;
  const text = self
    ? 'Dich selbst wirklich löschen? Alle deine Noten werden gelöscht und du wirst abgemeldet.'
    : `„${t.name}“ wirklich entfernen? Alle Noten von ${t.name} werden gelöscht.`;
  if (!confirm(text)) return;
  try {
    await state.store.removeTester(state.token, testerId);
    if (self) { setToken(null); closeTesterManagementModal(); }
    await reload({ withForm: true });
    if (!self) renderTesterModalList();
    showToast('Tester entfernt');
  } catch (e) { $('tester-error').innerText = e.message; }
}

// --- Export & Teilen -------------------------------------------------------------------

function shareResultsWhatsApp() {
  const text = buildRevealShareText(state.cheeses, state.testers, state.ratings, state.progress);
  const fallback = () => prompt('Hier der Text zum Kopieren:', text);
  if (!navigator.clipboard) { fallback(); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('Rangliste kopiert! Bereit für WhatsApp.', '📋'))
    .catch(fallback);
}

function exportJSON() {
  const data = {
    exportiert: new Date().toISOString(),
    hinweis: 'Enthält nur, was du sehen darfst (eigene + aufgedeckte Noten).',
    testers: state.testers.map(({ id, name, avatar }) => ({ id, name, avatar })),
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

// --- Für onclick-Attribute im HTML freigeben ----------------------------------------------

Object.assign(window, {
  switchTab, promptSwitchUser, closeLogin, pickLoginTester, backToPick, submitLogin, submitRegister,
  logoutHere, onCheeseChange, stepSlider, onSliderInput, toggleTag, resetCurrentFormToDefault,
  saveMyRating, jumpToCheese, openCheeseModal, closeCheeseModal, handleCheeseSubmit, deleteCheese,
  openTesterManagementModal, closeTesterManagementModal, addNewTester, removeTester,
  shareResultsWhatsApp, exportJSON,
});

// --- Start ----------------------------------------------------------------------------------

async function start() {
  renderSliders();
  renderFlavorTags([]);
  $('new-tester-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addNewTester(); });
  try {
    state.store = await createStore();
  } catch (e) {
    state.error = e.message.includes('config.js') ? e.message : 'Die App konnte keine Verbindung aufbauen. Bitte Internet prüfen und neu laden.';
    renderStatus();
    return;
  }
  await reload({ withForm: true });
  state.store.subscribe(reloadSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
  setInterval(() => { if (!document.hidden) reload(); }, 15000);
}

start();
