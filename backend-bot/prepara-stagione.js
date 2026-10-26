// Primo passo di ogni aggiornamento dei dati: guarda sul sito della Lega quale stagione è in corso e la scrive in
// data/stagione.json, con squadre e codici delle statistiche. Se la Lega è passata alla stagione nuova toglie da
// data/ le proposte di quella finita, così le nuove si scaricano da zero.
const { nomeDi } = require('../frontend/js/stagione');
const { preparaStagione } = require('./lib/stagione');

async function main() {
    const { esito, stagione, cambiata, avviso } = await preparaStagione();
    const nome = nomeDi(stagione.anno);
    const messaggi = {
        inizia: `Stagione ${nome}: segnata in data/stagione.json.`,
        nuova: `Nuova stagione ${nome}: tolte le proposte della stagione finita, si scaricano quelle nuove.`,
        uguale: cambiata ? `Stagione ${nome}: squadre aggiornate in data/stagione.json.` : `Stagione ${nome}: niente da preparare.`,
        attesa: `Stagione ${nome}: ${avviso}.`,
    };
    console.log(messaggi[esito]);
    console.log(`${stagione.squadre.length} squadre, regular season numero ${stagione.campionato} sul sito della Lega.`);
    const senzaCodice = stagione.squadre.filter(s => !s.codiceStatistiche).map(s => s.team);
    if (senzaCodice.length) {
        console.log(`⚠️ Codice delle statistiche non ancora trovato per: ${senzaCodice.join(', ')}. Serve per i tabellini: si riprova al prossimo aggiornamento.`);
    }
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
