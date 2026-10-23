// Scarica le rose ufficiali delle 12 squadre di SuperLega da legavolley.it e scrive data/players.json.
// È la "proposta" di listone: nel gioco entra solo quando un admin la applica dal pannello Admin.
// Si ferma senza scrivere niente se i dati sembrano sbagliati (paracadute).
const fs = require('node:fs');
const path = require('node:path');
const { SQUADRE_SUPERLEGA, parseRoster, checkProposal } = require('./lib/listone');
const { scaricaPagina } = require('./lib/rete');

const OUTPUT = path.join(__dirname, '..', 'data', 'players.json');

function readPrevious() {
    try {
        return JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    } catch {
        return [];
    }
}

async function main() {
    const all = [];
    for (const squadra of SQUADRE_SUPERLEGA) {
        const pagina = await scaricaPagina(`https://www.legavolley.it/team/${squadra.teamId}`)
            .catch(e => { throw new Error(`${squadra.team}: ${e.message}`); });
        // La tabella delle rose è in UTF-8; i caratteri non validi nel resto della pagina (testi storici) non la toccano
        const players = parseRoster(pagina, squadra);
        console.log(`${squadra.team.padEnd(30)} ${players.length} giocatori`);
        all.push(...players);
    }

    const { errors, summary } = checkProposal(all, readPrevious());
    if (errors.length) {
        throw new Error(`proposta scartata, niente è stato scritto:\n- ${errors.join('\n- ')}`);
    }

    all.sort((a, b) => a.team.localeCompare(b.team) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2) + '\n');
    console.log(`\n${all.length} giocatori in data/players.json (${summary})`);
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
