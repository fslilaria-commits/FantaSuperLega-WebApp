// Scarica il calendario della regular season di SuperLega (andata e ritorno) e scrive data/calendario.json.
// Come il listone, è una proposta: entra nel gioco quando un admin la applica dal pannello Admin.
const fs = require('node:fs');
const path = require('node:path');
const { parseCalendario, checkCalendario } = require('./lib/calendario');

const OUTPUT = path.join(__dirname, '..', 'data', 'calendario.json');
const URL = fase => `https://www.legavolley.it/calendario/?Anno=2026&IdCampionato=999&IdFase=${fase}&IdSquadra=0`;

async function main() {
    const giornate = [];
    for (const fase of [1, 2]) {
        const res = await fetch(URL(fase), { headers: { 'User-Agent': 'Mozilla/5.0 (FantaSuperLega calendario)' } });
        if (!res.ok) throw new Error(`fase ${fase}: HTTP ${res.status}`);
        giornate.push(...parseCalendario(await res.text(), fase));
    }

    const errors = checkCalendario(giornate);
    if (errors.length) throw new Error(`calendario scartato, niente è stato scritto:\n- ${errors.join('\n- ')}`);

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(giornate, null, 2) + '\n');
    const provvisorie = giornate.filter(g => g.provisional).length;
    console.log(`${giornate.length} giornate in data/calendario.json (${provvisorie} con orari ancora da definire)`);
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
