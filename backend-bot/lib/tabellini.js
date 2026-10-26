const cheerio = require('cheerio');
const { romeToUtc } = require('./calendario');

// Pagina di una partita sul sito della Lega: il robots.txt la permette (le pagine /statistiche/ no) e ha il
// tabellino di tutte e due le squadre, giocatore per giocatore, con i totali di squadra
const urlPartita = matchId => `https://www.legavolley.it/match/${matchId}`;

// "45,2" -> 45.2, "50%" -> 50, "." o "" -> 0
function num(text) {
    const n = parseFloat(String(text).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

// Come la Lega: i valori esattamente a metà vanno verso lo zero (18,75 -> 18,7; 0,375 -> 0,37)
const arrotonda = (x, cifre) => Math.sign(x) * Math.ceil(Math.abs(x) * 10 ** cifre - 0.5 - 1e-9) / 10 ** cifre || 0;
const quota = (parte, totale, cifre) => (totale ? arrotonda(parte / totale * (cifre === 1 ? 100 : 1), cifre) : 0);

// Le colonne della pagina partita da PUNTI in poi: Tot, BP, VP | battuta Tot, Err, Pt | ricezione Tot, Err, Pos%,
// Prf% | attacco Tot, Err, Mur, Pt, Pt% | muro Pt. La ricezione ha le percentuali: positive (+ e #) e perfette (#)
// tornano conteggi, e le "negative" sono le altre ricezioni non sbagliate, come nel resto del gioco.
// Efficienze e percentuali sono calcolate come le arrotonda la Lega (eff a 2 cifre, percentuali a 1)
function statistiche(c) {
    const [punti, , , batTot, batErr, ace, ricTot, ricErr, ricPos, ricPrf, attTot, attErr, murati, vincenti, , muri] = c.map(num);
    const positive = Math.round(ricTot * ricPos / 100);
    const perfette = Math.round(ricTot * ricPrf / 100);
    return {
        points: punti,
        serve: { tot: batTot, ace, err: batErr },
        rec: { tot: ricTot, err: ricErr, neg: Math.max(0, ricTot - ricErr - positive), perf: perfette, perfPct: quota(perfette, ricTot, 1), eff: quota(perfette - ricErr, ricTot, 2) },
        att: { tot: attTot, err: attErr, blocked: murati, kills: vincenti, killPct: quota(vincenti, attTot, 1), eff: quota(vincenti - attErr, attTot, 2) },
        block: { pts: muri },
    };
}

// I tabellini delle due squadre di una partita: [{ team, players, totals }], nell'ordine della pagina (casa, poi
// ospiti); null se la pagina non ha ancora il tabellino. Ci sono solo i giocatori entrati in campo
function parsePartita(html) {
    const $ = cheerio.load(html);
    const cella = el => $(el).text().replace(/\s+/g, ' ').trim();
    const squadre = [];
    $('table').filter((_, t) => $(t).find('table').length === 0 && /Voto/.test($(t).find('tr').first().text())).each((_, t) => {
        const righe = $(t).find('tr').map((__, tr) => [$(tr).find('td, th').map((___, c) => cella(c)).get()]).get();
        const team = righe[0]?.[0];
        const players = [];
        let totals = null;
        let set = 0;
        for (const c of righe.slice(2)) {
            if (c.length === 24 && /^\d+$/.test(c[0])) {
                // numero, nome, voto, i 5 set (posizione di partenza o * se è entrato), poi le statistiche
                const giocati = c.slice(3, 8).filter(v => v && v !== '.').length;
                if (giocati) players.push({ name: c[1].replace(/\s*\([A-Z]\)\s*$/, ''), set: giocati, ...statistiche(c.slice(8)) });
            } else if (c.length === 17 && /^totali squadra$/i.test(c[0])) {
                totals = statistiche(c.slice(1));
            } else if (/^\d° Set$/.test(c[0])) {
                set++;
            }
        }
        // Stessa forma dei tabellini già salvati (giocatori in ordine alfabetico), così riscaricarli non cambia i file
        players.sort((a, b) => a.name.localeCompare(b.name, 'it'));
        if (team && totals) squadre.push({ team, players, totals: { name: 'Totali di Squadra', set, ...totals } });
    });
    return squadre.length === 2 ? squadre : null;
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

module.exports = { urlPartita, num, parsePartita, parseRisultato, validiDal, checkTabellino };
