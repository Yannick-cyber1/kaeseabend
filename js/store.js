// Datenspeicher: Supabase (gemeinsam für alle) oder Demo (nur dieses Gerät).
// Beide haben dieselben Funktionen, die Oberfläche merkt keinen Unterschied.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const isConfigured =
  /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_KEY && !SUPABASE_KEY.startsWith('HIER_');

export async function createStore() {
  return isConfigured ? createSupabaseStore() : createDemoStore();
}

// ── Supabase ───────────────────────────────────────────────────

async function createSupabaseStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const db = createClient(SUPABASE_URL.trim().replace(/\/+$/, ''), SUPABASE_KEY.trim(), {
    auth: { persistSession: false },
  });

  const check = ({ data, error }) => {
    if (error) throw translateError(error);
    return data;
  };

  return {
    mode: 'online',
    async loadAll() {
      const [players, cheeses, ratings] = await Promise.all([
        db.from('players').select('id,name,created_at').order('created_at'),
        db.from('cheeses').select('id,name,origin,created_by,created_at').order('created_at'),
        db.from('ratings').select('id,cheese_id,player_id,geruch,textur,geschmack,abgang,updated_at'),
      ]);
      return { players: check(players), cheeses: check(cheeses), ratings: check(ratings) };
    },
    async addPlayer(name) {
      return check(await db.from('players').insert({ name }).select().single());
    },
    async addCheese({ name, origin, created_by }) {
      return check(await db.from('cheeses').insert({ name, origin: origin || null, created_by }).select().single());
    },
    async deleteCheese(id) {
      check(await db.from('cheeses').delete().eq('id', id));
    },
    async saveRating(cheese_id, player_id, scores) {
      return check(
        await db
          .from('ratings')
          .upsert({ cheese_id, player_id, ...scores, updated_at: new Date().toISOString() }, { onConflict: 'cheese_id,player_id' })
          .select()
          .single(),
      );
    },
    subscribe(onChange) {
      const channel = db.channel('kaeseabend');
      for (const table of ['players', 'cheeses', 'ratings']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
      }
      channel.subscribe();
      return () => db.removeChannel(channel);
    },
  };
}

function translateError(error) {
  const msg = `${error.message || ''} ${error.code || ''}`;
  if (error.code === '23505') return new Error('Das gibt es schon.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Keine Verbindung. Bitte Internet prüfen.');
  if (error.code === '42P01' || /does not exist|schema cache/i.test(msg)) {
    return new Error('Die Datenbank ist noch nicht eingerichtet (setup.sql ausführen).');
  }
  if (/Invalid API key|JWT|apikey|401/i.test(msg)) return new Error('Der Supabase-Schlüssel in config.js stimmt nicht.');
  if (/permission denied|row-level security/i.test(msg)) {
    return new Error('Keine Berechtigung – bitte setup.sql noch einmal ausführen.');
  }
  return new Error(error.message || 'Unbekannter Fehler.');
}

// ── Demo (localStorage) ────────────────────────────────────────

const DEMO_KEY = 'kaeseabend-demo-v1';

function uid() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function demoSeed() {
  const now = new Date().toISOString();
  return {
    players: ['Yannick', 'Ole', 'Hannes'].map((name) => ({ id: uid(), name, created_at: now })),
    cheeses: [],
    ratings: [],
  };
}

function createDemoStore() {
  const read = () => {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignorieren */ }
    const seed = demoSeed();
    write(seed);
    return seed;
  };
  const write = (data) => {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
  };
  let listeners = [];
  const notify = () => listeners.forEach((fn) => fn());

  return {
    mode: 'demo',
    async loadAll() {
      return structuredClone(read());
    },
    async addPlayer(name) {
      const data = read();
      const p = { id: uid(), name, created_at: new Date().toISOString() };
      data.players.push(p);
      write(data); notify();
      return p;
    },
    async addCheese({ name, origin, created_by }) {
      const data = read();
      const c = { id: uid(), name, origin: origin || null, created_by, created_at: new Date().toISOString() };
      data.cheeses.push(c);
      write(data); notify();
      return c;
    },
    async deleteCheese(id) {
      const data = read();
      data.cheeses = data.cheeses.filter((c) => c.id !== id);
      data.ratings = data.ratings.filter((r) => r.cheese_id !== id);
      write(data); notify();
    },
    async saveRating(cheese_id, player_id, scores) {
      const data = read();
      const existing = data.ratings.find((r) => r.cheese_id === cheese_id && r.player_id === player_id);
      const row = { ...(existing ?? { id: uid(), cheese_id, player_id }), ...scores, updated_at: new Date().toISOString() };
      data.ratings = data.ratings.filter((r) => r !== existing).concat(row);
      write(data); notify();
      return row;
    },
    subscribe(onChange) {
      listeners.push(onChange);
      const onStorage = (e) => { if (e.key === DEMO_KEY) onChange(); };
      window.addEventListener('storage', onStorage); // andere Tabs
      return () => {
        listeners = listeners.filter((f) => f !== onChange);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}
