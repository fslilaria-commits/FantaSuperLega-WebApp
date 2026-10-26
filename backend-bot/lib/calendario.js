const cheerio = require('cheerio');
const { nomeDi } = require('../../frontend/js/stagione');
const { scaricaPagina } = require('./rete');

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// Ora italiana (Europe/Rome, con ora legale) -> Date in UTC
function romeToUtc(year, month, day, hour, minute) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    let utc = wanted;
    for (let i = 0; i < 2; i++) {
        const p = Object.fromEntries(fmt.formatToParts(new Date(utc)).map(x => [x.type, x.value]));
        const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
        utc += wanted - shown;
    }
    return new Date(utc);
}

// "Sabato 17/10/2026 Ore 18:00" -> Date; null se manca
function parseDataGara(text) {
    const m = String(text).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})[:.](\d{2})/);
    return m ? romeToUtc(+m[3], +m[2], +m[1], +m[4], +m[5]) : null;
}

// "- Domenica 18 Ottobre 2026 Ore 18:00" -> Date; null se manca
function parseDataGiornata(text) {
    const m = String(text).toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4}).*?(\d{1,2})[:.](\d{2})/);
    if (!m || !MESI.includes(m[2])) return null;
    return romeToUtc(+m[3], MESI.indexOf(m[2]) + 1, +m[1], +m[4], +m[5]);
}

// Estrae le giornate di una fase (1 = andata, 2 = ritorno) dalla pagina calendario della Lega;
// numeroSquadre: quante sono, per numerare il ritorno dopo l'andata (12 squadre: il ritorno parte dalla giornata 12)
function parseCalendario(html, fase, numeroSquadre) {
    const $ = cheerio.load(html);
    const giornate = [];
    let corrente = null;

    $('tr').each((_, tr) => {
        const row = $(tr);
        const head = row.find('span').first().text();
        const mHead = head.match(/(\d+)\D{0,3}\s*Giornata\s+(Andata|Ritorno)(.*)$/i);
        if (mHead && row.find('td[colspan]').length) {
            const legaId = (row.html().match(/RiposoSquadra\s+(\d+)/) || [])[1];
            const n = parseInt(mHead[1], 10);
            corrente = {
                number: (fase - 1) * (numeroSquadre - 1) + n,
                label: `${n}ª ${mHead[2]}`,
                legaId: legaId ? parseInt(legaId, 10) : null,
                nominalStart: parseDataGiornata(mHead[3]),
                matches: [],
            };
            giornate.push(corrente);
            return;
        }
        if (!corrente || !row.hasClass('tab-gara')) return;

        const cells = row.find('td');
        const squadre = row.find('td.DettaglioCal');
        const teamId = el => parseInt((($(el).attr('onclick') || '').match(/\/team\/(\d+)/) || [])[1], 10) || null;
        const matchId = (row.find('a[href*="/match/"]').attr('href') || '').match(/\/match\/(\d+)/);
        corrente.matches.push({
            home: $(squadre[0]).text().trim(),
            homeId: teamId(squadre[0]),
            away: $(squadre[1]).text().trim(),
            awayId: teamId(squadre[1]),
            start: parseDataGara($(cells[1]).text()),
            matchId: matchId ? parseInt(matchId[1], 10) : null,
            score: row.find('td.DettaglioRisCal').text().trim(),
        });
    });

    return giornate.map(g => {
        // Una gara anticipata o rinviata lontano dalla sua giornata è "spostata": non conta per la
        // scadenza e (come nel FantaLVF) i suoi giocatori prenderanno il punteggio medio
        const matches = g.matches.map(m => ({ ...m, moved: isMoved(m.start, g.nominalStart) }));
        const inGiornata = matches.filter(m => !m.moved);
        const orari = inGiornata.map(m => m.start).filter(Boolean);
        const provisional = orari.length < inGiornata.length;
        const first = [...orari, ...(provisional && g.nominalStart ? [g.nominalStart] : [])]
            .reduce((a, b) => (a && a < b ? a : b), null);
        return {
            number: g.number,
            label: g.label,
            legaId: g.legaId,
            // La formazione si blocca 1 minuto prima della prima partita della giornata
            lockAt: first ? new Date(first.getTime() - 60 * 1000).toISOString() : null,
            provisional,
            matches: matches.map(m => ({ ...m, start: m.start ? m.start.toISOString() : null })),
        };
    });
}

