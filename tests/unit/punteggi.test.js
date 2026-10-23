const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../frontend/js/punteggi.js');

const zero = () => ({
    set: 0, points: 0,
    serve: { tot: 0, ace: 0, err: 0 },
    rec: { tot: 0, err: 0, neg: 0, perf: 0, perfPct: 0, eff: 0 },
    att: { tot: 0, err: 0, blocked: 0, kills: 0, killPct: 0, eff: 0 },
    block: { pts: 0 },
});
const stats = over => {
    const s = zero();
    for (const [k, v] of Object.entries(over)) s[k] = typeof v === 'object' ? { ...s[k], ...v } : v;
    return s;
};

// Reggers (opposto, Perugia) nella 1ª giornata: vittoria 3-2
const reggers = stats({ set: 5, points: 18, serve: { tot: 22, ace: 3, err: 6 }, rec: { tot: 3, perf: 3 }, att: { tot: 31, err: 3, blocked: 4, kills: 14, killPct: 45.2, eff: 0.35 }, block: { pts: 1 } });
const perugia = stats({ att: { tot: 107, kills: 51, killPct: 47.7 }, serve: { tot: 113 } });
const cuneo = stats({ att: { tot: 109, kills: 47, killPct: 43.1 }, serve: { tot: 96 } });

test("opposto: il caso Reggers calcolato a mano", () => {
    const r = P.calcolaPunteggio('O', reggers, { squadra: perugia, avversari: cuneo, esito: { vinta: true, tiebreak: true } });
    assert.deepEqual(r.voci, { attacco: 21.35, muro: 1.5, ace: 6, abilitaAttacco: 11.3, coinvolgimento: 4.13, errori: -9 });
    assert.equal(r.fp, 35.64);
});

test('vittoria +2%, sconfitta -2%, tie-break ±1%', () => {
    const ctx = esito => ({ squadra: perugia, avversari: cuneo, esito });
    // Si arrotonda solo il risultato finale: ammesso un centesimo di differenza
    const base = P.calcolaPunteggio('O', reggers, ctx(null)).fp;
    const vicino = (a, b) => assert.ok(Math.abs(a - b) <= 0.011, `${a} invece di ${b}`);
    vicino(P.calcolaPunteggio('O', reggers, ctx({ vinta: true, tiebreak: false })).fp, base * 1.02);
    vicino(P.calcolaPunteggio('O', reggers, ctx({ vinta: false, tiebreak: false })).fp, base * 0.98);
    vicino(P.calcolaPunteggio('O', reggers, ctx({ vinta: false, tiebreak: true })).fp, base * 0.99);
});

test('chi non entra in campo prende 0, palleggiatore compreso', () => {
    const r = P.calcolaPunteggio('P', zero(), { squadra: perugia, avversari: cuneo });
    assert.equal(r.fp, 0);
    assert.equal(r.inCampo, false);
});

test('centrale poco coinvolto: moltiplicatore 0,5 o 0,25', () => {
    const ctx = { squadra: perugia, avversari: cuneo };
    const poco = stats({ set: 1, att: { tot: 3, kills: 2, killPct: 66.7 }, serve: { tot: 1 } });
    const pochissimo = stats({ set: 1, att: { tot: 1, kills: 1, killPct: 100 }, serve: { tot: 1 } });
    assert.equal(P.calcolaPunteggio('C', poco, ctx).molt, 0.5);
    assert.equal(P.calcolaPunteggio('C', pochissimo, ctx).molt, 0.25);
});

test('libero: difesa dagli attacchi avversari non andati a punto, moltiplicatore sulle ricezioni', () => {
    const libero = stats({ set: 5, rec: { tot: 23, err: 3, neg: 9, perf: 4 } });
    const r = P.calcolaPunteggio('L', libero, { squadra: perugia, avversari: cuneo });
    assert.equal(r.voci.difesa, Math.round(((109 - 47) / 109) * 100 / 5 * 100) / 100);
    assert.equal(r.voci.errori, -6);
    assert.equal(r.molt, 1);
    assert.equal(P.calcolaPunteggio('L', stats({ set: 2, rec: { tot: 5 } }), { squadra: perugia, avversari: cuneo }).molt, 0.5);
});

