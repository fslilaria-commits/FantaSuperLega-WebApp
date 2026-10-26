const { test } = require('node:test');
const assert = require('node:assert/strict');
const { urlPartita, num, parsePartita, parseRisultato, validiDal, checkTabellino } = require('../lib/tabellini');

// Una tabella di squadra come nella pagina partita della Lega (righe vere di Verona – Lube, 1ª giornata 2026/27)
const riga = celle => `<tr>${celle.map(c => `<td>${c}</td>`).join('')}</tr>`;
const tabellaSquadra = (squadra, giocatori, totali, set) => `<table>
    <tr><th>${squadra}</th><th>Voto</th><th>SET</th><th>PUNTI</th><th>BATTUTA</th><th>RICEZIONE</th><th>ATTACCO</th><th>MURO</th></tr>
    ${riga(['Allenatore', '1', '2', '3', '4', '5', 'Tot', 'BP', 'VP', '', 'Err', 'Pt', '', 'Err', 'Pos%', 'Prf%', '', 'Err', 'Mur', 'Pt', 'Pt%', 'Pt'])}
    ${giocatori.map(riga).join('\n')}
    ${riga(['Totali squadra', ...totali])}
    ${riga(['', 'Punti Vinti', 'Bat', 'Att', 'Mur', 'Err.Avv.', '', '', '', '', '', '', '', '', '', '', '', '', ''])}
    ${Array.from({ length: set }, (_, i) => riga([`${i + 1}° Set`, '1', '10', '.', '9', '20', '7', '1', '18', '2', '28%', '22%', '25', '1', '3', '10', '40%', '.'])).join('\n')}
</table>`;
const verona = tabellaSquadra('Rana Verona', [
    ['1', 'Zingel Aidan', '.', '2', '6', '', '', '', '1', '.', '-2', '3', '.', '.', '.', '.', '.', '.', '2', '.', '.', '1', '50%', '.'],
    ['2', 'Cortesia Lorenzo', '.', '', '', '', '', '', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.'],
    ['4', 'Scanferla Leonardo (L)', '.', '*', '', '*', '', '', '.', '.', '.', '.', '.', '.', '2', '.', '.', '.', '.', '.', '.', '.', '.', '.'],
    ['9', 'Keita Noumory', '.', '4', '2', '3', '', '', '11', '2', '-4', '13', '4', '.', '29', '6', '21%', '14%', '19', '1', '3', '10', '53%', '1'],
], ['41', '8', '-13', '66', '22', '2', '59', '10', '25%', '15%', '67', '4', '7', '37', '55%', '2'], 3);
const lube = tabellaSquadra('Cucine Lube Civitanova', [
    ['3', 'Gargiulo Giovanni Maria', '.', '6', '5', '6', '', '', '5', '2', '-1', '16', '1', '2', '2', '.', '50%', '50%', '4', '.', '.', '3', '75%', '.'],
    // 3 perfette su 16 = 18,75%: la Lega arrotonda verso lo zero
    ['8', 'Laurenzano Gabriele (L)', '.', '*', '*', '*', '', '', '.', '.', '.', '.', '.', '.', '16', '1', '50%', '19%', '.', '.', '.', '.', '.', '.'],
], ['49', '19', '1', '77', '18', '9', '44', '3', '39%', '14%', '54', '5', '2', '33', '61%', '7'], 3);
// Le tabelle di squadra stanno dentro una tabella più grande, come nella pagina vera
const pagina = (...squadre) => `<html><body><table><tr><td>Stagione 2026/2027 - Gara n°1</td></tr></table>
    <table><tr><td>${squadre.join('</td><td>')}</td></tr></table></body></html>`;

test('numeri della Lega: virgola, percentuali e punto per lo zero', () => {
    assert.equal(num('45,2'), 45.2);
    assert.equal(num('-2'), -2);
    assert.equal(num('50%'), 50);
    assert.equal(num('.'), 0);
    assert.equal(num(''), 0);
});

test('la pagina partita dà i tabellini delle due squadre, casa e poi ospiti', () => {
    const squadre = parsePartita(pagina(verona, lube));
    assert.deepEqual(squadre.map(s => s.team), ['Rana Verona', 'Cucine Lube Civitanova']);
    assert.equal(urlPartita(40285), 'https://www.legavolley.it/match/40285');
});

test('giocatori in ordine alfabetico: set giocati, nome senza (L), chi non entra non c\'è', () => {
    const [veronesi] = parsePartita(pagina(verona, lube));
    assert.deepEqual(veronesi.players.map(p => [p.name, p.set]), [['Keita Noumory', 3], ['Scanferla Leonardo', 2], ['Zingel Aidan', 2]]);
});

test('ricezione: dalle percentuali tornano perfette e negative, come nella pagina statistiche', () => {
    const [veronesi, marchigiani] = parsePartita(pagina(verona, lube));
    const keita = veronesi.players.find(p => p.name === 'Keita Noumory');
    // 29 ricezioni, 6 errori, 21% positive (6) e 14% perfette (4): le altre 17 sono negative
    assert.deepEqual(keita.rec, { tot: 29, err: 6, neg: 17, perf: 4, perfPct: 13.8, eff: -0.07 });
    // "." vuol dire zero: 2 ricezioni né sbagliate né positive
    assert.deepEqual(veronesi.players.find(p => p.name === 'Scanferla Leonardo').rec, { tot: 2, err: 0, neg: 2, perf: 0, perfPct: 0, eff: 0 });
    const laurenzano = marchigiani.players.find(p => p.name === 'Laurenzano Gabriele');
    assert.equal(laurenzano.rec.perf, 3);
    assert.equal(laurenzano.rec.perfPct, 18.7);
    assert.equal(laurenzano.rec.eff, 0.12);
});

test('battuta, attacco, muro e punti', () => {
    const [veronesi] = parsePartita(pagina(verona, lube));
    const keita = veronesi.players.find(p => p.name === 'Keita Noumory');
    assert.equal(keita.points, 11);
    assert.deepEqual(keita.serve, { tot: 13, ace: 0, err: 4 });
    assert.deepEqual(keita.att, { tot: 19, err: 1, blocked: 3, kills: 10, killPct: 52.6, eff: 0.47 });
    assert.deepEqual(keita.block, { pts: 1 });
});

test('totali di squadra con il numero di set della partita', () => {
    const [, marchigiani] = parsePartita(pagina(verona, lube));
    assert.equal(marchigiani.totals.set, 3);
    assert.deepEqual(marchigiani.totals.serve, { tot: 77, ace: 9, err: 18 });
    assert.deepEqual(marchigiani.totals.att, { tot: 54, err: 5, blocked: 2, kills: 33, killPct: 61.1, eff: 0.52 });
    assert.equal(marchigiani.totals.rec.perf, 6);
});

test('senza le due tabelle o senza i totali la partita non ha ancora il tabellino', () => {
    assert.equal(parsePartita(pagina(verona)), null);
    assert.equal(parsePartita('<p>Partita non ancora giocata</p>'), null);
    assert.equal(parsePartita(pagina(verona.replace(/<tr><td>Totali squadra.*?<\/tr>/, ''), lube)), null);
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
