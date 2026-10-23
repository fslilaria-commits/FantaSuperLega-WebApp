const { test } = require('node:test');
const assert = require('node:assert/strict');
const Stagione = require('../../frontend/js/stagione.js');

test('dalla stagione escono le scritte del sito e il numero di giornate', () => {
    assert.equal(Stagione.ANNO, 2026);
    assert.equal(Stagione.breve, '26/27');
    assert.equal(Stagione.nome, '2026/27');
    assert.equal(Stagione.GIORNATE, 22); // 12 squadre: 11 di andata e 11 di ritorno
});

test('il calendario degli scontri diretti arriva fino all\'ultima giornata della stagione', () => {
    const { generaCalendario } = require('../../frontend/js/scontri.js');
    const { rounds } = generaCalendario(['a', 'b', 'c', 'd'], { start: 1, random: () => 0.42 });
    assert.equal(Math.max(...Object.keys(rounds).map(Number)), Stagione.GIORNATE);
});
