const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    parseStagioneLega, parseSquadre, parseCodiceStatistiche, confrontaStagione, preparaStagione, stagioneDeiDati,
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
const paginaSquadra = (codice, anno) => `<div class="team">
    <a href="https://ww2.legavolley.it/Statistiche_i.asp?cmd=no_combo2&amp;Fase=100&amp;TipoStat=1.2&amp;AnnoInizio=1945&amp;Serie=1&amp;Giornata=0&amp;Squadra=${codice}">Statistiche per Giornata ${anno}/${anno + 1}</a>
    <a href="https://ww2.legavolley.it/Statistiche_i.asp?cmd=no_combo2&amp;Fase=100&amp;TipoStat=1.3&amp;AnnoInizio=1945&amp;AnnoFine=${anno}&amp;Serie=1&amp;Squadra=${codice}">Statistiche per Anno</a>
</div>`;

const SQUADRE_2026 = [
    { teamId: 6858, team: 'Allianz Milano', codice: 'MI-POWER' },
    { teamId: 6862, team: 'Itas Trentino', codice: 'TN-ITAS' },
    { teamId: 6865, team: 'Sir Susa Scai Perugia', codice: 'BASTIA' },
    { teamId: 6897, team: 'Tinet Prata di Pordenone', codice: 'PRATA' },
];
// L'anno dopo cambiano gli id delle squadre, il codice del campionato e qualche nome (sponsor)
const SQUADRE_2027 = [
    { teamId: 7001, team: 'Milano Volley', codice: 'MI-POWER' },
    { teamId: 7002, team: 'Itas Trentino', codice: 'TN-ITAS' },
    { teamId: 7003, team: 'Sir Perugia', codice: 'BASTIA' },
    { teamId: 7004, team: 'Yuasa Grottazzolina', codice: 'APG' },
];

// Il sito della Lega finto. stagioni: { anno: { campionato (null: regular season non ancora pubblicata), squadre,
// senzaCodici } }; corrente: la stagione che mostra la pagina calendario senza parametri
function sitoLega(corrente, stagioni) {
    const pagine = new Map();
    for (const [chiave, s] of Object.entries(stagioni)) {
        const anno = Number(chiave);
        const campionati = [...(s.campionato ? [[s.campionato, 'Regular Season SuperLega Credem Banca']] : []), [anno - 1000, 'Del Monte Supercoppa']];
        const generale = paginaCalendario({ anno, campionati, scelto: campionati[0][0], squadre: s.campionato ? s.squadre : [] });
        pagine.set(`${URL_CALENDARIO}?Anno=${anno}`, generale);
        if (anno === corrente) pagine.set(URL_CALENDARIO, generale);
        if (s.campionato) pagine.set(urlCalendario({ anno, campionato: s.campionato }), paginaCalendario({ anno, campionati, scelto: s.campionato, squadre: s.squadre }));
        for (const sq of s.squadre) pagine.set(`https://www.legavolley.it/team/${sq.teamId}`, s.senzaCodici ? '<p>Rosa</p>' : paginaSquadra(sq.codice, anno));
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
const conCodici = squadre => squadre.map(({ codice, ...s }) => ({ ...s, codiceStatistiche: codice }));
const datiCompleti = (anno, { campionato, squadre }) => ({ anno, campionato, squadre: conCodici(squadre) });

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

test('il codice delle statistiche viene dal link della stagione nella pagina della squadra', () => {
    assert.equal(parseCodiceStatistiche(paginaSquadra('TN-ITAS', 2026), 2026), 'TN-ITAS');
    assert.equal(parseCodiceStatistiche(paginaSquadra('TN-ITAS', 2025), 2026), null, 'link di un\'altra stagione');
    assert.equal(parseCodiceStatistiche('<p>Rosa</p>', 2026), null);
});

test('confronto tra la stagione dei dati e quella della Lega', () => {
    assert.equal(confrontaStagione(null, 2026), 'inizia');
    assert.equal(confrontaStagione(2026, 2026), 'uguale');
    assert.equal(confrontaStagione(2026, 2027), 'nuova');
    assert.throws(() => confrontaStagione(2027, 2026), /mostra la stagione 2026\/27, ma i dati sono già della 2027\/28/);
    assert.throws(() => confrontaStagione('2026', 2026), /anno non valido/);
});

test('prima volta: si scrivono stagione, campionato, squadre e codici senza togliere niente', async () => {
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

test('stessa stagione già completa: niente cambia e le pagine delle squadre non si riscaricano', async () => {
    const dir = cartellaDati(datiCompleti(2026, STAGIONE_2026));
    const sito = sitoLega(2026, { 2026: STAGIONE_2026 });
    const { esito, cambiata } = await preparaStagione(dir, sito.scarica);
    assert.equal(esito, 'uguale');
    assert.equal(cambiata, false);
    assert.ok(proposteIntatte(dir));
    assert.equal(sito.richieste.length, 2, 'solo le due pagine calendario');
});

test('la Lega passa alla stagione nuova: via le proposte di quella finita, squadre e codici nuovi', async () => {
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

test('codici delle statistiche non ancora pubblicati: restano vuoti e si cercano di nuovo al giro dopo', async () => {
    const dir = cartellaDati(null);
    await preparaStagione(dir, sitoLega(2026, { 2026: { ...STAGIONE_2026, senzaCodici: true } }).scarica);
    assert.ok(letta(dir).squadre.every(s => s.codiceStatistiche === null));
    assert.throws(() => require('../lib/tabellini').urlStatistiche(letta(dir), 8485, 6862), /Itas Trentino: manca il codice/);
    const { esito, cambiata } = await preparaStagione(dir, sitoLega(2026, { 2026: STAGIONE_2026 }).scarica);
    assert.equal(esito, 'uguale');
    assert.ok(cambiata);
    assert.deepEqual(letta(dir), datiCompleti(2026, STAGIONE_2026));
});

test('numero dispari di squadre o stesso codice per due squadre: si ferma', async () => {
    const dispari = sitoLega(2026, { 2026: { campionato: 999, squadre: [...SQUADRE_2026, { teamId: 6899, team: 'Altra', codice: 'ALT' }] } });
    await assert.rejects(preparaStagione(cartellaDati(null), dispari.scarica), /5 squadre, un numero dispari/);
    const doppio = sitoLega(2026, { 2026: { campionato: 999, squadre: SQUADRE_2026.map(s => ({ ...s, codice: 'MO' })) } });
    await assert.rejects(preparaStagione(cartellaDati(null), doppio.scarica), /stesso codice/);
});

test('gli scaricamenti partono solo con stagione.json completo', () => {
    assert.throws(() => stagioneDeiDati(cartellaDati(null)), /prepara-stagione/);
    assert.throws(() => stagioneDeiDati(cartellaDati({ anno: 2026 })), /incompleto/);
    assert.equal(stagioneDeiDati(cartellaDati(datiCompleti(2026, STAGIONE_2026))).campionato, 999);
});
