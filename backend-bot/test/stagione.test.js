const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { confrontaStagione, preparaStagione } = require('../lib/stagione');

// Cartella data/ finta con le proposte di una stagione
function cartellaDati(anno) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsl-dati-'));
    if (anno != null) fs.writeFileSync(path.join(dir, 'stagione.json'), JSON.stringify({ anno }));
    fs.writeFileSync(path.join(dir, 'players.json'), '[]');
    fs.writeFileSync(path.join(dir, 'calendario.json'), '[]');
    fs.mkdirSync(path.join(dir, 'tabellini'));
    fs.writeFileSync(path.join(dir, 'tabellini', '1.json'), '{}');
    return dir;
}
const esiste = (dir, nome) => fs.existsSync(path.join(dir, nome));
const annoDi = dir => JSON.parse(fs.readFileSync(path.join(dir, 'stagione.json'), 'utf8')).anno;

test('confronto tra la stagione dei dati e quella del codice', () => {
    assert.equal(confrontaStagione(null, 2026), 'inizia');
    assert.equal(confrontaStagione(2026, 2026), 'uguale');
    assert.equal(confrontaStagione(2026, 2027), 'nuova');
    assert.throws(() => confrontaStagione(2027, 2026), /stagione successiva|ancora alla 2026/);
    assert.throws(() => confrontaStagione('2026', 2026), /anno non valido/);
});

test('stagione nuova: via listone, calendario e tabellini della stagione finita', () => {
    const dir = cartellaDati(2026);
    assert.equal(preparaStagione(dir, 2027), 'nuova');
    for (const nome of ['players.json', 'calendario.json', 'tabellini']) assert.ok(!esiste(dir, nome), `${nome} doveva sparire`);
    assert.equal(annoDi(dir), 2027);
});

test('stessa stagione: i dati restano dove sono', () => {
    const dir = cartellaDati(2026);
    assert.equal(preparaStagione(dir, 2026), 'uguale');
    assert.ok(esiste(dir, 'players.json') && esiste(dir, 'tabellini/1.json'));
});

test('senza data/stagione.json si segna l\'anno senza cancellare niente', () => {
    const dir = cartellaDati(null);
    assert.equal(preparaStagione(dir, 2026), 'inizia');
    assert.ok(esiste(dir, 'players.json') && esiste(dir, 'calendario.json') && esiste(dir, 'tabellini/1.json'));
    assert.equal(annoDi(dir), 2026);
});

test('dati di una stagione successiva al codice: si ferma senza toccare niente', () => {
    const dir = cartellaDati(2028);
    assert.throws(() => preparaStagione(dir, 2027));
    assert.ok(esiste(dir, 'players.json'));
    assert.equal(annoDi(dir), 2028);
});
