const { test } = require('node:test');
const assert = require('node:assert/strict');
const { controllaPassaggio, classificaFinale, archivioLega, idArchivio } = require('../../frontend/js/nuova-stagione.js');

// Estate 2027: codice e dati del bot già alla stagione nuova, gioco ancora alla 2026
const estate = (cambi = {}) => ({
    annoGioco: 2026, annoCodice: 2027, annoDati: 2027,
    giocatori: 180, giornate: 22, squadre: 12, giornateAttese: 22, daGiocare: 0, ...cambi,
});

test('con giornate ancora da giocare la stagione non si chiude', () => {
    const esito = controllaPassaggio(estate({ daGiocare: 2 }));
    assert.equal(esito.stato, 'da-preparare');
    assert.match(esito.motivi[0], /non è finita: ci sono ancora 2 giornate/);
    assert.match(controllaPassaggio(estate({ daGiocare: 1 })).motivi[0], /ancora 1 giornata da giocare/);
});

test('il passaggio è pronto solo con codice, dati del bot, listone e calendario della stagione nuova', () => {
    assert.deepEqual(controllaPassaggio(estate()), { stato: 'pronta', motivi: [] });
});

test('durante la stagione non si può fare: il codice non è più avanti del gioco', () => {
    assert.equal(controllaPassaggio(estate({ annoCodice: 2026, annoDati: 2026 })).stato, 'in-corso');
    // codice tornato indietro per sbaglio: comunque niente
    assert.equal(controllaPassaggio(estate({ annoCodice: 2025 })).stato, 'in-corso');
});

test('senza la stagione del gioco non si cancella niente', () => {
    assert.equal(controllaPassaggio(estate({ annoGioco: null })).stato, 'in-corso');
    assert.equal(controllaPassaggio(estate({ annoGioco: undefined })).stato, 'in-corso');
});

test('il bot non ha ancora preparato la stagione nuova: i file in data/ sono ancora quelli vecchi', () => {
    const esito = controllaPassaggio(estate({ annoDati: 2026 }));
    assert.equal(esito.stato, 'da-preparare');
    assert.match(esito.motivi[0], /bot/);
    assert.equal(esito.motivi.length, 1); // listone e calendario vecchi non contano
});

test('la Lega non ha ancora pubblicato rose o calendario', () => {
    assert.match(controllaPassaggio(estate({ giocatori: null })).motivi.join(), /listone/);
    assert.match(controllaPassaggio(estate({ giocatori: 40 })).motivi.join(), /listone/); // poche squadre scaricate
    assert.match(controllaPassaggio(estate({ giornate: null })).motivi.join(), /calendario/);
    assert.match(controllaPassaggio(estate({ giornate: 11 })).motivi.join(), /calendario/);
    assert.equal(controllaPassaggio(estate({ giocatori: null, giornate: null })).motivi.length, 2);
});

const members = [
    { uid: 'a', teamName: 'Alfa', joinedAt: 1 },
    { uid: 'b', teamName: 'Beta', joinedAt: 2 },
    { uid: 'c', teamName: 'Gamma', joinedAt: 3 },
];

test('classifica finale della classifica generale: fanta-punti, poi iscrizione', () => {
    const standings = { a: { total: 100 }, b: { total: 120.5 }, c: { total: 100 } };
    assert.deepEqual(classificaFinale({ members, standings, mode: 'classifica', presidentUid: 'c' }), [
        { pos: 1, squadra: 'Beta', total: 120.5 },
        { pos: 2, squadra: 'Alfa', total: 100 },
        { pos: 3, squadra: 'Gamma', total: 100, presidente: true },
    ]);
});

test('classifica finale degli scontri diretti: punti prima dei fanta-punti, con vittorie e tie-break', () => {
    const standings = {
        a: { total: 300, points: 6, won: 2, tbWon: 0, tbLost: 0, lost: 1 },
        b: { total: 250, points: 9, won: 3, tbWon: 0, tbLost: 0, lost: 0 },
    };
    const righe = classificaFinale({ members, standings, mode: 'scontri', presidentUid: 'a' });
    assert.deepEqual(righe.map(r => r.squadra), ['Beta', 'Alfa', 'Gamma']);
    assert.deepEqual(righe[0], { pos: 1, squadra: 'Beta', total: 250, points: 9, won: 3, tbWon: 0, tbLost: 0, lost: 0 });
    // chi non ha mai preso punti compare con zero
    assert.deepEqual(righe[2], { pos: 3, squadra: 'Gamma', total: 0, points: 0, won: 0, tbWon: 0, tbLost: 0, lost: 0 });
});

test('documento d\'archivio di una lega', () => {
    const lega = { name: 'Amici', presidentUid: 'a', settings: { mode: 'classifica' } };
    const doc = archivioLega({ anno: 2026, lega, members, standings: { a: { total: 10 } } });
    assert.equal(doc.anno, 2026);
    assert.equal(doc.stagione, '2026/27');
    assert.equal(doc.lega, 'Amici');
    assert.equal(doc.modalita, 'classifica');
    assert.deepEqual(doc.uids, ['a', 'b', 'c']); // le regole mostrano l'archivio solo a loro
    assert.equal(doc.classifica.length, 3);
    assert.equal(idArchivio(2026, 'xyz'), '2026_xyz');
    assert.equal(archivioLega({ anno: 2026, lega: { ...lega, settings: {} }, members, standings: {} }).modalita, 'classifica');
});
