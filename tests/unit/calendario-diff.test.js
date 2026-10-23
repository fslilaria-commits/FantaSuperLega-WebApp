const { test } = require('node:test');
const assert = require('node:assert/strict');
const { confrontaCalendario } = require('../../frontend/js/calendario-diff.js');

const now = new Date('2026-10-20T12:00:00Z');
const giornata = (number, lockAt, extra = {}) => ({
    number, label: `${number}ª Andata`, legaId: 8484 + number, lockAt, provisional: false,
    matches: [{ home: 'A', homeId: 1, away: 'B', awayId: 2, start: lockAt, matchId: 1, moved: false }], ...extra,
});

test('le giornate nuove vengono create aperte', () => {
    const diff = confrontaCalendario([giornata(5, '2026-11-08T14:59:00.000Z')], [], now);
    assert.equal(diff.nuove.length, 1);
    assert.deepEqual(diff.scritture[0].id, '5');
    assert.equal(diff.scritture[0].data.status, 'open');
});

test('nessuna scrittura se non cambia niente', () => {
    const g = giornata(5, '2026-11-08T14:59:00.000Z');
    const diff = confrontaCalendario([g], [{ id: '5', ...g, status: 'open' }], now);
    assert.deepEqual(diff.scritture, []);
});

test('nessuna scrittura se Firestore restituisce i campi in un altro ordine', () => {
    const g = giornata(5, '2026-11-08T14:59:00.000Z');
    // Come li restituisce Firestore: chiavi delle mappe in ordine alfabetico
    const daFirestore = {
        id: '5', status: 'open', provisional: false, number: 5, matches: g.matches.map(m => Object.fromEntries(Object.entries(m).sort())),
        lockAt: g.lockAt, legaId: g.legaId, label: g.label,
    };
    const diff = confrontaCalendario([g], [daFirestore], now);
    assert.deepEqual(diff.gareCambiate, []);
    assert.deepEqual(diff.scritture, []);
});

test('la scadenza di una giornata futura si sposta', () => {
    const vecchia = giornata(5, '2026-11-08T14:59:00.000Z');
    const nuova = giornata(5, '2026-11-07T16:59:00.000Z');
    const diff = confrontaCalendario([nuova], [{ id: '5', ...vecchia }], now);
    assert.equal(diff.scadenzeSpostate.length, 1);
    assert.equal(diff.scritture[0].data.lockAt, '2026-11-07T16:59:00.000Z');
});

test('la scadenza di una giornata già bloccata non si sposta mai', () => {
    const vecchia = giornata(1, '2026-10-17T15:59:00.000Z');
    const nuova = giornata(1, '2026-10-25T15:59:00.000Z');
    const diff = confrontaCalendario([nuova], [{ id: '1', ...vecchia }], now);
    assert.equal(diff.scadenzeBloccate.length, 1);
    assert.equal(diff.scadenzeSpostate.length, 0);
    const w = diff.scritture[0];
    assert.equal(w.data.lockAt, '2026-10-17T15:59:00.000Z');
});

test('orari delle gare cambiati vengono aggiornati', () => {
    const vecchia = giornata(6, '2026-11-22T16:59:00.000Z', { provisional: true });
    const nuova = { ...vecchia, provisional: false, matches: [{ ...vecchia.matches[0], start: '2026-11-22T17:00:00.000Z' }] };
    const diff = confrontaCalendario([nuova], [{ id: '6', ...vecchia }], now);
    assert.equal(diff.gareCambiate.length, 1);
    assert.equal(diff.scritture[0].data.provisional, false);
});
