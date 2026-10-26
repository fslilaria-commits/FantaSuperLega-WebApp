const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    parseStagioneLega, parseSquadre, confrontaStagione, preparaStagione, stagioneDeiDati,
} = require('../lib/stagione');
const { URL_CALENDARIO, urlCalendario } = require('../lib/calendario');

// Pagine finte con i menu a tendina come sul sito della Lega
const menu = (id, voci, scelta) => `<select id="${id}" name="ComboBOX">
    ${voci.map(([valore, testo]) => `<option ${String(valore) === String(scelta) ? 'selected="" ' : ''}value="${valore}">${testo}</option>`).join('\n')}
</select>`;
const paginaCalendario = ({ anno, campionati, scelto, squadre }) => `<html><body>
    ${menu('Anno', [anno + 1, anno, anno - 1].map(a => [a, `${a}/${a + 1}`]), anno)}
    ${menu('Campionato', campionati, scelto)}
    ${menu('Squadra', [[0, ' Tutte '], ...squadre.map(s => [s.teamId, s.team])], 0)}
</body></html>`;
const SQUADRE_2026 = [
    { teamId: 6858, team: 'Allianz Milano' },
    { teamId: 6862, team: 'Itas Trentino' },
    { teamId: 6865, team: 'Sir Susa Scai Perugia' },
    { teamId: 6897, team: 'Tinet Prata di Pordenone' },
];
// L'anno dopo cambiano gli id delle squadre, il codice del campionato e qualche nome (sponsor)
const SQUADRE_2027 = [
    { teamId: 7001, team: 'Milano Volley' },
    { teamId: 7002, team: 'Itas Trentino' },
    { teamId: 7003, team: 'Sir Perugia' },
    { teamId: 7004, team: 'Yuasa Grottazzolina' },
];

// Il sito della Lega finto. stagioni: { anno: { campionato (null: regular season non ancora pubblicata), squadre } };
// corrente: la stagione che mostra la pagina calendario senza parametri
function sitoLega(corrente, stagioni) {
    const pagine = new Map();
    for (const [chiave, s] of Object.entries(stagioni)) {
        const anno = Number(chiave);
        const campionati = [...(s.campionato ? [[s.campionato, 'Regular Season SuperLega Credem Banca']] : []), [anno - 1000, 'Del Monte Supercoppa']];
        const generale = paginaCalendario({ anno, campionati, scelto: campionati[0][0], squadre: s.campionato ? s.squadre : [] });
        pagine.set(`${URL_CALENDARIO}?Anno=${anno}`, generale);
        if (anno === corrente) pagine.set(URL_CALENDARIO, generale);
        if (s.campionato) pagine.set(urlCalendario({ anno, campionato: s.campionato }), paginaCalendario({ anno, campionati, scelto: s.campionato, squadre: s.squadre }));
    }
    const richieste = [];
    const scarica = async url => {
        richieste.push(url);
        if (!pagine.has(url)) throw new Error(`HTTP 404 per ${url}`);
        return pagine.get(url);
    };
    return { scarica, richieste };
}

const STAGIONE_2026 = { campionato: 999, squadre: SQUADRE_2026 };
const STAGIONE_2027 = { campionato: 1050, squadre: SQUADRE_2027 };

// Cartella data/ finta con le proposte di una stagione; stagione: il contenuto di stagione.json (null: manca)
function cartellaDati(stagione) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsl-dati-'));
    if (stagione != null) fs.writeFileSync(path.join(dir, 'stagione.json'), JSON.stringify(stagione, null, 2) + '\n');
    fs.writeFileSync(path.join(dir, 'players.json'), '[]');
    fs.writeFileSync(path.join(dir, 'calendario.json'), '[]');
    fs.mkdirSync(path.join(dir, 'tabellini'));
    fs.writeFileSync(path.join(dir, 'tabellini', '1.json'), '{}');
    return dir;
}
const esiste = (dir, nome) => fs.existsSync(path.join(dir, nome));
const proposteIntatte = dir => esiste(dir, 'players.json') && esiste(dir, 'calendario.json') && esiste(dir, 'tabellini/1.json');
const letta = dir => JSON.parse(fs.readFileSync(path.join(dir, 'stagione.json'), 'utf8'));
const datiCompleti = (anno, { campionato, squadre }) => ({ anno, campionato, squadre });

