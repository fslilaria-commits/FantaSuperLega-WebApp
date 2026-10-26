const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tabelliniInRitardo, problemaBot, avvisiBot } = require('../../frontend/js/stato-bot.js');

// 2ª giornata: ultima partita domenica 25/10 alle 18; la 3ª non è ancora giocata
const giornate = [
    { number: 1, matches: [{ start: '2026-10-17T16:00:00Z' }, { start: '2026-10-18T16:00:00Z' }] },
    { number: 2, matches: [{ start: '2026-10-25T16:00:00Z' }, { start: '2026-10-25T17:00:00Z' }] },
    { number: 3, matches: [{ start: '2026-11-01T16:00:00Z' }, { start: null }] },
];

test('un tabellino è in ritardo 3 giorni dopo l\'ultima partita della giornata', () => {
    assert.deepEqual(tabelliniInRitardo(giornate, [1], new Date('2026-10-27T20:00:00Z')), [], 'martedì sera: ancora in tempo');
    assert.deepEqual(tabelliniInRitardo(giornate, [1], new Date('2026-10-28T18:00:00Z')), [2], 'mercoledì sera: in ritardo');
    assert.deepEqual(tabelliniInRitardo(giornate, [1, 2], new Date('2026-10-28T18:00:00Z')), []);
});

test('le giornate senza orari e le gare spostate non contano', () => {
    const tardi = new Date('2026-12-01T00:00:00Z');
    assert.ok(!tabelliniInRitardo(giornate, [1, 2], tardi).includes(3), 'un orario ancora da definire');
    const spostata = [{ number: 4, matches: [{ start: '2026-11-04T19:30:00Z' }, { start: '2027-01-20T19:30:00Z', moved: true }] }];
    assert.deepEqual(tabelliniInRitardo(spostata, [], new Date('2026-11-08T00:00:00Z')), [4], 'la gara rinviata non sposta il ritardo');
    const firestore = [{ number: 5, matches: [{ start: { toDate: () => new Date('2026-11-08T16:00:00Z') } }] }];
    assert.deepEqual(tabelliniInRitardo(firestore, [], new Date('2026-11-12T00:00:00Z')), [5], 'date di Firestore');
});

test('il problema scritto dal bot in data/bot.json', () => {
    assert.equal(problemaBot(null), null);
    assert.equal(problemaBot({ esito: 'ok', dal: '2026-10-26T19:30:00Z' }), null);
    assert.deepEqual(problemaBot({ esito: 'errore', dal: '2026-10-27T19:30:00Z', errori: ['listone: HTTP 500'] }),
        { dal: new Date('2026-10-27T19:30:00Z'), errori: ['listone: HTTP 500'] });
});

test('gli avvisi per gli admin', () => {
    const formatoData = d => d.toISOString().slice(0, 10);
    assert.deepEqual(avvisiBot({ giornate, conTabellino: [1, 2], stato: { esito: 'ok' }, adesso: new Date('2026-10-28T18:00:00Z'), formatoData }), []);
    const avvisi = avvisiBot({
        giornate, conTabellino: [], formatoData, adesso: new Date('2026-10-28T18:00:00Z'),
        stato: { esito: 'errore', dal: '2026-10-27T19:30:00Z', errori: ['calendario: HTTP 403', 'tabellini: HTTP 403'] },
    });
    assert.deepEqual(avvisi, [
        'il bot dei dati ha un problema dal 2026-10-27: calendario: HTTP 403; tabellini: HTTP 403 (guida admin, punto 7)',
        'i tabellini delle giornate 1, 2 non sono ancora arrivati: controlla che il PC del bot sia acceso (guida admin, punto 7)',
    ]);
    assert.match(avvisiBot({ giornate, conTabellino: [1], stato: null, adesso: new Date('2026-10-28T18:00:00Z') })[0], /^il tabellino della giornata 2 non è ancora arrivato/);
});

test('in estate, con la Lega già alla stagione nuova, niente falsi ritardi e gli errori del bot sono attesi', () => {
    const estate = new Date('2027-07-20T18:00:00Z');
    const stato = { esito: 'errore', dal: '2027-07-10T19:30:00Z', errori: ['listone: solo 3 giocatori'] };
    assert.deepEqual(avvisiBot({ giornate, conTabellino: [], stato, stagioneNuova: '2027/28', adesso: estate }), [
        'sul sito della Lega è cominciata la stagione 2027/28: quando listone e calendario sono pronti, premi «Inizia la stagione» (Admin → Nuova stagione; guida admin, punto 9)',
        'intanto il bot aspetta i dati della stagione nuova: listone: solo 3 giocatori (guida admin, punto 9)',
    ]);
    assert.equal(avvisiBot({ giornate, conTabellino: [], stato: { esito: 'ok' }, stagioneNuova: '2027/28', adesso: estate }).length, 1);
});
