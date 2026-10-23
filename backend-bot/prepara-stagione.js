// Primo passo di ogni aggiornamento dei dati: se è cominciata una stagione nuova (frontend/js/stagione.js)
// toglie da data/ le proposte di quella finita, così le nuove si scaricano da zero.
const path = require('node:path');
const { ANNO, nome } = require('../frontend/js/stagione');
const { preparaStagione } = require('./lib/stagione');

const DATA = path.join(__dirname, '..', 'data');

try {
    const esito = preparaStagione(DATA, ANNO);
    const messaggi = {
        inizia: `Stagione ${nome}: segnata in data/stagione.json.`,
        nuova: `Nuova stagione ${nome}: tolte le proposte della stagione finita, si scaricano quelle nuove.`,
        uguale: `Stagione ${nome}: niente da preparare.`,
    };
    console.log(messaggi[esito]);
} catch (err) {
    console.error('❌', err.message);
    process.exit(1);
}