test('la pagina calendario dice la stagione della Lega e il codice della sua regular season', () => {
    const html = paginaCalendario({ anno: 2026, campionati: [[999, 'Regular Season SuperLega'], [1004, 'Del Monte Supercoppa']], scelto: 1004, squadre: [] });
    assert.deepEqual(parseStagioneLega(html), { anno: 2026, campionato: 999 });
    const senza = paginaCalendario({ anno: 2027, campionati: [[1060, 'Del Monte Supercoppa']], scelto: 1060, squadre: [] });
    assert.deepEqual(parseStagioneLega(senza), { anno: 2027, campionato: null });
    assert.throws(() => parseStagioneLega('<p>Just a moment...</p>'), /non si trova la stagione/);
});

test('le squadre si leggono solo dal calendario della regular season chiesta', () => {
    const campionati = [[999, 'Regular Season SuperLega']];
    const html = paginaCalendario({ anno: 2026, campionati, scelto: 999, squadre: SQUADRE_2026 });
    assert.deepEqual(parseSquadre(html, { anno: 2026, campionato: 999 }).map(s => s.teamId), [6858, 6862, 6865, 6897]);
    assert.equal(parseSquadre(html, { anno: 2026, campionato: 999 })[1].team, 'Itas Trentino');
    assert.throws(() => parseSquadre(html, { anno: 2027, campionato: 999 }), /diverso/);
});

test('confronto tra la stagione dei dati e quella della Lega', () => {
    assert.equal(confrontaStagione(null, 2026), 'inizia');
    assert.equal(confrontaStagione(2026, 2026), 'uguale');
    assert.equal(confrontaStagione(2026, 2027), 'nuova');
    assert.throws(() => confrontaStagione(2027, 2026), /mostra la stagione 2026\/27, ma i dati sono già della 2027\/28/);
    assert.throws(() => confrontaStagione('2026', 2026), /anno non valido/);
});

test('prima volta: si scrivono stagione, campionato e squadre senza togliere niente', async () => {
    const dir = cartellaDati(null);
    const { esito, cambiata } = await preparaStagione(dir, sitoLega(2026, { 2026: STAGIONE_2026 }).scarica);
    assert.equal(esito, 'inizia');
    assert.ok(cambiata);
    assert.ok(proposteIntatte(dir));
    assert.deepEqual(letta(dir), datiCompleti(2026, STAGIONE_2026));
});

test('dal vecchio stagione.json con il solo anno si passa a quello completo, senza togliere niente', async () => {
    const dir = cartellaDati({ anno: 2026 });
    const { esito, cambiata } = await preparaStagione(dir, sitoLega(2026, { 2026: STAGIONE_2026 }).scarica);
    assert.equal(esito, 'uguale');
    assert.ok(cambiata);
    assert.ok(proposteIntatte(dir));
    assert.deepEqual(letta(dir), datiCompleti(2026, STAGIONE_2026));
});

test('stessa stagione già completa: niente cambia, bastano le due pagine calendario', async () => {
    const dir = cartellaDati(datiCompleti(2026, STAGIONE_2026));
    const sito = sitoLega(2026, { 2026: STAGIONE_2026 });
    const { esito, cambiata } = await preparaStagione(dir, sito.scarica);
    assert.equal(esito, 'uguale');
    assert.equal(cambiata, false);
    assert.ok(proposteIntatte(dir));
    assert.equal(sito.richieste.length, 2, 'solo le due pagine calendario');
});

