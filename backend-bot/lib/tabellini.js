const cheerio = require('cheerio');
const { romeToUtc } = require('./calendario');

// Codici delle squadre nella pagina statistiche della Lega (parametro Squadra), per id squadra
const CODICI_STATISTICHE = {
    6859: 'CIS-VOLLEY',
    6863: 'CUNEOSPORT',
    6860: 'MC',
    6858: 'MI-POWER',
    6867: 'MO',
    6868: 'MIVER',
    6866: 'PD',
    6865: 'BASTIA',
    6861: 'PIACENZAYOU',
    6897: 'PRATA',
    6862: 'TN-ITAS',
    6864: 'VRI',
};

const urlStatistiche = (legaId, teamId) =>
    `https://www.legavolley.it/statistiche/?TipoStat=1.1&Serie=1&AnnoInizio=2026&Fase=1&Giornata=${legaId}&Squadra=${CODICI_STATISTICHE[teamId]}`;

// "45,2" -> 45.2, "" -> 0
function num(text) {
    const n = parseFloat(String(text).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

// Le 24 colonne della vista "Team - Player by Player"
function riga(cells) {
    const c = cells.map(x => x.trim());
    return {
        name: c[0],
        set: num(c[2]),
        points: num(c[3]),
        serve: { tot: num(c[5]), ace: num(c[6]), err: num(c[7]) },
        rec: { tot: num(c[10]), err: num(c[11]), neg: num(c[12]), perf: num(c[13]), perfPct: num(c[14]), eff: num(c[15]) },
        att: { tot: num(c[16]), err: num(c[17]), blocked: num(c[18]), kills: num(c[19]), killPct: num(c[20]), eff: num(c[21]) },
        block: { pts: num(c[22]) },
    };
}

// Giocatori e totali di squadra di una partita; null se la Lega non ha ancora dati
function parseStatistiche(html) {
    const $ = cheerio.load(html);
    const players = [];
    let totals = null;
    $('tr').each((_, tr) => {
        // La riga "Team Totals" ha l'etichetta in una cella di intestazione (th)
        const cells = $(tr).find('td, th').map((__, td) => $(td).text().replace(/ /g, ' ')).get();
        if (cells.length !== 24) return;
        const r = riga(cells);
        if (!r.name || r.name === 'Player') return;
        if (/^(team totals|totali di squadra)$/i.test(r.name)) totals = r; // pagina in inglese o in italiano
        else players.push(r);
    });
    return totals ? { players, totals } : null;
}

// Il risultato "3-1" letto dal calendario; null se la partita non è ancora giocata
function parseRisultato(text) {
    const m = String(text).match(/(\d)\s*-\s*(\d)/);
    if (!m) return null;
    const [home, away] = [+m[1], +m[2]];
    return home + away >= 3 && (home === 3 || away === 3) ? { home, away } : null;
}

// I tabellini sono verificati dalla Lega dalle 19 del giorno dopo l'ultima partita
function validiDal(giornata) {
    const ultime = giornata.matches.filter(m => !m.moved && m.start).map(m => new Date(m.start));
    if (!ultime.length || ultime.length < giornata.matches.filter(m => !m.moved).length) return null;
    const last = new Date(Math.max(...ultime));
    const giorno = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(last).split('-').map(Number);
    return romeToUtc(giorno[0], giorno[1], giorno[2] + 1, 19, 0);
}

// Controlli prima di accettare il tabellino di una giornata
function checkTabellino(t) {
    const errors = [];
    for (const m of t.matches) {
        if (m.moved) continue;
        if (!m.result) errors.push(`${m.home} – ${m.away}: manca il risultato`);
        for (const id of [m.homeId, m.awayId]) {
            const squadra = t.teams[id];
            if (!squadra) errors.push(`${id === m.homeId ? m.home : m.away}: mancano le statistiche`);
            else if (squadra.players.filter(p => p.set > 0).length < 6) errors.push(`${squadra.team}: meno di 6 giocatori in campo`);
        }
    }
    return errors;
}

module.exports = { CODICI_STATISTICHE, urlStatistiche, num, parseStatistiche, parseRisultato, validiDal, checkTabellino };
