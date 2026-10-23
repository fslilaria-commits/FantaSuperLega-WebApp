// Scarica dal sito della Lega i tabellini delle giornate concluse e li scrive in data/tabellini/<giornata>.json.
// Come listone e calendario è una proposta: i punteggi li calcola e li applica un admin dal pannello Admin.
const fs = require('node:fs');
const path = require('node:path');
const { scaricaCalendario } = require('./lib/calendario');
const { urlStatistiche, parseStatistiche, parseRisultato, validiDal, checkTabellino } = require('./lib/tabellini');
const { scaricaPagina } = require('./lib/rete');

const DIR = path.join(__dirname, '..', 'data', 'tabellini');
const GIORNI_DI_CORREZIONE = 14; // per due settimane si riscarica, nel caso la Lega corregga qualche dato

async function main() {
    const now = new Date();
    const giornate = await scaricaCalendario();
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
        for (const m of g.matches.filter(x => !x.moved)) {
            for (const [teamId, team] of [[m.homeId, m.home], [m.awayId, m.away]]) {
                const stats = parseStatistiche(await scaricaPagina(urlStatistiche(g.legaId, teamId)));
                if (stats) tabellino.teams[teamId] = { team, ...stats };
            }
        }

        const errors = checkTabellino(tabellino);
        if (errors.length) {
            problemi.push(`${g.label}: ${errors.join('; ')}`);
            continue;
        }
        const nuovo = JSON.stringify(tabellino, null, 2) + '\n';
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== nuovo) {
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
