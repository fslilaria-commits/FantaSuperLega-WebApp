const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../../frontend/js/correzioni.js');
const P = require('../../frontend/js/punteggi.js');

const riga = (name, over = {}) => ({
    name,
    ...C.completaStatistiche({
        set: 3, serve: { tot: 10, ace: 1, err: 2 }, rec: { tot: 8, err: 1, neg: 2, perf: 3 },
        att: { tot: 12, err: 1, blocked: 1, kills: 6 }, block: { pts: 1 }, ...over,
    }),
});

const totali = righe => {
    const somma = { set: 3, serve: {}, rec: {}, att: {}, block: {} };
    for (const [campo] of C.CAMPI) {
        if (campo === 'set') continue;
        const [a, b] = campo.split('.');
        somma[a][b] = righe.reduce((t, r) => t + r[a][b], 0);
    }
    return { ...C.completaStatistiche(somma), name: 'Totali di Squadra', points: 70 };
};

function tabellinoDiProva() {
    const casa = [riga('Rossi Mario'), riga('Bianchi Luca')];
    const ospiti = [riga('Verdi Paolo'), riga('Neri Ugo')];
    return {
        number: 1, label: '1ª Andata',
        matches: [{ home: 'Casa', homeId: 1, away: 'Ospiti', awayId: 2, moved: false, result: { home: 3, away: 1 } }],
        teams: {
            1: { team: 'Casa', players: casa, totals: totali(casa) },
            2: { team: 'Ospiti', players: ospiti, totals: totali(ospiti) },
        },
    };
}

const listone = [
    { id: 'rossi', name: 'Mario Rossi', teamId: 1, role: 'S' },
    { id: 'bianchi', name: 'Luca Bianchi', teamId: 1, role: 'C' },
    { id: 'verdi', name: 'Paolo Verdi', teamId: 2, role: 'O' },
    { id: 'gialli', name: 'Ugo Gialli', teamId: 2, role: 'S' }, // nel tabellino è "Neri Ugo": non si abbina da solo
];

test('i valori ricalcolati coincidono con quelli della Lega (tabellino vero della 1ª giornata)', t => {
    const file = path.join(__dirname, '../../data/tabellini/1.json');
    if (!fs.existsSync(file)) return t.skip('tabellino non presente');
    const tabellino = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const squadra of Object.values(tabellino.teams)) {
        for (const s of squadra.players) {
            const r = C.completaStatistiche(C.numeri(s));
            assert.equal(r.points, s.points, `punti di ${s.name}`);
            assert.ok(Math.abs(r.att.killPct - s.att.killPct) < 0.11, `% attacco di ${s.name}`); // la Lega arrotonda i mezzi decimi a modo suo
            assert.ok(Math.abs(r.att.eff - s.att.eff) < 0.011, `efficienza attacco di ${s.name}`);
            assert.ok(Math.abs(r.rec.perfPct - s.rec.perfPct) < 0.11, `% ricezione perfetta di ${s.name}`);
        }
    }
});

test('una riga corretta ricalcola punti e valori derivati e aggiorna i totali di squadra', () => {
    const tab = tabellinoDiProva();
    const stats = C.numeri(tab.teams[1].players[0]);
    stats.serve.ace += 2;
    stats.serve.tot += 2;
    const { tabellino, inutilizzate } = C.applicaCorrezioni(tab, { '1|Rossi Mario': { stats } });
    const corretta = tabellino.teams[1].players[0];
    assert.equal(corretta.corretto, true);
    assert.equal(corretta.name, 'Rossi Mario');
    assert.equal(corretta.serve.ace, 3);
    assert.equal(corretta.points, tab.teams[1].players[0].points + 2);
    assert.equal(tabellino.teams[1].totals.serve.ace, tab.teams[1].totals.serve.ace + 2);
    assert.equal(tabellino.teams[1].totals.points, 70, 'i punti di squadra restano quelli della Lega');
    assert.equal(tab.teams[1].players[0].serve.ace, 1, 'il tabellino originale non cambia');
    assert.deepEqual(inutilizzate, []);
});

test('la correzione cambia il punteggio del giocatore', () => {
    const tab = tabellinoDiProva();
    const prima = P.punteggiGiornata(tab, listone).punti.rossi.fp;
    const stats = C.numeri(tab.teams[1].players[0]);
    stats.att.kills += 3;
    stats.att.tot += 3;
    const { tabellino, forzati } = C.applicaCorrezioni(tab, { '1|Rossi Mario': { stats } });
    const dopo = P.punteggiGiornata(tabellino, listone, {}, forzati).punti.rossi;
    assert.ok(dopo.fp > prima, `${dopo.fp} non è più alto di ${prima}`);
    assert.equal(dopo.corretto, true);
});

test('abbinamento a mano: nome non trovato, riga che non conta, giocatore inesistente', () => {
    const tab = tabellinoDiProva();
    const senza = P.punteggiGiornata(tab, listone);
    assert.deepEqual(senza.nonTrovati, ['Neri Ugo (Ospiti)']);

    const { tabellino, forzati } = C.applicaCorrezioni(tab, { '2|Neri Ugo': { id: 'gialli' }, '1|Bianchi Luca': { id: null } });
    const con = P.punteggiGiornata(tabellino, listone, {}, forzati);
    assert.deepEqual(con.nonTrovati, []);
    assert.equal(con.punti.gialli.nomeTabellino, 'Neri Ugo');
    assert.equal(con.punti.gialli.corretto, true);
    assert.equal(con.punti.bianchi, undefined, 'la riga esclusa non dà punti a nessuno');

    const sbagliato = C.applicaCorrezioni(tab, { '2|Neri Ugo': { id: 'non-esiste' } });
    assert.deepEqual(P.punteggiGiornata(sbagliato.tabellino, listone, {}, sbagliato.forzati).nonTrovati, ['Neri Ugo (Ospiti)']);
});

test("una correzione la cui riga non c'è più nel tabellino viene segnalata e non usata", () => {
    const { inutilizzate, forzati } = C.applicaCorrezioni(tabellinoDiProva(), { '1|Rossi M.': { id: 'rossi' } });
    assert.deepEqual(inutilizzate, ['1|Rossi M.']);
    assert.deepEqual(forzati, {});
});

test('numeri non validi o incoerenti vengono rifiutati', () => {
    const buoni = C.numeri(riga('X'));
    assert.deepEqual(C.validaStatistiche(buoni), []);
    assert.ok(C.validaStatistiche({ ...buoni, set: 6 }).length);
    assert.ok(C.validaStatistiche({ ...buoni, set: 2.5 }).length);
    assert.ok(C.validaStatistiche({ ...buoni, serve: { tot: 1, ace: 1, err: 1 } }).length);
    assert.ok(C.validaStatistiche({ ...buoni, att: { tot: 3, kills: 2, err: 1, blocked: 1 } }).length);
    assert.ok(C.validaStatistiche({ ...buoni, rec: { tot: 2, perf: 1, neg: 1, err: 1 } }).length);
    assert.ok(C.validaStatistiche({ ...buoni, block: { pts: -1 } }).length);
    assert.ok(C.stessiNumeri(buoni, riga('X')));
    assert.ok(!C.stessiNumeri({ ...buoni, block: { pts: 9 } }, riga('X')));
});
