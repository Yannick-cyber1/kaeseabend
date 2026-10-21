import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, isValidScore, raterAverage, cheeseScore, categoryAverages,
  groupRanking, playerRanking, formatScore, validateName, cleanName,
  scoresFromForm, ratingProgress,
} from '../js/logic.js';

const r = (cheese_id, player_id, geruch, textur, geschmack, abgang) =>
  ({ cheese_id, player_id, geruch, textur, geschmack, abgang });

const cheeses = [
  { id: 'c1', name: 'Comté' },
  { id: 'c2', name: 'Brie' },
  { id: 'c3', name: 'Appenzeller' },
  { id: 'c4', name: 'Gouda' },
];

test('es gibt genau 4 Kategorien, ohne Aussehen', () => {
  assert.equal(CATEGORIES.length, 4);
  assert.deepEqual(CATEGORIES.map((c) => c.label), ['Geruch', 'Textur', 'Geschmack', 'Abgang']);
});

test('isValidScore akzeptiert nur ganze Zahlen 1–10', () => {
  for (let i = 1; i <= 10; i++) assert.ok(isValidScore(i));
  for (const v of [0, 11, 5.5, '5', null, undefined, NaN]) assert.equal(isValidScore(v), false);
});

test('raterAverage = Mittel der 4 Kategorien', () => {
  assert.equal(raterAverage(r('c1', 'p1', 8, 6, 9, 7)), 7.5);
  assert.equal(raterAverage(r('c1', 'p1', 10, 10, 10, 10)), 10);
});

test('raterAverage ist null bei unvollständiger Bewertung', () => {
  assert.equal(raterAverage({ geruch: 5, textur: 5, geschmack: 5 }), null);
  assert.equal(raterAverage(null), null);
  assert.equal(raterAverage(r('c1', 'p1', 5, 5, 5, 0)), null);
});

test('cheeseScore = Mittel der Bewerter-Schnitte, jede Person zählt gleich', () => {
  const ratings = [
    r('c1', 'p1', 8, 8, 8, 8), // 8
    r('c1', 'p2', 6, 6, 6, 6), // 6
    r('c1', 'p3', 10, 9, 10, 9), // 9.5
  ];
  const { score, count } = cheeseScore('c1', ratings);
  assert.equal(count, 3);
  assert.ok(Math.abs(score - 23.5 / 3) < 1e-12);
});

test('cheeseScore ohne Bewertung → null', () => {
  assert.deepEqual(cheeseScore('c9', []), { score: null, count: 0 });
});

test('categoryAverages je Kategorie', () => {
  const ratings = [r('c1', 'p1', 8, 4, 10, 6), r('c1', 'p2', 6, 6, 8, 2)];
  assert.deepEqual(categoryAverages('c1', ratings), { geruch: 7, textur: 5, geschmack: 9, abgang: 4 });
  assert.deepEqual(categoryAverages('c2', ratings), { geruch: null, textur: null, geschmack: null, abgang: null });
});

test('groupRanking sortiert absteigend, Unbewertete separat', () => {
  const ratings = [
    r('c1', 'p1', 7, 7, 7, 7), // Comté 7
    r('c2', 'p1', 9, 9, 9, 9), // Brie 9
    r('c3', 'p1', 5, 5, 5, 5), // Appenzeller 5
  ];
  const { ranked, unrated } = groupRanking(cheeses, ratings);
  assert.deepEqual(ranked.map((x) => x.cheese.name), ['Brie', 'Comté', 'Appenzeller']);
  assert.deepEqual(ranked.map((x) => x.rank), [1, 2, 3]);
  assert.deepEqual(unrated.map((x) => x.cheese.name), ['Gouda']);
});

test('groupRanking ändert Reihenfolge nach neuer Bewertung', () => {
  const ratings = [r('c1', 'p1', 7, 7, 7, 7), r('c2', 'p1', 9, 9, 9, 9)];
  assert.equal(groupRanking(cheeses, ratings).ranked[0].cheese.name, 'Brie');
  ratings.push(r('c2', 'p2', 1, 1, 1, 1)); // Brie fällt auf 5
  assert.equal(groupRanking(cheeses, ratings).ranked[0].cheese.name, 'Comté');
});

