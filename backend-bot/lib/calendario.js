const cheerio = require('cheerio');

const GIORNATE_PER_FASE = 11;
const GARE_PER_GIORNATA = 6;
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

// Estrae le giornate di una fase (1 = andata, 2 = ritorno) dalla pagina calendario della Lega
function parseCalendario(html, fase) {
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
                number: (fase - 1) * GIORNATE_PER_FASE + n,
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

// Controlli prima di accettare il calendario
function checkCalendario(giornate) {
    const errors = [];
    if (giornate.length !== 2 * GIORNATE_PER_FASE) errors.push(`trovate ${giornate.length} giornate invece di ${2 * GIORNATE_PER_FASE}`);
    for (const g of giornate) {
        if (g.matches.length !== GARE_PER_GIORNATA) errors.push(`giornata ${g.number}: ${g.matches.length} gare invece di ${GARE_PER_GIORNATA}`);
        if (!g.lockAt) errors.push(`giornata ${g.number}: manca qualsiasi data`);
        if (!g.legaId) errors.push(`giornata ${g.number}: manca il codice della Lega`);
        const squadre = g.matches.flatMap(m => [m.homeId, m.awayId]);
        if (new Set(squadre).size !== squadre.length || squadre.includes(null)) errors.push(`giornata ${g.number}: squadre mancanti o ripetute`);
    }
    return errors;
}

const URL_CALENDARIO = fase => `https://www.legavolley.it/calendario/?Anno=2026&IdCampionato=999&IdFase=${fase}&IdSquadra=0`;

// Andata e ritorno dal sito della Lega, con i risultati delle gare giocate (campo score)
async function scaricaCalendario() {
    const giornate = [];
    for (const fase of [1, 2]) {
        const res = await fetch(URL_CALENDARIO(fase), { headers: { 'User-Agent': 'Mozilla/5.0 (FantaSuperLega calendario)' } });
        if (!res.ok) throw new Error(`calendario fase ${fase}: HTTP ${res.status}`);
        giornate.push(...parseCalendario(await res.text(), fase));
    }
    return giornate;
}

module.exports = { romeToUtc, parseDataGara, parseDataGiornata, parseCalendario, checkCalendario, scaricaCalendario };
