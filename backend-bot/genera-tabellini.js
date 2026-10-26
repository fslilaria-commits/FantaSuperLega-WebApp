// Scarica dal sito della Lega i tabellini delle giornate concluse e li scrive in data/tabellini/<giornata>.json.
// Come listone e calendario è una proposta: i punteggi li calcola e li applica un admin dal pannello Admin.
const fs = require('node:fs');
const path = require('node:path');
const { scaricaCalendario } = require('./lib/calendario');
const { urlPartita, parsePartita, parseRisultato, validiDal, checkTabellino } = require('./lib/tabellini');
const { scaricaPagina } = require('./lib/rete');
const { stagioneDeiDati } = require('./lib/stagione');

const DIR = path.join(__dirname, '..', 'data', 'tabellini');
const GIORNI_DI_CORREZIONE = 14; // per due settimane si riscarica, nel caso la Lega corregga qualche dato

async function main() {
    const now = new Date();
    const stagione = stagioneDeiDati();
    const giornate = await scaricaCalendario(stagione);
    fs.mkdirSync(DIR, { recursive: true });
    const scritte = [];
    const problemi = [];

    for (const g of giornate) {
        const dal = validiDal(g);
        if (!dal || dal > now) continue; // giornata non ancora conclusa o dati non ancora verificati
        const file = path.join(DIR, `${g.number}.json`);
        const giorniPassati = (now - dal) / (24 * 3600 * 1000);
        if (fs.existsSync(file) && giorniPassati > GIORNI_DI_CORREZIONE) continue;

        const tabellino = {
            number: g.number,
            label: g.label,
            legaId: g.legaId,
            matches: g.matches.map(m => ({
                home: m.home, homeId: m.homeId, away: m.away, awayId: m.awayId,
                moved: m.moved, result: parseRisultato(m.score),
            })),
            teams: {},
        };
        // Una pagina per partita, con il tabellino di tutte e due le squadre (prima quella di casa)
        const mancaId = [];
        for (const m of g.matches.filter(x => !x.moved)) {
            if (!m.matchId) {
                mancaId.push(`${m.home} – ${m.away}`);
                continue;
            }
            const squadre = parsePartita(await scaricaPagina(urlPartita(m.matchId)));
            if (!squadre) continue; // la Lega non ha ancora il tabellino: lo dice checkTabellino
            for (const [teamId, team, i] of [[m.homeId, m.home, 0], [m.awayId, m.away, 1]]) {
                const s = squadre.find(x => x.team === team) || squadre[i];
                tabellino.teams[teamId] = { team, players: s.players, totals: s.totals };
            }
        }
        if (mancaId.length) {
            problemi.push(`${g.label}: nel calendario manca il collegamento alla pagina della partita (${mancaId.join(', ')})`);
            continue;
        }

        const errors = checkTabellino(tabellino);
        if (errors.length) {
            problemi.push(`${g.label}: ${errors.join('; ')}`);
            continue;
        }
        const nuovo = JSON.stringify(tabellino, null, 2) + '\n';
        // Su Windows il file può avere gli a capo \r\n: conta solo il contenuto
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== nuovo) {
            fs.writeFileSync(file, nuovo);
            scritte.push(g.label);
        }
    }

    const disponibili = fs.readdirSync(DIR).filter(f => /^\d+\.json$/.test(f)).map(f => parseInt(f, 10)).sort((a, b) => a - b);
    fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ giornate: disponibili }) + '\n');

    console.log(scritte.length ? `Tabellini aggiornati: ${scritte.join(', ')}` : 'Nessun tabellino nuovo.');
    if (problemi.length) {
        // Una giornata incompleta non blocca le altre, ma il job deve segnalarlo
        console.error(`❌ Tabellini scartati:\n- ${problemi.join('\n- ')}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
