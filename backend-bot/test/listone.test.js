const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SQUADRE_SUPERLEGA, mapRole, normalizeName, parseRoster, checkProposal } = require('../lib/listone');

test('i ruoli della Lega diventano le sigle del gioco', () => {
    assert.equal(mapRole(' Palleggiatore '), 'P');
    assert.equal(mapRole('Schiacciatore'), 'S');
    assert.equal(mapRole('Centrale'), 'C');
    assert.equal(mapRole('Opposto'), 'O');
    assert.equal(mapRole('Libero'), 'L');
    assert.equal(mapRole('Allenatore'), null);
});

test('i nomi passano da "COGNOME Nome" a "Nome Cognome"', () => {
    assert.equal(normalizeName('GIANNELLI Simone'), 'Simone Giannelli');
    assert.equal(normalizeName('DE CECCO Luciano'), 'Luciano De Cecco');
    assert.equal(normalizeName("D'AMICO Marco"), "Marco D'Amico");
    assert.equal(normalizeName('VOLPE Nicolò'), 'Nicolò Volpe');
    assert.equal(normalizeName('GUTIERREZ José Miguel'), 'José Miguel Gutierrez');
});

const riga = (key, nome, ruolo, maglia = 6) => `
    <tr class="DettaglioA">
        <td class="foto"><img src="x"></td>
        <td class="num-maglia"> ${maglia} </td>
        <td class="nome"><a href="/player/${key}"> ${nome} </a><span class="mob">${ruolo}</span></td>
        <td class="ruolo desk"> ${ruolo} </td>
        <td class="nascita"> 1996 </td>
        <td class="altezza"> 200 </td>
        <td class="luogo-nascita"> BZ </td>
        <td class="naz-sportiva"> ITA </td>
    </tr>`;

test('la tabella Roster diventa un elenco di giocatori', () => {
    const html = `<table class="table" id="roster"><tbody>
        ${riga('GIA-SIM-96', 'GIANNELLI Simone', 'Palleggiatore')}
        ${riga('XXX-YYY-80', 'ROSSI Mario', 'Allenatore', '')}
    </tbody></table>`;
    const players = parseRoster(html, { teamId: 6865, team: 'Sir Susa Scai Perugia' });
    assert.deepEqual(players, [{
        id: 'GIA-SIM-96',
        name: 'Simone Giannelli',
        team: 'Sir Susa Scai Perugia',
        teamId: 6865,
        role: 'P',
        number: 6,
        birthYear: 1996,
        nationality: 'ITA',
        photo: 'https://www.legavolley.it/Foto.aspx?Key=GIA-SIM-96&sqid=6865&heightImg=120',
        active: true,
    }]);
});

// Proposta finta: 12 giocatori per ognuna delle 12 squadre
const proposta = () => SQUADRE_SUPERLEGA.flatMap(({ team }, t) =>
    Array.from({ length: 12 }, (_, i) => ({ id: `T${t}-P${i}`, name: `Giocatore ${i}`, team, role: 'S' })));

test('una proposta normale passa', () => {
    const { errors } = checkProposal(proposta(), proposta());
    assert.deepEqual(errors, []);
});

test('si blocca se una squadra ha troppi pochi giocatori', () => {
    const p = proposta().filter(x => !(x.team === 'Itas Trentino' && x.id.endsWith('P0')) && !(x.team === 'Itas Trentino' && /P[1-5]$/.test(x.id)));
    const { errors } = checkProposal(p, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Itas Trentino/);
});

test('si blocca se spariscono troppi giocatori tutti insieme', () => {
    const prev = proposta();
    const nuova = prev.map((p, i) => (i % 3 === 0 ? { ...p, id: `${p.id}-nuovo` } : p));
    const { errors } = checkProposal(nuova, prev);
    assert.ok(errors.some(e => e.includes('troppi')));
});

test('si blocca se un giocatore compare due volte', () => {
    const p = proposta();
    p.push({ ...p[0] });
    assert.ok(checkProposal(p, []).errors.some(e => e.includes('ripetuto')));
});