test('stagione.json con i vecchi codici delle statistiche: si riscrive senza, senza togliere niente', async () => {
    const dir = cartellaDati({ ...datiCompleti(2026, STAGIONE_2026), squadre: STAGIONE_2026.squadre.map(x => ({ ...x, codiceStatistiche: 'X' + x.teamId })) });
    const { esito, cambiata } = await preparaStagione(dir, sitoLega(2026, { 2026: STAGIONE_2026 }).scarica);
    assert.equal(esito, 'uguale');
    assert.ok(cambiata);
    assert.ok(proposteIntatte(dir));
    assert.deepEqual(letta(dir), datiCompleti(2026, STAGIONE_2026));
});

test('stagione.json con gli a capo di Windows ma stesso contenuto: niente cambia', async () => {
    const dir = cartellaDati(null);
    fs.writeFileSync(path.join(dir, 'stagione.json'), JSON.stringify(datiCompleti(2026, STAGIONE_2026), null, 2).replace(/\n/g, '\r\n') + '\r\n');
    const { cambiata } = await preparaStagione(dir, sitoLega(2026, { 2026: STAGIONE_2026 }).scarica);
    assert.equal(cambiata, false);
});

test('la Lega passa alla stagione nuova: via le proposte di quella finita, squadre nuove', async () => {
    const dir = cartellaDati(datiCompleti(2026, STAGIONE_2026));
    const { esito } = await preparaStagione(dir, sitoLega(2027, { 2026: STAGIONE_2026, 2027: STAGIONE_2027 }).scarica);
    assert.equal(esito, 'nuova');
    for (const nome of ['players.json', 'calendario.json', 'tabellini']) assert.ok(!esiste(dir, nome), `${nome} doveva sparire`);
    assert.deepEqual(letta(dir), datiCompleti(2027, STAGIONE_2027));
});

test('stagione nuova annunciata senza regular season: si resta a quella di prima', async () => {
    const dir = cartellaDati(datiCompleti(2026, STAGIONE_2026));
    const { esito, avviso, stagione } = await preparaStagione(dir, sitoLega(2027, { 2026: STAGIONE_2026, 2027: { campionato: null, squadre: [] } }).scarica);
    assert.equal(esito, 'attesa');
    assert.match(avviso, /già la stagione 2027\/28, ma manca ancora la regular season: si resta alla 2026\/27/);
    assert.equal(stagione.anno, 2026);
    assert.ok(proposteIntatte(dir));
    assert.deepEqual(letta(dir), datiCompleti(2026, STAGIONE_2026));
});

test('stagione nuova annunciata e stagione.json vecchio: si completa quello della stagione in corso', async () => {
    const dir = cartellaDati({ anno: 2026 });
    const { esito } = await preparaStagione(dir, sitoLega(2027, { 2026: STAGIONE_2026, 2027: { campionato: null, squadre: [] } }).scarica);
    assert.equal(esito, 'uguale');
    assert.ok(proposteIntatte(dir));
    assert.deepEqual(letta(dir), datiCompleti(2026, STAGIONE_2026));
});

test('la Lega mostra una stagione precedente ai dati: si ferma senza toccare niente', async () => {
    const dir = cartellaDati(datiCompleti(2027, STAGIONE_2027));
    await assert.rejects(preparaStagione(dir, sitoLega(2026, { 2026: STAGIONE_2026 }).scarica), /ma i dati sono già della 2027\/28/);
    assert.ok(proposteIntatte(dir));
    assert.equal(letta(dir).anno, 2027);
});

test('numero dispari di squadre: si ferma', async () => {
    const dispari = sitoLega(2026, { 2026: { campionato: 999, squadre: [...SQUADRE_2026, { teamId: 6899, team: 'Altra' }] } });
    await assert.rejects(preparaStagione(cartellaDati(null), dispari.scarica), /5 squadre, un numero dispari/);
});

test('gli scaricamenti partono solo con stagione.json completo', () => {
    assert.throws(() => stagioneDeiDati(cartellaDati(null)), /prepara-stagione/);
    assert.throws(() => stagioneDeiDati(cartellaDati({ anno: 2026 })), /incompleto/);
    assert.equal(stagioneDeiDati(cartellaDati(datiCompleti(2026, STAGIONE_2026))).campionato, 999);
});
