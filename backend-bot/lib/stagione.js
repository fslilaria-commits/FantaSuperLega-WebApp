// Stagione dei dati in data/stagione.json. Non la decide il codice ma la Lega: a ogni aggiornamento il bot guarda
// quale stagione mostra il calendario sul sito della Lega e ne ricava
// - l'anno (2026 = stagione 2026/27) e il codice della sua regular season (campionato: cambia ogni anno);
// - le squadre: id della loro pagina sul sito (cambia ogni anno) e nome.
// Listone, calendario e tabellini scaricano solo questa stagione. Quando la Lega passa alla stagione nuova, le
// proposte di quella finita si tolgono prima di scaricare le nuove: il controllo "spariscono troppi giocatori"
// fermerebbe il listone nuovo, e i tabellini dell'anno prima hanno gli stessi numeri di giornata di quelli nuovi.
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { nomeDi } = require('../../frontend/js/stagione');
const { URL_CALENDARIO, urlCalendario, vociMenu, calendarioMostrato } = require('./calendario');
const { scaricaPagina } = require('./rete');

const DATA = path.join(__dirname, '..', '..', 'data');
const FILE_STAGIONE = 'stagione.json';
const DA_TOGLIERE = ['players.json', 'calendario.json', 'tabellini'];
const MIN_SQUADRE = 4;

function leggiStagioneDati(dir = DATA) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, FILE_STAGIONE), 'utf8'));
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
}

const completa = s => Number.isInteger(s?.anno) && Number.isInteger(s.campionato) && Array.isArray(s.squadre) && s.squadre.length > 0;

// La stagione per gli scaricamenti: si ferma se prepara-stagione non l'ha ancora scritta per intero
function stagioneDeiDati(dir = DATA) {
    const s = leggiStagioneDati(dir);
    if (!completa(s)) throw new Error(`data/${FILE_STAGIONE} manca o è incompleto: prima va lanciato npm run prepara-stagione`);
    return s;
}

// Dalla pagina calendario della Lega: la stagione che mostra e il codice della sua regular season di SuperLega
// (null se la Lega non l'ha ancora pubblicata, per esempio in estate appena annunciata la stagione nuova)
function parseStagioneLega(html) {
    const $ = cheerio.load(html);
    const { anno } = calendarioMostrato($);
    if (anno == null) throw new Error('nella pagina calendario della Lega non si trova la stagione: la pagina potrebbe essere cambiata');
    const regular = vociMenu($, 'Campionato').filter(v => /regular season superlega/i.test(v.testo));
    if (regular.length > 1) throw new Error(`nel calendario ${nomeDi(anno)} della Lega ci sono più regular season di SuperLega (${regular.map(v => v.testo).join(', ')})`);
    const campionato = parseInt(regular[0]?.valore, 10);
    return { anno, campionato: Number.isInteger(campionato) ? campionato : null };
}

// Dalla pagina calendario della regular season: le squadre della stagione, con l'id della loro pagina e il nome
function parseSquadre(html, stagione) {
    const $ = cheerio.load(html);
    const mostrato = calendarioMostrato($);
    if (mostrato.anno !== stagione.anno || mostrato.campionato !== stagione.campionato) {
        throw new Error(`la Lega ha mostrato un calendario diverso dalla regular season ${nomeDi(stagione.anno)}`);
    }
    const squadre = vociMenu($, 'Squadra')
        .map(v => ({ teamId: parseInt(v.valore, 10), team: v.testo }))
        .filter(s => s.teamId > 0 && s.team);
    if (new Set(squadre.map(s => s.teamId)).size !== squadre.length) throw new Error(`squadre ripetute nel calendario ${nomeDi(stagione.anno)} della Lega`);
    return squadre;
}

