/**
 * Datenspeicher über Supabase. Tester, Noten und Anmeldung laufen über
 * Datenbank-Funktionen, die Passwort und Blindverkostung serverseitig prüfen.
 */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { CRITERIA } from './logic.js';

export const isConfigured =
  /^https:\/\/.+/.test(String(SUPABASE_URL).trim()) &&
  !!SUPABASE_KEY && !String(SUPABASE_KEY).startsWith('HIER_');

export function normalizeRating(row) {
  const out = { ...row, tags: Array.isArray(row.tags) ? row.tags : [], note: row.note ?? '' };
  for (const c of CRITERIA) out[c.key] = Number(row[c.key]);
  return out;
}

const CHEESE_FIELDS = ['name', 'category', 'milk', 'origin', 'age', 'pairing'];

export async function createStore() {
  if (!isConfigured) throw new Error('In config.js fehlen die Supabase-Werte.');
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const db = createClient(String(SUPABASE_URL).trim().replace(/\/+$/, ''), String(SUPABASE_KEY).trim(), {
    auth: { persistSession: false },
  });

  const check = ({ data, error }) => {
    if (error) throw translateError(error);
    return data;
  };
  const rpc = async (fn, args) => check(await db.rpc(fn, args));

  return {
    async loadAll(token) {
      const s = await rpc('ka_state', { p_token: token || null });
      return {
        me: s.me,
        testers: s.testers || [],
        cheeses: s.cheeses || [],
        progress: s.progress || [],
        ratings: (s.ratings || []).map(normalizeRating),
      };
    },
    login: (testerId, password) => rpc('ka_login', { p_tester_id: testerId, p_password: password }),
    setPassword: (testerId, password) => rpc('ka_set_password', { p_tester_id: testerId, p_password: password }),
    register: (name, avatar, password) => rpc('ka_register', { p_name: name, p_avatar: avatar, p_password: password }),
    logout: (token) => rpc('ka_logout', { p_token: token }),
    addTester: (token, name, avatar) => rpc('ka_add_tester', { p_token: token, p_name: name, p_avatar: avatar }),
    removeTester: (token, testerId) => rpc('ka_remove_tester', { p_token: token, p_tester_id: testerId }),
    saveRating(token, cheeseId, r) {
      return rpc('ka_save_rating', {
        p_token: token, p_cheese_id: cheeseId,
        p_optics: r.optics, p_aroma: r.aroma, p_texture: r.texture, p_taste: r.taste, p_finish: r.finish,
        p_tags: r.tags ?? [], p_note: r.note ?? '',
      });
    },
    async saveCheese(cheese) {
      const row = {};
      for (const f of CHEESE_FIELDS) row[f] = cheese[f] ?? '';
      if (cheese.id) return check(await db.from('ka_cheeses').update(row).eq('id', cheese.id).select().single());
      return check(await db.from('ka_cheeses').insert(row).select().single());
    },
    async deleteCheese(id) {
      check(await db.from('ka_cheeses').delete().eq('id', id));
    },
    subscribe(onChange) {
      const channel = db.channel('kaeseabend-v3');
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'ka_ping' }, onChange);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'ka_cheeses' }, onChange);
      channel.subscribe();
      return () => db.removeChannel(channel);
    },
  };
}

function translateError(error) {
  const msg = `${error.message || ''} ${error.code || ''}`;
  if (error.code === 'P0001') return new Error(error.message); // eigene, deutsche Meldungen aus der Datenbank
  if (error.code === '23505') return new Error('Den Namen gibt es schon.');
  if (error.code === '23514') return new Error('Ungültiger Wert – bitte Eingaben prüfen.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Keine Verbindung. Bitte Internet prüfen.');
  if (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(msg)) {
    return new Error('Die Datenbank ist noch nicht auf dem neuen Stand: setup.sql in Supabase ausführen.');
  }
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) {
    return new Error('Die Datenbank ist noch nicht eingerichtet: setup.sql in Supabase ausführen.');
  }
  if (/Invalid API key|JWT|apikey|401/i.test(msg)) return new Error('Der Supabase-Schlüssel in config.js stimmt nicht.');
  if (/permission denied|row-level security|42501/i.test(msg)) {
    return new Error('Keine Berechtigung – bitte setup.sql in Supabase noch einmal ausführen.');
  }
  return new Error(error.message || 'Unbekannter Fehler.');
}
