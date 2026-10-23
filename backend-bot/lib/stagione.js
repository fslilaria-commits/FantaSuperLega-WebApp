// Stagione dei dati in data/: data/stagione.json dice di che anno sono le proposte (listone, calendario, tabellini).
// Quando frontend/js/stagione.js passa all'anno nuovo, le proposte della stagione finita vanno tolte prima di
// scaricare le nuove: il controllo "spariscono troppi giocatori" fermerebbe il listone nuovo, e i tabellini
// dell'anno prima hanno gli stessi numeri di giornata di quelli nuovi.
const fs = require('node:fs');
const path = require('node:path');

const FILE_STAGIONE = 'stagione.json';
const DA_TOGLIERE = ['players.json', 'calendario.json', 'tabellini'];

// 'inizia' se manca data/stagione.json (si segna l'anno, senza toccare niente), 'nuova' se i dati sono
// di una stagione precedente, 'uguale' se sono già di questa; errore se sono di una stagione successiva
function confrontaStagione(annoDati, anno) {
    if (annoDati == null) return 'inizia';
    if (!Number.isInteger(annoDati)) throw new Error(`data/${FILE_STAGIONE}: anno non valido (${annoDati})`);
    if (annoDati > anno) throw new Error(`i dati sono della stagione ${annoDati}, il codice è ancora alla ${anno}: controlla frontend/js/stagione.js`);
    return annoDati < anno ? 'nuova' : 'uguale';
}

function leggiAnnoDati(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, FILE_STAGIONE), 'utf8')).anno;
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
}

// Prepara data/ per l'anno: restituisce cosa ha fatto ('inizia', 'nuova' o 'uguale')
function preparaStagione(dir, anno) {
    const esito = confrontaStagione(leggiAnnoDati(dir), anno);
    if (esito === 'nuova') {
        for (const nome of DA_TOGLIERE) fs.rmSync(path.join(dir, nome), { recursive: true, force: true });
    }
    if (esito !== 'uguale') {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, FILE_STAGIONE), JSON.stringify({ anno }) + '\n');
    }
    return esito;
}

module.exports = { DA_TOGLIERE, confrontaStagione, leggiAnnoDati, preparaStagione };
