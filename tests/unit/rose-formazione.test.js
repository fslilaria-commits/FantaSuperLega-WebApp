const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRoster, rosterToPicks, checkRoster } = require('../../frontend/js/rose-check.js');
const { checkLineup, buildLineup, suggestFrom } = require('../../frontend/js/formazione-check.js');

const ROLES = { P: 2, S: 4, C: 3, O: 2, L: 1 };
const fullPicks = (prefix = '', price = 10) => Object.entries(ROLES).flatMap(([role, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}${role}${i + 1}`, role, price })));
// 12 giocatori di club diversi (3 per club al massimo)
const playersById = Object.fromEntries(fullPicks().map((p, i) => [p.id, { name: p.id, team: `Club ${i % 4}`, active: true }]));

test('rosa completa e valida', () => {
    const r = checkRoster({ picks: fullPicks(), budget: 300, playersById });
    assert.deepEqual(r.errors, []);
    assert.equal(r.complete, true);
    assert.equal(r.creditsLeft, 180);
});

test('una rosa parziale si può salvare durante l\'asta', () => {
    const r = checkRoster({ picks: fullPicks().slice(0, 5), budget: 300, playersById });
    assert.deepEqual(r.errors, []);
    assert.equal(r.complete, false);
});

test('troppi giocatori in un ruolo', () => {
    const picks = [...fullPicks(), { id: 'P9', role: 'P', price: 1 }];
    assert.ok(checkRoster({ picks, budget: 300, playersById }).errors.some(e => e.includes('ruolo P')));
});

test('un giocatore già in un\'altra rosa della lega', () => {
    const altreRose = { altro: { all: ['S1'] } };
    assert.ok(checkRoster({ picks: fullPicks(), budget: 300, playersById, altreRose }).errors.some(e => e.includes('S1')));
});

test('massimo 4 giocatori dello stesso club', () => {
    const stessoClub = Object.fromEntries(Object.keys(playersById).map(id => [id, { ...playersById[id], team: 'Perugia' }]));
    assert.ok(checkRoster({ picks: fullPicks(), budget: 300, playersById: stessoClub }).errors.some(e => e.includes('Perugia')));
});

test('non si spende più del budget', () => {
    assert.ok(checkRoster({ picks: fullPicks('', 30), budget: 300, playersById }).errors.some(e => e.includes('crediti')));
});

test('la rosa salvata si riapre uguale nell\'editor', () => {
    const roster = buildRoster(fullPicks(), 300);
    assert.equal(roster.all.length, 12);
    assert.equal(roster.creditsLeft, 180);
    assert.deepEqual(rosterToPicks(roster), fullPicks());
});

const roster = buildRoster(fullPicks(), 300);
const starters = { P: 'P1', S1: 'S1', S2: 'S2', C1: 'C1', C2: 'C2', O: 'O1', L: 'L1' };

test('formazione valida: la panchina sono gli altri 5', () => {
    assert.deepEqual(checkLineup(roster, starters, 'S1'), []);
    const l = buildLineup({ roster, starters, captain: 'S1', matchday: 3, uid: 'u1' });
    assert.deepEqual(l.bench, ['P2', 'S3', 'S4', 'C3', 'O2']);
    assert.equal(l.matchday, 3);
});

test('errori della formazione', () => {
    assert.ok(checkLineup(roster, { ...starters, L: undefined }, 'S1').some(e => e.includes('L')));
    assert.ok(checkLineup(roster, { ...starters, P: 'S3' }, 'S1').some(e => e.includes('P:')));
    assert.ok(checkLineup(roster, { ...starters, S2: 'S1' }, 'S1').some(e => e.includes('due volte')));
    assert.ok(checkLineup(roster, starters, 'P2').some(e => e.includes('capitano')));
    assert.ok(checkLineup(buildRoster(fullPicks().slice(0, 7), 300), starters, 'S1')[0].includes('completa'));
});

test('la nuova giornata riparte dalla formazione precedente ancora valida', () => {
    const previous = { starters: { ...starters, O: 'ceduto' }, captain: 'O1' };
    const s = suggestFrom(roster, previous);
    assert.equal(s.starters.P, 'P1');
    assert.equal(s.starters.O, undefined);
    assert.equal(s.captain, null);
});
