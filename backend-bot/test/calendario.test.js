const { test } = require('node:test');
const assert = require('node:assert/strict');
const { romeToUtc, parseDataGara, parseDataGiornata, parseCalendario, checkCalendario } = require('../lib/calendario');

test("l'ora italiana tiene conto dell'ora legale", () => {
    assert.equal(romeToUtc(2026, 10, 17, 18, 0).toISOString(), '2026-10-17T16:00:00.000Z'); // ora legale
    assert.equal(romeToUtc(2026, 12, 20, 18, 0).toISOString(), '2026-12-20T17:00:00.000Z'); // ora solare
});

test('date di gara e di giornata nei formati della Lega', () => {
    assert.equal(parseDataGara('Mercoledì 4/11/2026 Ore 20:30').toISOString(), '2026-11-04T19:30:00.000Z');
    assert.equal(parseDataGara(''), null);
    assert.equal(parseDataGiornata(' - Domenica 18 Ottobre 2026 Ore 18:00').toISOString(), '2026-10-18T16:00:00.000Z');
});

const gara = (n, data, casa, ospite) => `
    <tr class="tab-gara">
        <td>${n}</td>
        <td>${data}</td>
        <td class="DettaglioCal" onclick="return window.top.location.href=('http://www.legavolley.it/team/${casa}')"> Squadra ${casa} </td>
        <td class="DettaglioRisCal"><a href="https://www.legavolley.it/match/${40000 + n}"> 0-0 </a></td>
        <td class="DettaglioCal" onclick="return window.top.location.href=('http://www.legavolley.it/team/${ospite}')"> Squadra ${ospite} </td>
    </tr>`;

const pagina = gare => `<table>
    <tr><td colspan="8"><span>1° Giornata Andata - Domenica 18 Ottobre 2026 Ore 18:00</span> <!-- RiposoSquadra 8485,50 --></td></tr>
    ${gare.join('\n')}
</table>`;

test('la scadenza è 1 minuto prima della prima gara della giornata', () => {
    const [g] = parseCalendario(pagina([
        gara(1, 'Sabato 17/10/2026<br>Ore 18:00', 1, 2),
        gara(2, 'Domenica 18/10/2026<br>Ore 19:00', 3, 4),
    ]), 1);
    assert.equal(g.number, 1);
    assert.equal(g.label, '1ª Andata');
    assert.equal(g.legaId, 8485);
    assert.equal(g.lockAt, '2026-10-17T15:59:00.000Z');
    assert.equal(g.provisional, false);
    assert.equal(g.matches[0].homeId, 1);
    assert.equal(g.matches[0].matchId, 40001);
});

test('senza orari ufficiali vale la data della giornata, e la scadenza è provvisoria', () => {
    const [g] = parseCalendario(pagina([gara(1, '', 1, 2)]), 2);
    assert.equal(g.number, 12, 'il ritorno parte dalla giornata 12');
    assert.equal(g.provisional, true);
    assert.equal(g.lockAt, '2026-10-18T15:59:00.000Z');
});

test('una gara anticipata di settimane è "spostata" e non anticipa la scadenza', () => {
    const [g] = parseCalendario(pagina([
        gara(1, 'Mercoledì 30/09/2026<br>Ore 20:30', 1, 2),
        gara(2, 'Domenica 18/10/2026<br>Ore 18:00', 3, 4),
    ]), 1);
    assert.equal(g.matches[0].moved, true);
    assert.equal(g.matches[1].moved, false);
    assert.equal(g.lockAt, '2026-10-18T15:59:00.000Z');
});

test('il calendario si scarta se manca qualcosa', () => {
    const errors = checkCalendario([{ number: 1, legaId: 1, lockAt: 'x', matches: [] }]);
    assert.ok(errors.some(e => e.includes('22')));
    assert.ok(errors.some(e => e.includes('0 gare')));
});
