const { test } = require('node:test');
const assert = require('node:assert/strict');
const { costruisciRiepilogo } = require('../../frontend/js/statistiche.js');

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
