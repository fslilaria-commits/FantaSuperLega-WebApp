const { test } = require('node:test');
const assert = require('node:assert/strict');
const { confrontaListone, scrittureListone, totaleModifiche } = require('../../frontend/js/listone-diff.js');

const giocatore = (id, extra = {}) => ({
    id, name: `Giocatore ${id}`, team: 'Itas Trentino', teamId: 6862, role: 'S',
    number: 1, birthYear: 2000, nationality: 'ITA', photo: `https://f/${id}`, active: true, ...extra,
});

test('nessuna modifica se proposta e listone coincidono', () => {
    const lista = [giocatore('A'), giocatore('B')];
    const diff = confrontaListone(lista, lista);
    assert.equal(totaleModifiche(diff), 0);
    assert.deepEqual(scrittureListone(diff), []);
});

test('un nuovo giocatore entra con il ruolo della Lega', () => {
    const diff = confrontaListone([giocatore('A'), giocatore('N', { role: 'L' })], [giocatore('A')]);
    assert.deepEqual(diff.nuovi.map(p => p.id), ['N']);
    const [w] = scrittureListone(diff);
    assert.equal(w.id, 'N');
    assert.equal(w.nuovo, true);
    assert.equal(w.data.role, 'L');
    assert.equal(w.data.active, true);
});

test('un trasferimento aggiorna la squadra ma non il ruolo', () => {
    const diff = confrontaListone(
        [giocatore('A', { team: 'Rana Verona', teamId: 6864, role: 'O' })],
        [giocatore('A')],
    );
    assert.equal(diff.trasferiti.length, 1);
    assert.equal(diff.trasferiti[0].da, 'Itas Trentino');
    assert.equal(diff.ruoliDiversi.length, 1);
    assert.equal(diff.ruoliDiversi[0].ruoloLega, 'O');
    const [w] = scrittureListone(diff);
    assert.equal(w.data.team, 'Rana Verona');
    assert.equal(w.data.role, undefined, 'il ruolo non va mai sovrascritto');
});

test('un cambio di ruolo da solo viene segnalato e non applicato', () => {
    const diff = confrontaListone([giocatore('A', { role: 'O' })], [giocatore('A')]);
    assert.equal(diff.ruoliDiversi.length, 1);
    assert.equal(totaleModifiche(diff), 0);
    assert.deepEqual(scrittureListone(diff), []);
});

test('chi esce diventa non attivo, senza essere cancellato', () => {
    const diff = confrontaListone([giocatore('A')], [giocatore('A'), giocatore('X')]);
    assert.deepEqual(diff.usciti.map(p => p.id), ['X']);
    assert.deepEqual(scrittureListone(diff), [{ id: 'X', nuovo: false, data: { active: false } }]);
});

test('chi era uscito e ricompare torna attivo', () => {
    const diff = confrontaListone([giocatore('X')], [giocatore('X', { active: false })]);
    assert.deepEqual(diff.rientrati.map(p => p.id), ['X']);
    assert.equal(scrittureListone(diff)[0].data.active, true);
    assert.deepEqual(diff.usciti, [], 'un giocatore già non attivo non esce due volte');
});

test('maglia o foto cambiate sono un aggiornamento semplice', () => {
    const diff = confrontaListone([giocatore('A', { number: 9 })], [giocatore('A')]);
    assert.equal(diff.aggiornati.length, 1);
    assert.equal(scrittureListone(diff)[0].data.number, 9);
});
