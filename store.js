/**
 * Datenspeicher: Supabase (gemeinsam für alle) oder Demo (nur dieses Gerät).
 * Beide bieten dieselben Funktionen – die Oberfläche merkt keinen Unterschied.
 */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { CRITERIA } from './logic.js';

export const isConfigured =
  /^https:\/\/.+/.test(String(SUPABASE_URL).trim()) &&
  !!SUPABASE_KEY && !String(SUPABASE_KEY).startsWith('HIER_');

export async function createStore() {
  return isConfigured ? createSupabaseStore() : createDemoStore();
}

/** Zahlen aus der Datenbank sicher als JS-Zahlen. */
export function normalizeRating(row) {
  const out = { ...row, tags: Array.isArray(row.tags) ? row.tags : [], note: row.note ?? '' };
  for (const c of CRITERIA) out[c.key] = Number(row[c.key]);
  return out;
}

const CHEESE_FIELDS = ['name', 'category', 'milk', 'origin', 'age', 'pairing'];
function cheeseRow(cheese) {
  const row = {};
  for (const f of CHEESE_FIELDS) row[f] = cheese[f] ?? '';
  return row;
}
function ratingRow(r) {
  const row = { tags: r.tags ?? [], note: r.note ?? '' };
  for (const c of CRITERIA) row[c.key] = r[c.key];
  return row;
}

// ── Supabase ───────────────────────────────────────────────────

const TABLES = { testers: 'ka_testers', cheeses: 'ka_cheeses', ratings: 'ka_ratings' };

async function createSupabaseStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const db = createClient(String(SUPABASE_URL).trim().replace(/\/+$/, ''), String(SUPABASE_KEY).trim(), {
    auth: { persistSession: false },
  });

  const check = ({ data, error }) => {
    if (error) throw translateError(error);
    return data;
  };

  return {
    mode: 'online',
    async loadAll() {
      const [testers, cheeses, ratings] = await Promise.all([
        db.from(TABLES.testers).select('*').order('created_at'),
        db.from(TABLES.cheeses).select('*').order('created_at'),
        db.from(TABLES.ratings).select('*'),
      ]);
      return {
        testers: check(testers),
        cheeses: check(cheeses),
        ratings: check(ratings).map(normalizeRating),
      };
    },
    async addTester({ name, avatar }) {
      return check(await db.from(TABLES.testers).insert({ name, avatar }).select().single());
    },
    async deleteTester(id) {
      check(await db.from(TABLES.testers).delete().eq('id', id));
    },
    async saveCheese(cheese) {
      const row = cheeseRow(cheese);
      if (cheese.id) return check(await db.from(TABLES.cheeses).update(row).eq('id', cheese.id).select().single());
      return check(await db.from(TABLES.cheeses).insert(row).select().single());
    },
    async deleteCheese(id) {
      check(await db.from(TABLES.cheeses).delete().eq('id', id));
    },
    async saveRating(cheese_id, tester_id, rating) {
      const row = { cheese_id, tester_id, ...ratingRow(rating), updated_at: new Date().toISOString() };
      return normalizeRating(check(
        await db.from(TABLES.ratings).upsert(row, { onConflict: 'cheese_id,tester_id' }).select().single(),
      ));
    },
    subscribe(onChange) {
      const channel = db.channel('kaeseabend-v2');
      for (const table of Object.values(TABLES)) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
      }
      channel.subscribe();
      return () => db.removeChannel(channel);
    },
  };
}

