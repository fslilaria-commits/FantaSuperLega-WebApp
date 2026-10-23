const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../frontend/js/scontri.js');
const { MEDIA, generaCalendario, risultatiScontri, ordinaClassifica } = S;

const fisso = () => 0.42; // per avere un calendario riproducibile nei test

test('con 4 squadre: 3 turni in cui tutti incontrano tutti, poi si ripete', () => {
    const { rounds } = generaCalendario(['a', 'b', 'c', 'd'], { start: 1, end: 22, random: fisso });
    assert.equal(Object.keys(rounds).length, 22);
    const incontri = new Set();
    for (const g of [1, 2, 3]) {
        const inCampo = rounds[g].flatMap(p => [p.a, p.b]);
        assert.equal(new Set(inCampo).size, 4, 'ognuno gioca una volta per giornata');
        for (const { a, b } of rounds[g]) incontri.add([a, b].sort().join('-'));
    }
    assert.equal(incontri.size, 6, 'nei primi 3 turni ogni coppia si incontra una volta');
    assert.deepEqual(rounds[4], rounds[1], 'dalla 4ª giornata si ricomincia');
});

test('con squadre dispari entra la Squadra media', () => {
    const { rounds } = generaCalendario(['a', 'b', 'c'], { start: 5, end: 22, random: fisso });
    assert.equal(rounds[5].length, 2);
    assert.ok(rounds[5].some(p => p.a === MEDIA || p.b === MEDIA));
    assert.equal(rounds[4], undefined, 'prima della giornata di inizio non ci sono sfide');
});

test('servono almeno 2 squadre', () => {
    assert.throws(() => generaCalendario(['a'], { start: 1 }));
});

const members = [{ uid: 'a', joinedAt: 1 }, { uid: 'b', joinedAt: 2 }, { uid: 'c', joinedAt: 3 }, { uid: 'd', joinedAt: 4 }];
const sfida = (a, b) => ({ a, b });
const rounds = { 1: [sfida('a', 'b'), sfida('c', 'd')], 2: [sfida('a', 'c'), sfida('b', 'd')] };

test('vittoria 3 punti, sconfitta 0', () => {
    const scores = [{ uid: 'a', matchday: 1, total: 250 }, { uid: 'b', matchday: 1, total: 220 }, { uid: 'c', matchday: 1, total: 200 }, { uid: 'd', matchday: 1, total: 210 }];
    const { classifica } = risultatiScontri({ rounds, scores, members });
    assert.equal(classifica.a.points, 3);
    assert.equal(classifica.b.points, 0);
    assert.equal(classifica.d.points, 3);
    assert.equal(classifica.a.for, 250);
    assert.equal(classifica.a.against, 220);
});

test('pareggio: tie-break a chi ha più punti in classifica generale (2 punti) e 1 all\'altro', () => {
    const scores = [
        { uid: 'a', matchday: 1, total: 200 }, { uid: 'b', matchday: 1, total: 260 }, { uid: 'c', matchday: 1, total: 200 }, { uid: 'd', matchday: 1, total: 100 },
        { uid: 'a', matchday: 2, total: 230 }, { uid: 'b', matchday: 2, total: 230 }, { uid: 'c', matchday: 2, total: 230 }, { uid: 'd', matchday: 2, total: 230 },
    ];
    const { classifica, partite } = risultatiScontri({ rounds, scores, members });
    const g2 = partite.filter(p => p.matchday === 2);
    // a-c: totale a 430 = c 430 -> vince chi si è iscritto prima (a); b-d: b ha più punti in classifica
    assert.equal(g2.find(p => p.a === 'a').vincitore, 'a');
    assert.equal(g2.find(p => p.a === 'b').vincitore, 'b');
    assert.ok(g2.every(p => p.tiebreak));
    assert.equal(classifica.a.tbWon, 1);
    assert.equal(classifica.c.tbLost, 1);
    assert.equal(classifica.c.points, 3 + 1, 'c: vittoria in g1, tie-break perso in g2');
    assert.equal(classifica.d.points, 0 + 1, 'd: sconfitta in g1, tie-break perso in g2');
});

test('contro la Squadra media: la media dei punti della giornata', () => {
    const tre = [{ uid: 'a', joinedAt: 1 }, { uid: 'b', joinedAt: 2 }, { uid: 'c', joinedAt: 3 }];
    const scores = [{ uid: 'a', matchday: 1, total: 100 }, { uid: 'b', matchday: 1, total: 200 }, { uid: 'c', matchday: 1, total: 300 }];
    const { classifica, partite } = risultatiScontri({ rounds: { 1: [sfida('a', MEDIA), sfida('b', 'c')] }, scores, members: tre });
    assert.equal(partite[0].pb, 200);
    assert.equal(partite[0].vincitore, MEDIA);
    assert.equal(classifica.a.lost, 1);
    assert.equal(classifica[MEDIA], undefined, 'la Squadra media non compare in classifica');
});

test('chi non ha punteggio nella giornata conta 0', () => {
    const { partite } = risultatiScontri({ rounds: { 1: [sfida('a', 'b')] }, scores: [{ uid: 'a', matchday: 1, total: 10 }], members });
    assert.equal(partite[0].pb, 0);
    assert.equal(partite[0].vincitore, 'a');
});

test('ordine della classifica: scontri diretti e classifica generale', () => {
    const standings = { a: { points: 6, total: 400 }, b: { points: 6, total: 450 }, c: { points: 3, total: 500 }, d: { points: 6, total: 450 } };
    assert.deepEqual(ordinaClassifica(members, standings, 'scontri').map(m => m.uid), ['b', 'd', 'a', 'c']);
    assert.deepEqual(ordinaClassifica(members, standings, 'classifica').map(m => m.uid), ['c', 'b', 'd', 'a']);
});

test('una squadra uscita dalla lega ma presente nel calendario non blocca il calcolo e perde il tie-break', () => {
    const due = [{ uid: 'a', joinedAt: 1 }];
    // a non ha schierato (0 punti) e l'avversario è uscito dalla lega: pareggio a 0, tie-break ad a
    const { classifica, partite } = risultatiScontri({ rounds: { 1: [sfida('a', 'uscita')] }, scores: [{ uid: 'a', matchday: 1, total: 0 }], members: due });
    assert.equal(partite[0].vincitore, 'a');
    assert.equal(classifica.a.tbWon, 1);
    assert.equal(classifica.uscita, undefined);
    assert.doesNotThrow(() => risultatiScontri({ rounds: { 1: [sfida('x', 'y')] }, scores: [{ uid: 'a', matchday: 1, total: 0 }], members: due }));
});

test('un calendario scritto male non blocca il calcolo', () => {
    const rounds = { 1: [{ a: 'a', b: 'b' }, null, { a: 'a' }, 5], 2: 5, 3: [{ a: 'b', b: 'a' }] };
    assert.deepEqual(S.sfideDi(rounds, 1), [{ a: 'a', b: 'b' }]);
    assert.deepEqual(S.sfideDi(rounds, 2), []);
    assert.deepEqual(S.sfideDi(undefined, 1), []);
    const scores = [{ uid: 'a', matchday: 1, total: 50 }, { uid: 'b', matchday: 1, total: 40 }, { uid: 'a', matchday: 2, total: 1 }];
    const { classifica } = S.risultatiScontri({ rounds, scores, members: [{ uid: 'a' }, { uid: 'b' }] });
    assert.equal(classifica.a.points, 3);
});
