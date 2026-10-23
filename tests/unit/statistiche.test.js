const { test } = require('node:test');
const assert = require('node:assert/strict');
const { costruisciRiepilogo, aggiornaRiepilogo, mediaPrima } = require('../../frontend/js/statistiche.js');

test('media, presenze e ultima giornata giocata', () => {
    const r = costruisciRiepilogo([
        { number: 2, stats: { a: { fp: 20, inCampo: true }, b: { fp: 0, inCampo: false } } },
        { number: 1, stats: { a: { fp: 10, inCampo: true }, b: { fp: 8.5, inCampo: true } } },
        { number: 3, stats: { a: { fp: 31, inCampo: true, media: true } } },
    ]);
    assert.deepEqual(r.a.g, { 1: 10, 2: 20 });
    assert.equal(r.a.media, 15);
    assert.equal(r.a.presenze, 2);
    assert.deepEqual(r.a.ultima, { matchday: 2, fp: 20 }, 'il punteggio medio di una gara spostata non conta');
    assert.equal(r.b.presenze, 1, 'chi non è entrato in campo non ha presenza');
});

test('chi non ha mai giocato non compare', () => {
    assert.deepEqual(costruisciRiepilogo([{ number: 1, stats: { c: { fp: 0, inCampo: false } } }]), {});
});

test('aggiornare il riepilogo con una giornata dà lo stesso risultato della ricostruzione completa', () => {
    const g1 = { number: 1, stats: { a: { fp: 10, inCampo: true }, b: { fp: 8, inCampo: true } } };
    const g2 = { number: 2, stats: { a: { fp: 20, inCampo: true }, c: { fp: 5, inCampo: true } } };
    const completo = costruisciRiepilogo([g1, g2]);
    const aggiornato = aggiornaRiepilogo(costruisciRiepilogo([g1]), 2, g2.stats);
    assert.deepEqual(aggiornato, completo);
});

test('ricalcolare una giornata la sostituisce, non la somma', () => {
    const r = costruisciRiepilogo([{ number: 1, stats: { a: { fp: 10, inCampo: true }, b: { fp: 3, inCampo: true } } }]);
    const ricalcolato = aggiornaRiepilogo(r, 1, { a: { fp: 12, inCampo: true } });
    assert.deepEqual(ricalcolato.a.g, { 1: 12 });
    assert.equal(ricalcolato.b, undefined, 'chi non ha più punti in nessuna giornata sparisce');
});

test('media prima di una giornata, per le gare spostate', () => {
    const r = costruisciRiepilogo([
        { number: 1, stats: { a: { fp: 10, inCampo: true } } },
        { number: 2, stats: { a: { fp: 20, inCampo: true } } },
        { number: 3, stats: { a: { fp: 90, inCampo: true } } },
    ]);
    assert.equal(mediaPrima(r, 'a', 3), 15);
    assert.equal(mediaPrima(r, 'nessuno', 3), 0);
});
