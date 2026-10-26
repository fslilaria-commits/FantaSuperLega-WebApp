// Scarica il calendario della regular season di SuperLega (andata e ritorno) e scrive data/calendario.json.
// Come il listone, è una proposta: entra nel gioco quando un admin la applica dal pannello Admin.
const fs = require('node:fs');
const path = require('node:path');
const { checkCalendario, scaricaCalendario } = require('./lib/calendario');
const { stagioneDeiDati } = require('./lib/stagione');

const OUTPUT = path.join(__dirname, '..', 'data', 'calendario.json');
async function main() {
    const stagione = stagioneDeiDati();
    const giornate = await scaricaCalendario(stagione);

    const errors = checkCalendario(giornate, stagione.squadre);
    if (errors.length) throw new Error(`calendario scartato, niente è stato scritto:\n- ${errors.join('\n- ')}`);

    // I risultati non fanno parte del calendario (li usa genera-tabellini): così il file cambia solo se cambiano date e orari
    const senzaRisultati = giornate.map(g => ({ ...g, matches: g.matches.map(({ score, ...m }) => m) }));
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(senzaRisultati, null, 2) + '\n');
    const provvisorie = giornate.filter(g => g.provisional).length;
    console.log(`${giornate.length} giornate in data/calendario.json (${provvisorie} con orari ancora da definire)`);
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