const GIORNO = 24 * 3600 * 1000;
const FINESTRA_PRIMA = 4 * GIORNO; // anticipi fino a 4 giorni prima della data della giornata
const FINESTRA_DOPO = 3 * GIORNO; // posticipi fino a 3 giorni dopo

function isMoved(start, nominalStart) {
    if (!start || !nominalStart) return false;
    return start < nominalStart - FINESTRA_PRIMA || start > nominalStart.getTime() + FINESTRA_DOPO;
}

// Controlli prima di accettare il calendario. squadre: quelle della stagione (data/stagione.json)
function checkCalendario(giornate, squadre) {
    const errors = [];
    const giornateAttese = 2 * (squadre.length - 1);
    const gareAttese = squadre.length / 2;
    const ids = new Set(squadre.map(s => s.teamId));
    if (giornate.length !== giornateAttese) errors.push(`trovate ${giornate.length} giornate invece di ${giornateAttese}`);
    for (const g of giornate) {
        if (g.matches.length !== gareAttese) errors.push(`giornata ${g.number}: ${g.matches.length} gare invece di ${gareAttese}`);
        if (!g.lockAt) errors.push(`giornata ${g.number}: manca qualsiasi data`);
        if (!g.legaId) errors.push(`giornata ${g.number}: manca il codice della Lega`);
        const inCampo = g.matches.flatMap(m => [m.homeId, m.awayId]);
        if (new Set(inCampo).size !== inCampo.length || inCampo.includes(null)) errors.push(`giornata ${g.number}: squadre mancanti o ripetute`);
        else if (inCampo.some(id => !ids.has(id))) errors.push(`giornata ${g.number}: squadre che non sono in data/stagione.json`);
    }
    return errors;
}

// Pagina calendario della Lega. Senza parametri mostra la stagione in corso per la Lega; con anno e codice del
// campionato (cambia ogni stagione: 999 è la regular season 2026/27) mostra proprio quello
const URL_CALENDARIO = 'https://www.legavolley.it/calendario/';
const urlCalendario = ({ anno, campionato }, fase = 1) => `${URL_CALENDARIO}?Anno=${anno}&IdCampionato=${campionato}&IdFase=${fase}&IdSquadra=0`;

// Le voci di un menu a tendina della pagina calendario (Anno, Campionato, Squadra): [{ valore, testo, scelta }]
function vociMenu($, id) {
    return $(`select#${id} option`).map((_, o) => ({
        valore: $(o).attr('value'),
        testo: $(o).text().trim(),
        scelta: $(o).attr('selected') != null,
    })).get();
}

// Anno e campionato che una pagina calendario sta mostrando davvero (null se nel menu non c'è una voce scelta)
function calendarioMostrato(html) {
    const $ = typeof html === 'string' ? cheerio.load(html) : html;
    const scelto = id => parseInt(vociMenu($, id).find(v => v.scelta)?.valore, 10);
    const [anno, campionato] = [scelto('Anno'), scelto('Campionato')];
    return { anno: Number.isInteger(anno) ? anno : null, campionato: Number.isInteger(campionato) ? campionato : null };
}

// Andata e ritorno della stagione di data/stagione.json, con i risultati delle gare giocate (campo score).
// Si ferma se la Lega mostra un'altra stagione: i dati di due stagioni non si mescolano mai
async function scaricaCalendario(stagione) {
    const giornate = [];
    for (const fase of [1, 2]) {
        const pagina = await scaricaPagina(urlCalendario(stagione, fase)).catch(e => { throw new Error(`calendario fase ${fase}: ${e.message}`); });
        const mostrato = calendarioMostrato(pagina);
        if (mostrato.anno !== stagione.anno || mostrato.campionato !== stagione.campionato) {
            throw new Error(`calendario fase ${fase}: la Lega ha mostrato un calendario diverso da quello della stagione ${nomeDi(stagione.anno)} (anno ${mostrato.anno}, campionato ${mostrato.campionato} invece di ${stagione.campionato})`);
        }
        giornate.push(...parseCalendario(pagina, fase, stagione.squadre.length));
    }
    return giornate;
}

module.exports = {
    romeToUtc, parseDataGara, parseDataGiornata, parseCalendario, checkCalendario,
    URL_CALENDARIO, urlCalendario, vociMenu, calendarioMostrato, scaricaCalendario,
};
