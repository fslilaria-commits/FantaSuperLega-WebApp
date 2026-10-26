const { test } = require('node:test');
const assert = require('node:assert/strict');
const { urlStatistiche, num, parseStatistiche, parseRisultato, validiDal, checkTabellino } = require('../lib/tabellini');

const riga = (prima, celle, tag = 'td') => `<tr><${tag}>${prima}</${tag}>${celle.map(c => `<td>${c}</td>`).join('')}</tr>`;
// Le 23 colonne dopo il nome, come nella pagina della Lega
const reggers = ['1', '5', '18', '8', '22', '3', '6', '0,60', '-0,14', '3', '&nbsp;', '&nbsp;', '3', '100,0', '1,00', '31', '3', '4', '14', '45,2', '0,35', '1', '0,20'];
const totali = ['1', '5', '70', '31', '113', '12', '26', '2,40', '-0,12', '69', '6', '21', '24', '34,8', '0,26', '107', '8', '8', '51', '47,7', '0,40', '7', '1,40'];

test('numeri con la virgola e celle vuote', () => {
    assert.equal(num('45,2'), 45.2);
    assert.equal(num('-0,14'), -0.14);
    assert.equal(num(''), 0);
});

test('righe dei giocatori e totali di squadra (pagina in italiano, etichetta in th)', () => {
    const html = `<table>${riga('Reggers Ferre', reggers)}${riga('Totali di Squadra', totali, 'th')}</table>`;
    const { players, totals } = parseStatistiche(html);
    assert.equal(players.length, 1);
    assert.deepEqual(players[0].att, { tot: 31, err: 3, blocked: 4, kills: 14, killPct: 45.2, eff: 0.35 });
    assert.deepEqual(players[0].serve, { tot: 22, ace: 3, err: 6 });
    assert.equal(players[0].rec.perf, 3);
    assert.equal(players[0].block.pts, 1);
    assert.equal(totals.att.tot, 107);
    assert.equal(totals.serve.tot, 113);
});

test('senza riga dei totali la squadra non ha ancora dati', () => {
    assert.equal(parseStatistiche(`<table>${riga('Reggers Ferre', reggers)}</table>`), null);
});

test('risultati: solo partite concluse', () => {
    assert.deepEqual(parseRisultato(' 2-3 '), { home: 2, away: 3 });
    assert.equal(parseRisultato('0-0'), null);
    assert.equal(parseRisultato(''), null);
});

test('i tabellini sono validi dalle 19 del giorno dopo l\'ultima partita', () => {
    const g = { matches: [{ start: '2026-10-17T16:00:00.000Z' }, { start: '2026-10-18T17:00:00.000Z' }, { start: null, moved: true }] };
    assert.equal(validiDal(g).toISOString(), '2026-10-19T17:00:00.000Z');
    assert.equal(validiDal({ matches: [{ start: null }] }), null);
});

test('un tabellino incompleto viene scartato', () => {
    const t = { matches: [{ home: 'A', homeId: 1, away: 'B', awayId: 2, result: { home: 3, away: 0 } }], teams: { 1: { team: 'A', players: [] } } };
    const errors = checkTabellino(t);
    assert.ok(errors.some(e => e.includes('meno di 6')));
    assert.ok(errors.some(e => e.includes('B: mancano')));
});

test('le statistiche si chiedono per anno e codice della squadra di data/stagione.json', () => {
    const stagione = { anno: 2026, campionato: 999, squadre: [{ teamId: 6862, team: 'Itas Trentino', codiceStatistiche: 'TN-ITAS' }] };
    assert.equal(urlStatistiche(stagione, 8485, 6862),
        'https://www.legavolley.it/statistiche/?TipoStat=1.1&Serie=1&AnnoInizio=2026&Fase=1&Giornata=8485&Squadra=TN-ITAS');
    assert.throws(() => urlStatistiche(stagione, 8485, 1), /squadra 1: manca il codice/);
});