function translateError(error) {
  const msg = `${error.message || ''} ${error.code || ''}`;
  if (error.code === '23505') return new Error('Den Namen gibt es schon.');
  if (error.code === '23514') return new Error('Ungültiger Wert – bitte Eingaben prüfen.');
  if (error.code === '23503') return new Error('Dieser Eintrag wurde inzwischen gelöscht. Bitte neu laden.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Keine Verbindung. Bitte Internet prüfen.');
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) {
    return new Error('Die Datenbank ist noch nicht eingerichtet: setup.sql in Supabase ausführen.');
  }
  if (/Invalid API key|JWT|apikey|401/i.test(msg)) return new Error('Der Supabase-Schlüssel in config.js stimmt nicht.');
  if (/permission denied|row-level security|42501/i.test(msg)) {
    return new Error('Keine Berechtigung – bitte setup.sql in Supabase noch einmal ausführen.');
  }
  return new Error(error.message || 'Unbekannter Fehler.');
}

// ── Demo (nur dieses Gerät, mit Beispieldaten) ─────────────────

const DEMO_KEY = 'ka-demo-v2';

function demoSeed() {
  const now = new Date().toISOString();
  const testers = [
    { id: 't1', name: 'Yannick', avatar: '🍷', created_at: now },
    { id: 't2', name: 'Hannes', avatar: '🥖', created_at: now },
    { id: 't3', name: 'Ole', avatar: '🧀', created_at: now },
  ];
  const cheeses = [
    { id: 'c1', name: 'Comté Réserve (AOP)', category: 'Hartkäse', milk: 'Kuh (Rohmilch)', origin: 'Franche-Comté, Frankreich', age: '18 Monate', pairing: 'Walnüsse, gelber Jura-Wein, Birne' },
    { id: 'c2', name: 'Brie de Meaux (AOP)', category: 'Weichkäse mit Weißschimmel', milk: 'Kuh (Rohmilch)', origin: 'Île-de-France, Frankreich', age: '6 Wochen', pairing: 'Frisches Baguette, Champagner, Feigensenf' },
    { id: 'c3', name: 'Roquefort (AOP)', category: 'Blauschimmelkäse', milk: 'Schafmilch', origin: 'Aveyron, Frankreich', age: '4 Monate Höhlenreifung', pairing: 'Sauternes/Dessertwein, Honig, Roggenbrot' },
    { id: 'c4', name: 'Sainte-Maure de Touraine', category: 'Ziegenkäse', milk: 'Ziegenmilch', origin: 'Loiretal, Frankreich', age: '3 Wochen', pairing: 'Sauvignon Blanc, Feigen, Rosmarincracker' },
    { id: 'c5', name: 'Pecorino Romano (DOP)', category: 'Hartkäse', milk: 'Schafmilch', origin: 'Latium / Sardinien, Italien', age: '12 Monate', pairing: 'Akazienhonig, kräftiger Chianti' },
  ].map((c) => ({ ...c, created_at: now }));
  const R = (cheese_id, tester_id, optics, aroma, texture, taste, finish, tags, note) =>
    ({ id: `${cheese_id}_${tester_id}`, cheese_id, tester_id, optics, aroma, texture, taste, finish, tags, note, updated_at: now });
  const ratings = [
    R('c1', 't1', 9.0, 9.0, 8.5, 9.5, 9.0, ['Nussig', 'Salzkristalle'], 'Absoluter Favorit, fantastische Reife!'),
    R('c1', 't2', 8.5, 8.5, 9.0, 9.0, 8.5, ['Buttrig', 'Nussig'], 'Sehr ausgewogen und buttrig.'),
    R('c1', 't3', 9.0, 9.5, 9.0, 9.5, 9.5, ['Salzkristalle', 'Fruchtig'], 'Top Salzkristalle!'),
    R('c2', 't1', 8.0, 8.5, 9.0, 8.5, 8.0, ['Cremig', 'Pilzig/Wald'], 'Perfekter Reifezustand am Kern.'),
    R('c2', 't2', 8.5, 8.0, 9.5, 8.0, 7.5, ['Cremig', 'Schmelzend'], 'Schmilzt sofort am Gaumen.'),
    R('c2', 't3', 7.5, 8.5, 8.5, 8.0, 8.0, ['Pilzig/Wald'], 'Klassischer Champignon-Ton.'),
    R('c3', 't1', 8.5, 9.0, 8.5, 8.5, 9.0, ['Pikant', 'Animalisch'], 'Sehr kraftvoll.'),
    R('c3', 't2', 9.0, 9.5, 9.0, 9.5, 9.5, ['Würzig', 'Pikant'], 'Genialer Blauschimmel!'),
    R('c3', 't3', 7.0, 8.5, 7.5, 6.5, 7.0, ['Würzig'], 'Etwas zu scharf und salzig für mich.'),
    R('c4', 't1', 8.0, 7.5, 8.0, 7.5, 7.0, ['Milchfrisch'], 'Frisch, dezent zickig.'),
    R('c4', 't2', 7.5, 8.0, 7.5, 7.5, 7.5, ['Heu/Kräuter'], 'Angenehme Säure.'),
    R('c4', 't3', 8.5, 8.0, 8.0, 8.0, 7.5, ['Milchfrisch', 'Heu/Kräuter'], 'Feiner Aschemantel.'),
    R('c5', 't1', 8.0, 8.5, 8.0, 8.5, 8.0, ['Würzig', 'Salzkristalle'], 'Sehr kernig.'),
    R('c5', 't2', 8.0, 8.0, 8.0, 8.0, 8.0, ['Pikant'], 'Guter Allrounder.'),
    R('c5', 't3', 8.5, 8.5, 8.5, 8.5, 8.5, ['Würzig'], 'Kräftig im Schafmilcharoma.'),
  ];
  return { testers, cheeses, ratings };
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDemoStore() {
  let memory = null; // falls localStorage gesperrt ist (privates Fenster)
  const read = () => {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignorieren */ }
    if (memory) return structuredClone(memory);
    const seed = demoSeed();
    write(seed);
    return seed;
  };
  const write = (data) => {
    memory = structuredClone(data);
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
  };
  let listeners = [];
  const changed = (data) => { write(data); listeners.forEach((fn) => fn()); };

  return {
    mode: 'demo',
    async loadAll() { return structuredClone(read()); },
    async addTester({ name, avatar }) {
      const data = read();
      if (data.testers.some((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase())) {
        throw new Error('Den Namen gibt es schon.');
      }
      const t = { id: uid(), name, avatar, created_at: new Date().toISOString() };
      data.testers.push(t);
      changed(data);
      return t;
    },
    async deleteTester(id) {
      const data = read();
      data.testers = data.testers.filter((t) => t.id !== id);
      data.ratings = data.ratings.filter((r) => r.tester_id !== id);
      changed(data);
    },
    async saveCheese(cheese) {
      const data = read();
      const row = { ...cheeseRow(cheese), id: cheese.id || uid() };
      const idx = data.cheeses.findIndex((c) => c.id === row.id);
      if (idx >= 0) data.cheeses[idx] = { ...data.cheeses[idx], ...row };
      else data.cheeses.push({ ...row, created_at: new Date().toISOString() });
      changed(data);
      return row;
    },
    async deleteCheese(id) {
      const data = read();
      data.cheeses = data.cheeses.filter((c) => c.id !== id);
      data.ratings = data.ratings.filter((r) => r.cheese_id !== id);
      changed(data);
    },
    async saveRating(cheese_id, tester_id, rating) {
      const data = read();
      const old = data.ratings.find((r) => r.cheese_id === cheese_id && r.tester_id === tester_id);
      const row = { id: old?.id ?? uid(), cheese_id, tester_id, ...ratingRow(rating), updated_at: new Date().toISOString() };
      data.ratings = data.ratings.filter((r) => r !== old).concat(row);
      changed(data);
      return row;
    },
    async resetDemo() { changed(demoSeed()); },
    subscribe(onChange) {
      listeners.push(onChange);
      const onStorage = (e) => { if (e.key === DEMO_KEY) onChange(); };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners = listeners.filter((f) => f !== onChange);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}