test('palleggiatore: la regia dipende dalla quota di battute', () => {
    const ctx = { squadra: perugia, avversari: cuneo };
    const tante = P.calcolaPunteggio('P', stats({ set: 5, serve: { tot: 12 } }), ctx).voci.regia;
    const poche = P.calcolaPunteggio('P', stats({ set: 1, serve: { tot: 3 } }), ctx).voci.regia;
    assert.equal(tante, Math.round((47.7 / 1.5) * 100) / 100);
    assert.equal(poche, Math.round((47.7 / 1.5) * 0.1 * 100) / 100);
});

test('i nomi del tabellino si abbinano al listone anche con accenti e ordine diverso', () => {
    const listone = [
        { id: 'SOL-SEB', name: 'Sebastian Solé', teamId: 1 },
        { id: 'GUT-JOS', name: 'José Miguel Gutierrez', teamId: 1 },
        { id: 'ROS-MAR', name: 'Mario Rossi', teamId: 2 },
    ];
    const { abbinati, nonTrovati } = P.abbinaGiocatori(
        [{ name: 'Sole Sebastian' }, { name: 'Gutierrez Jose Miguel' }, { name: 'Rossi Mario' }, { name: 'Nuovo Arrivo' }], 1, listone);
    assert.equal(abbinati['Sole Sebastian'].id, 'SOL-SEB');
    assert.equal(abbinati['Gutierrez Jose Miguel'].id, 'GUT-JOS');
    assert.equal(abbinati['Rossi Mario'].altraSquadra, true, 'trovato nel listone ma con un\'altra squadra');
    assert.deepEqual(nonTrovati, ['Nuovo Arrivo']);
});

test('gara spostata: i giocatori di quelle squadre prendono la media', () => {
    const tabellino = { matches: [{ homeId: 1, awayId: 2, moved: true, result: null }], teams: {} };
    const listone = [{ id: 'A', name: 'Uno', teamId: 1, role: 'S' }, { id: 'B', name: 'Due', teamId: 3, role: 'S' }];
    const { punti } = P.punteggiGiornata(tabellino, listone, { A: 18.456 });
    assert.equal(punti.A.fp, 18.46);
    assert.equal(punti.A.media, true);
    assert.equal(punti.B, undefined);
});

test('fanta-squadra: titolari al 100%, capitano x2, panchina al 50%', () => {
    const lineup = { starters: { P: 'p', S1: 's1', S2: 's2', C1: 'c1', C2: 'c2', O: 'o', L: 'l' }, bench: ['b1', 'b2'], captain: 'o' };
    const punti = { p: { fp: 20 }, s1: { fp: 10 }, s2: { fp: 10 }, c1: { fp: 15 }, c2: { fp: 15 }, o: { fp: 30 }, l: { fp: 8 }, b1: { fp: 12 }, b2: { fp: -2 } };
    assert.equal(P.punteggioSquadra(lineup, punti).totale, 20 + 10 + 10 + 15 + 15 + 60 + 8 + 6 - 1);
});

test('il totale è la somma delle righe arrotondate', () => {
    const lineup = { starters: { P: 'p' }, bench: ['b1', 'b2'], captain: null };
    const r = P.punteggioSquadra(lineup, { p: { fp: 10 }, b1: { fp: 10.01 }, b2: { fp: 10.01 } });
    assert.equal(r.totale, Math.round(r.dettaglio.reduce((a, d) => a + d.punti, 0) * 100) / 100);
});

test('il capitano con punteggio medio non raddoppia', () => {
    const lineup = { starters: { O: 'o' }, bench: [], captain: 'o' };
    assert.equal(P.punteggioSquadra(lineup, { o: { fp: 30, media: true } }).totale, 30);
});

test('senza formazione per la giornata vale l\'ultima precedente', () => {
    const f = [{ matchday: 2, id: 'g2' }, { matchday: 5, id: 'g5' }, { matchday: 7, id: 'g7' }];
    assert.equal(P.formazionePer(6, f).id, 'g5');
    assert.equal(P.formazionePer(7, f).id, 'g7');
    assert.equal(P.formazionePer(1, f), null);
});
