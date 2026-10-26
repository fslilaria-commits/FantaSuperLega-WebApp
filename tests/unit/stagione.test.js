const { test } = require('node:test');
const assert = require('node:assert/strict');
const Stagione = require('../../frontend/js/stagione.js');

test('dall\'anno escono le scritte del sito e dalle squadre il numero di giornate', () => {
    assert.equal(Stagione.nomeDi(2026), '2026/27');
    assert.equal(Stagione.breveDi(2026), '26/27');
    assert.equal(Stagione.nomeDi(2099), '2099/00');
    assert.equal(Stagione.giornateDi(12), 22); // 11 di andata e 11 di ritorno
    assert.equal(Stagione.giornateDi(14), 26);
});

test('data/stagione.json, scritto dal bot, diventa la stagione del sito', () => {
    const s = Stagione.descrivi({ anno: 2027, campionato: 1050, squadre: Array.from({ length: 14 }, (_, i) => ({ teamId: i })) });
    assert.deepEqual(s, { anno: 2027, nome: '2027/28', breve: '27/28', squadre: 14, giornate: 26 });
    assert.equal(Stagione.descrivi({ anno: 2026 }).giornate, null, 'senza squadre il numero di giornate non si sa');
    assert.equal(Stagione.descrivi(null), null);
    assert.equal(Stagione.descrivi({ anno: '2026' }), null);
});

test('il data/stagione.json pubblicato è completo e coerente', () => {
    const dati = require('../../data/stagione.json');
    assert.ok(Number.isInteger(dati.anno) && Number.isInteger(dati.campionato));
    assert.ok(dati.squadre.length >= 4 && dati.squadre.length % 2 === 0, 'squadre in numero pari');
    assert.equal(new Set(dati.squadre.map(s => s.teamId)).size, dati.squadre.length, 'squadre ripetute');
    assert.ok(dati.squadre.every(s => Number.isInteger(s.teamId) && s.team), 'id o nome mancanti');
});

test('il calendario degli scontri diretti arriva fino all\'ultima giornata del calendario', () => {
    const { generaCalendario } = require('../../frontend/js/scontri.js');
    const { rounds } = generaCalendario(['a', 'b', 'c', 'd'], { start: 1, end: 26, random: () => 0.42 });
    assert.equal(Math.max(...Object.keys(rounds).map(Number)), 26);
    assert.throws(() => generaCalendario(['a', 'b'], { start: 1 }), /manca il calendario/);
});
