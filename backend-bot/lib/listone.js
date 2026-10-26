const cheerio = require('cheerio');

const RUOLI = {
    palleggiatore: 'P',
    schiacciatore: 'S',
    centrale: 'C',
    opposto: 'O',
    libero: 'L',
};

// "Palleggiatore" -> "P"; null per ruoli che il gioco non prevede
function mapRole(roleText) {
    const key = String(roleText || '').trim().toLowerCase();
    return RUOLI[key] || null;
}

// "DE CECCO Luciano" -> "Luciano De Cecco", "D'AMICO Marco" -> "Marco D'Amico"
function normalizeName(rawName) {
    const words = String(rawName || '').trim().split(/\s+/).filter(Boolean);
    const isUpper = w => w === w.toUpperCase() && /\p{L}/u.test(w);
    const surname = [];
    while (words.length && isUpper(words[0])) surname.push(words.shift());
    const titleCase = w => w.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
    return [...words, ...surname.map(titleCase)].join(' ');
}

// Estrae i giocatori dalla tabella "Roster" di una pagina squadra
function parseRoster(html, { teamId, team }) {
    const $ = cheerio.load(html);
    const players = [];
    $('table#roster tbody tr').each((_, row) => {
        const link = $(row).find('td.nome a').attr('href') || '';
        const key = (link.match(/\/player\/([A-Z0-9-]+)/i) || [])[1];
        const role = mapRole($(row).find('td.ruolo').text());
        if (!key || !role) return;
        const year = parseInt($(row).find('td.nascita').text(), 10);
        const number = parseInt($(row).find('td.num-maglia').text(), 10);
        players.push({
            id: key.toUpperCase(),
            name: normalizeName($(row).find('td.nome a').text()),
            team,
            teamId,
            role,
            number: Number.isFinite(number) ? number : null,
            birthYear: Number.isFinite(year) ? year : null,
            nationality: $(row).find('td.naz-sportiva').text().trim() || null,
            photo: `https://www.legavolley.it/Foto.aspx?Key=${key.toUpperCase()}&sqid=${teamId}&heightImg=120`,
            active: true,
        });
    });
    return players;
}

const MIN_PER_SQUADRA = 10;
const MAX_QUOTA_USCITI = 0.25;

// Controlli prima di accettare una proposta di listone: restituisce gli errori bloccanti e un riepilogo.
// squadre: quelle della stagione (data/stagione.json)
function checkProposal(players, previous, squadre) {
    const errors = [];

    for (const { team } of squadre) {
        const n = players.filter(p => p.team === team).length;
        if (n < MIN_PER_SQUADRA) errors.push(`${team}: solo ${n} giocatori (minimo ${MIN_PER_SQUADRA}), la pagina potrebbe essere cambiata`);
    }

    const ids = new Set();
    for (const p of players) {
        if (ids.has(p.id)) errors.push(`giocatore ripetuto: ${p.id} (${p.name})`);
        ids.add(p.id);
    }

    const prevIds = new Set(previous.map(p => p.id));
    const added = players.filter(p => !prevIds.has(p.id)).length;
    const removed = previous.filter(p => !ids.has(p.id)).length;
    if (previous.length && removed / previous.length > MAX_QUOTA_USCITI) {
        errors.push(`spariscono ${removed} giocatori su ${previous.length}: troppi tutti insieme, serve un controllo a mano`);
    }

    return { errors, summary: `${added} nuovi, ${removed} usciti rispetto alla versione precedente` };
}

module.exports = { mapRole, normalizeName, parseRoster, checkProposal };