test('Gleichstand: gleicher Platz, mehr Bewertungen zuerst, dann alphabetisch', () => {
  const ratings = [
    r('c1', 'p1', 8, 8, 8, 8), // Comté 8 (1 Bewertung)
    r('c2', 'p1', 8, 8, 8, 8), r('c2', 'p2', 8, 8, 8, 8), // Brie 8 (2)
    r('c3', 'p1', 8, 8, 8, 8), // Appenzeller 8 (1)
    r('c4', 'p1', 2, 2, 2, 2), // Gouda 2
  ];
  const { ranked } = groupRanking(cheeses, ratings);
  assert.deepEqual(ranked.map((x) => x.cheese.name), ['Brie', 'Appenzeller', 'Comté', 'Gouda']);
  assert.deepEqual(ranked.map((x) => x.rank), [1, 1, 1, 4]);
});

test('playerRanking nutzt nur die eigene Bewertung', () => {
  const ratings = [
    r('c1', 'p1', 9, 9, 9, 9), r('c2', 'p1', 4, 4, 4, 4),
    r('c2', 'p2', 10, 10, 10, 10),
  ];
  const mine = playerRanking('p1', cheeses, ratings);
  assert.deepEqual(mine.ranked.map((x) => x.cheese.name), ['Comté', 'Brie']);
  assert.deepEqual(mine.open.map((x) => x.cheese.name), ['Appenzeller', 'Gouda']);
  const ole = playerRanking('p2', cheeses, ratings);
  assert.deepEqual(ole.ranked.map((x) => [x.cheese.name, x.score]), [['Brie', 10]]);
});

test('formatScore: deutsche Schreibweise, eine Nachkommastelle', () => {
  assert.equal(formatScore(7.75), '7,8');
  assert.equal(formatScore(7.25), '7,3');
  assert.equal(formatScore(10), '10,0');
  assert.equal(formatScore(23.5 / 3), '7,8');
  assert.equal(formatScore(null), '–');
});

test('validateName', () => {
  assert.equal(validateName('  ', []), 'Bitte einen Name eingeben.');
  assert.equal(validateName('Ole', ['Yannick', 'Ole']), '„Ole“ gibt es schon.');
  assert.equal(validateName('  ole ', ['Ole']), '„ole“ gibt es schon.');
  assert.equal(validateName('Paula', ['Ole']), null);
  assert.match(validateName('x'.repeat(41), []), /zu lang/);
});

test('cleanName entfernt doppelte Leerzeichen', () => {
  assert.equal(cleanName('  Alter   Gouda '), 'Alter Gouda');
});

test('scoresFromForm wandelt Dropdown-Texte um und lehnt Lücken ab', () => {
  assert.deepEqual(scoresFromForm({ geruch: '8', textur: '6', geschmack: '10', abgang: '1' }),
    { geruch: 8, textur: 6, geschmack: 10, abgang: 1 });
  assert.equal(scoresFromForm({ geruch: '8', textur: '', geschmack: '10', abgang: '1' }), null);
});

test('ratingProgress zeigt, wer noch fehlt', () => {
  const players = [{ id: 'p1', name: 'Yannick' }, { id: 'p2', name: 'Ole' }, { id: 'p3', name: 'Hannes' }];
  const ratings = [r('c1', 'p2', 5, 5, 5, 5)];
  const { done, missing } = ratingProgress('c1', players, ratings);
  assert.deepEqual(done.map((p) => p.name), ['Ole']);
  assert.deepEqual(missing.map((p) => p.name), ['Yannick', 'Hannes']);
});

import { genitive } from '../js/logic.js';
test('genitive', () => {
  assert.equal(genitive('Ole'), 'Oles');
  assert.equal(genitive('Hannes'), 'Hannes’');
  assert.equal(genitive('Yannick'), 'Yannicks');
});
