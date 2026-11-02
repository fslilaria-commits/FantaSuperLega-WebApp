const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../../frontend/js/quotazioni.js');
const { formazionePiuRecente } = require('../../frontend/js/punteggi.js');
const { checkLineup } = require('../../frontend/js/formazione-check.js');

const ROLES = { P: 2, S: 4, C: 4, O: 2, L: 2 };
const picksDa = (prefix = '') => Object.entries(ROLES).flatMap(([role, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}${role}${i + 1}`, role })));
// Due giocatori per posto (A e B), su 4 club: al massimo 4 per club
const tutti = [...picksDa('A'), ...picksDa('B')];
const playersById = Object.fromEntries(tutti.map((p, i) => [p.id, { name: p.id, team: `Club ${i % 4}`, role: p.role, active: true }]));
const quotazioni = Object.fromEntries(tutti.map(p => [p.id, 7]));
const base = { quotazioni, budget: 100, playersById, giornata: 3 };

test('quotazioni: prezzi divisi per ruolo e riletti per giocatore', () => {
    const perRuolo = Q.prezziPerRuolo({ AP1: 10, AS1: 5, nessuno: 3, AL1: 0, AC1: 2.5 }, playersById);
    assert.deepEqual(perRuolo, { P: { AP1: 10 }, S: { AS1: 5 }, C: {}, O: {}, L: {} });
    assert.deepEqual(Q.prezziPerId({ prezzi: perRuolo }), { AP1: 10, AS1: 5 });
    assert.deepEqual(Q.prezziPerId(null), {});
});

test('quotazioni: proposta dalle medie dentro ogni ruolo, minimo a chi non ha giocato', () => {
    const players = [
        { id: 'o1', role: 'O' }, { id: 'o2', role: 'O' }, { id: 'o3', role: 'O' }, { id: 'o4', role: 'O' },
        { id: 'l1', role: 'L' }, { id: 'l2', role: 'L' },
    ];
    const statistiche = { o1: { media: 40 }, o2: { media: 20 }, o3: { media: 20 }, l1: { media: 8 } };
    const prezzi = Q.proponiPrezzi(players, statistiche);
    assert.equal(prezzi.o1, Q.PREZZO_MAX);
    assert.equal(prezzi.o2, prezzi.o3, 'a parità di media lo stesso prezzo');
    assert.ok(prezzi.o2 < prezzi.o1 && prezzi.o2 > Q.PREZZO_MIN);
    assert.equal(prezzi.o4, Q.PREZZO_MIN, 'senza partite il minimo');
    assert.equal(prezzi.l1, Q.PREZZO_MAX, 'il miglior libero vale come il miglior opposto');
    assert.equal(prezzi.l2, Q.PREZZO_MIN);
});

test('quotazioni: giocatori attivi senza prezzo', () => {
    const players = [{ id: 'a' }, { id: 'b' }, { id: 'c', active: false }];
    assert.deepEqual(Q.senzaPrezzo(players, { a: 5 }).map(p => p.id), ['b']);
});

test('quotazioni: squadra nuova dentro il budget, cambi liberi', () => {
    const c = Q.controllaSquadra({ ...base, picks: picksDa('A') });
    assert.deepEqual(c.errors, []);
    assert.equal(c.completa, true);
    assert.equal(c.spesa, 98);
    assert.equal(c.creditsLeft, 2);
    assert.equal(c.cambi, 0);
    assert.equal(c.liberi, true);
    const squadra = Q.costruisciSquadra({ picks: picksDa('A'), controllo: c, vecchia: null, giornata: 3 });
    assert.deepEqual(squadra.P, ['AP1', 'AP2']);
    assert.equal(squadra.all.length, 14);
    assert.equal(squadra.prices.AS1, 7);
    assert.equal(squadra.creditsLeft, 2);
    assert.deepEqual([squadra.giornata, squadra.dalla, squadra.cambi], [3, 3, 0]);
});

test('quotazioni: budget, prezzo mancante, ruolo e massimo per club', () => {
    assert.ok(Q.controllaSquadra({ ...base, budget: 90, picks: picksDa('A') }).errors.some(e => e.includes('budget superato di 8')));
    const senza = { ...quotazioni };
    delete senza.AS1;
    assert.ok(Q.controllaSquadra({ ...base, quotazioni: senza, picks: picksDa('A') }).errors.some(e => e.includes('AS1') && e.includes('prezzo')));
    const ruoloSbagliato = picksDa('A').map(p => (p.id === 'AP1' ? { id: 'AS1', role: 'P' } : p));
    assert.ok(Q.controllaSquadra({ ...base, picks: ruoloSbagliato }).errors.some(e => e.includes('non è un P')));
    const stessoClub = Object.fromEntries(Object.entries(playersById).map(([id, p]) => [id, { ...p, team: 'Perugia' }]));
    assert.ok(Q.controllaSquadra({ ...base, playersById: stessoClub, picks: picksDa('A') }).errors.some(e => e.includes('Perugia')));
});

test('quotazioni: chi resta tiene il prezzo pagato, chi arriva paga la quotazione di oggi', () => {
    const vecchia = { ...Q.costruisciSquadra({ picks: picksDa('A'), controllo: Q.controllaSquadra({ ...base, picks: picksDa('A') }), vecchia: null, giornata: 1 }) };
    const rincari = Object.fromEntries(Object.keys(quotazioni).map(id => [id, 9]));
    const picks = picksDa('A').map(p => (p.id === 'AO1' ? { id: 'BO1', role: 'O' } : p));
    const c = Q.controllaSquadra({ ...base, quotazioni: rincari, vecchia, picks });
    assert.equal(c.prezzi.AP1, 7);
    assert.equal(c.prezzi.BO1, 9);
    assert.equal(c.creditsLeft, 100 - 13 * 7 - 9);
});

test('quotazioni: fino a 5 cambi per giornata, liberi nella prima giornata della squadra', () => {
    const vecchia = { ...Q.costruisciSquadra({ picks: picksDa('A'), controllo: Q.controllaSquadra({ ...base, picks: picksDa('A') }), vecchia: null, giornata: 2 }) };
    const cambia = n => picksDa('A').map((p, i) => (i < n ? { id: p.id.replace('A', 'B'), role: p.role } : p));
    assert.equal(Q.controllaSquadra({ ...base, giornata: 2, vecchia, picks: cambia(9) }).cambi, 0, 'giornata della squadra: liberi');
    assert.equal(Q.controllaSquadra({ ...base, vecchia, picks: cambia(5) }).errors.length, 0);
    assert.equal(Q.controllaSquadra({ ...base, vecchia, picks: cambia(5) }).cambi, 5);
    assert.ok(Q.controllaSquadra({ ...base, vecchia, picks: cambia(6) }).errors.some(e => e.includes('6 su 5')));
    // Nella stessa giornata i cambi già fatti si sommano; in quella dopo si riparte da zero
    const dopoTre = { ...vecchia, all: cambia(3).map(p => p.id), giornata: 3, cambi: 3 };
    for (const p of cambia(3)) dopoTre[p.role] = cambia(3).filter(q => q.role === p.role).map(q => q.id);
    const altriDue = cambia(3).map((p, i) => (i === 10 || i === 11 ? { id: p.id.replace('A', 'B'), role: p.role } : p));
    assert.equal(Q.controllaSquadra({ ...base, vecchia: dopoTre, picks: altriDue }).cambi, 5);
    assert.equal(Q.controllaSquadra({ ...base, giornata: 4, vecchia: dopoTre, picks: altriDue }).cambi, 2);
});

test('quotazioni: nella formazione chi arriva prende posto e fascia di chi parte', () => {
    const vecchia = Q.costruisciSquadra({ picks: picksDa('A'), controllo: Q.controllaSquadra({ ...base, picks: picksDa('A') }), vecchia: null, giornata: 1 });
    const precedente = {
        starters: { P: 'AP1', S1: 'AS1', S2: 'AS2', C1: 'AC1', C2: 'AC2', O: 'AO1', L: 'AL1' },
        bench: ['AP2', 'AS3', 'AS4', 'AC3', 'AC4', 'AO2', 'AL2'],
        captain: 'AO1',
    };
    const picks = picksDa('A').map(p => (p.id === 'AO1' ? { id: 'BO1', role: 'O' } : p.id === 'AS4' ? { id: 'BS4', role: 'S' } : p));
    const c = Q.controllaSquadra({ ...base, vecchia, picks });
    const nuova = Q.costruisciSquadra({ picks, controllo: c, vecchia, giornata: 2 });
    const f = Q.formazioneDopoCambi({ nuova, precedente });
    assert.equal(f.starters.O, 'BO1');
    assert.equal(f.captain, 'BO1');
    assert.equal(f.starters.S1, 'AS1');
    assert.deepEqual(checkLineup(nuova, f.starters, f.captain), []);
});

test('quotazioni: senza formazione di partenza titolari i più cari, capitano il più caro', () => {
    const picks = picksDa('A');
    const prezzi = { ...quotazioni, AP2: 12, AO2: 14 };
    const c = Q.controllaSquadra({ ...base, quotazioni: prezzi, picks });
    const nuova = Q.costruisciSquadra({ picks, controllo: c, vecchia: null, giornata: 1 });
    const f = Q.formazioneDopoCambi({ nuova, precedente: null });
    assert.equal(f.starters.P, 'AP2');
    assert.equal(f.starters.O, 'AO2');
    assert.equal(f.captain, 'AO2');
    assert.deepEqual(checkLineup(nuova, f.starters, f.captain), []);
});

test('quotazioni: vale l\'ultima formazione salvata fino a quella giornata', () => {
    const f = (matchday, savedAt) => ({ matchday, savedAt });
    // Formazione della 6 salvata prima di un cambio di squadra per la 4: alla 6 vale quella della 4, più recente
    assert.deepEqual(formazionePiuRecente(6, [f(3, 100), f(6, 200), f(4, 300)]), f(4, 300));
    assert.deepEqual(formazionePiuRecente(5, [f(3, 100), f(6, 50)]), f(3, 100));
    assert.equal(formazionePiuRecente(2, [f(3, 100)]), null);
});