// 'inizia' se data/stagione.json manca, 'nuova' se la Lega è passata a una stagione successiva, 'uguale' se è la
// stessa; errore se la Lega mostra una stagione precedente a quella dei dati
function confrontaStagione(annoDati, annoLega) {
    if (annoDati == null) return 'inizia';
    if (!Number.isInteger(annoDati)) throw new Error(`data/${FILE_STAGIONE}: anno non valido (${annoDati})`);
    if (annoLega < annoDati) throw new Error(`il sito della Lega mostra la stagione ${nomeDi(annoLega)}, ma i dati sono già della ${nomeDi(annoDati)}: niente è stato toccato`);
    return annoLega > annoDati ? 'nuova' : 'uguale';
}

// La stagione come la mostra la Lega (anno null: quella in corso per la Lega) con le sue squadre.
// manca: che cosa la Lega non ha ancora pubblicato (la regular season o le squadre), se manca qualcosa
async function leggiStagione(anno, scarica) {
    const pagina = await scarica(anno == null ? URL_CALENDARIO : `${URL_CALENDARIO}?Anno=${anno}`);
    const lega = parseStagioneLega(pagina);
    if (anno != null && lega.anno !== anno) throw new Error(`la Lega ha mostrato la stagione ${nomeDi(lega.anno)} invece della ${nomeDi(anno)}`);
    if (lega.campionato == null) return { ...lega, squadre: [], manca: 'la regular season' };
    const squadre = parseSquadre(await scarica(urlCalendario(lega)), lega);
    if (squadre.length < MIN_SQUADRE) return { ...lega, squadre, manca: `l'elenco delle squadre (${squadre.length} nel calendario)` };
    if (squadre.length % 2) throw new Error(`stagione ${nomeDi(lega.anno)}: ${squadre.length} squadre, un numero dispari che il gioco non gestisce (ogni giornata una squadra riposerebbe)`);
    return { ...lega, squadre };
}

// Prepara data/ per la stagione che mostra la Lega. Restituisce { esito, stagione, cambiata, avviso }; esito è
// 'inizia', 'nuova', 'uguale' oppure 'attesa': la Lega ha annunciato la stagione nuova ma non ha ancora pubblicato
// regular season o squadre, quindi i dati restano a quella di prima. scarica: per i test, al posto del sito vero
async function preparaStagione(dir = DATA, scarica = scaricaPagina) {
    const dati = leggiStagioneDati(dir);
    let lega = await leggiStagione(null, scarica);
    let esito = confrontaStagione(dati?.anno ?? null, lega.anno);
    let avviso = null;
    if (lega.manca) {
        if (esito !== 'nuova') throw new Error(`nel calendario ${nomeDi(lega.anno)} della Lega manca ${lega.manca}: la pagina potrebbe essere cambiata`);
        avviso = `la Lega mostra già la stagione ${nomeDi(lega.anno)}, ma manca ancora ${lega.manca}: si resta alla ${nomeDi(dati.anno)}`;
        if (completa(dati)) return { esito: 'attesa', stagione: dati, cambiata: false, avviso };
        lega = await leggiStagione(dati.anno, scarica);
        if (lega.manca) throw new Error(`nel calendario ${nomeDi(lega.anno)} della Lega manca ${lega.manca}`);
        esito = 'uguale';
    }

    const stagione = { anno: lega.anno, campionato: lega.campionato, squadre: lega.squadre };
    if (esito === 'nuova') {
        for (const nome of DA_TOGLIERE) fs.rmSync(path.join(dir, nome), { recursive: true, force: true });
    }
    // Si confronta il contenuto, non il testo: su Windows il file può avere gli a capo \r\n
    const cambiata = JSON.stringify(dati) !== JSON.stringify(stagione);
    if (cambiata) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, FILE_STAGIONE), JSON.stringify(stagione, null, 2) + '\n');
    }
    return { esito, stagione, cambiata, avviso };
}

module.exports = {
    DA_TOGLIERE, leggiStagioneDati, stagioneDeiDati, parseStagioneLega, parseSquadre, confrontaStagione, preparaStagione,
};
