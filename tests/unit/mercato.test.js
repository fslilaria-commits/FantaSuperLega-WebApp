const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../frontend/js/mercato.js');

const ORA = 3600 * 1000;

test('finestra: apre 3 ore dopo l\'ultima partita, offerte fino a 3 ore prima, chiude alla scadenza', () => {
    const g1 = { number: 1, label: '1ª', lockAt: new Date('2026-10-17T15:59:00Z'), matches: [{ start: '2026-10-17T16:00:00Z' }, { start: '2026-10-18T17:00:00Z' }, { start: '2026-11-30T17:00:00Z', moved: true }] };
    const g2 = { number: 2, label: '2ª', lockAt: new Date('2026-10-25T14:59:00Z'), matches: [] };
    const prima = M.finestraMercato([g1, g2], new Date('2026-10-18T19:00:00Z'));
    assert.equal(prima.matchday, 2);
    assert.equal(prima.apre.toISOString(), '2026-10-18T20:00:00.000Z', 'la gara spostata non conta');
    assert.equal(prima.aperto, false);
    const dopo = M.finestraMercato([g1, g2], new Date('2026-10-20T10:00:00Z'));
    assert.equal(dopo.aperto, true);
    assert.equal(dopo.offerteAperte, true);
    assert.equal(dopo.offerteFino.toISOString(), '2026-10-25T11:59:00.000Z');
    const tardi = M.finestraMercato([g1, g2], new Date('2026-10-25T13:00:00Z'));
    assert.equal(tardi.aperto, true);
    assert.equal(tardi.offerteAperte, false, 'scambi ancora possibili, offerte no');
});

const players = {
    s1: { role: 'S', team: 'A' }, s2: { role: 'S', team: 'A' }, sx: { role: 'S', team: 'B' }, sy: { role: 'S', team: 'C' },
    c1: { role: 'C', team: 'A' }, a3: { role: 'S', team: 'A' }, a4: { role: 'S', team: 'A' },
};
const rosa = (ids, prezzi, crediti) => ({
    P: [], S: ids.filter(id => players[id].role === 'S'), C: ids.filter(id => players[id].role === 'C'), O: [], L: [],
    all: ids.slice(), prices: Object.fromEntries(ids.map((id, i) => [id, prezzi[i]])), creditsLeft: crediti,
});

test('vince l\'offerta più alta: valore del giocatore lasciato + crediti', () => {
    const rosters = { u1: rosa(['s1'], [10], 50), u2: rosa(['s2'], [20], 50) };
    const offers = [
        { id: 'o1', uid: 'u1', playerIn: 'sx', playerOut: 's1', role: 'S', extra: 15 }, // 25
        { id: 'o2', uid: 'u2', playerIn: 'sx', playerOut: 's2', role: 'S', extra: 0 }, // 20
    ];
    const r = M.risolviOfferte({ offers, rosters, posizione: { u1: 0, u2: 1 }, playersById: players });
    assert.deepEqual(r.vinte.map(o => o.id), ['o1']);
    assert.equal(r.perse[0].motivo, "assegnato a un'offerta più alta");
    assert.deepEqual(r.rosters.u1.S, ['sx'], 'nella stessa posizione');
    assert.equal(r.rosters.u1.prices.sx, 25);
    assert.equal(r.rosters.u1.prices.s1, undefined);
    assert.equal(r.rosters.u1.creditsLeft, 35);
    assert.equal(rosters.u1.S[0], 's1', 'le rose di partenza non vengono toccate');
});

test('a parità di offerta vince chi è più in basso in classifica', () => {
    const rosters = { u1: rosa(['s1'], [10], 50), u2: rosa(['s2'], [10], 50) };
    const offers = [
        { id: 'o1', uid: 'u1', playerIn: 'sx', playerOut: 's1', role: 'S', extra: 5 },
        { id: 'o2', uid: 'u2', playerIn: 'sx', playerOut: 's2', role: 'S', extra: 5 },
    ];
    const r = M.risolviOfferte({ offers, rosters, posizione: { u1: 0, u2: 1 }, playersById: players });
    assert.deepEqual(r.vinte.map(o => o.uid), ['u2']);
});

test('offerte non valide al momento dell\'assegnazione', () => {
    const rosters = { u1: rosa(['s1', 'sy'], [10, 10], 5), u2: rosa(['s2'], [10], 50) };
    const r = M.risolviOfferte({
        offers: [
            { id: 'gia-preso', uid: 'u2', playerIn: 'sy', playerOut: 's2', role: 'S', extra: 0 },
            { id: 'senza-crediti', uid: 'u1', playerIn: 'sx', playerOut: 's1', role: 'S', extra: 20 },
        ],
        rosters, posizione: {}, playersById: players,
    });
    assert.equal(r.vinte.length, 0);
    assert.equal(r.perse.find(o => o.id === 'gia-preso').motivo, 'non è più svincolato');
    assert.equal(r.perse.find(o => o.id === 'senza-crediti').motivo, 'crediti insufficienti');
});

test('non si superano i 4 giocatori dello stesso club', () => {
    const rosters = { u1: rosa(['s2', 'c1', 'a3', 'a4', 'sy'], [1, 1, 1, 1, 1], 10) };
    const r = M.risolviOfferte({ offers: [{ id: 'o', uid: 'u1', playerIn: 's1', playerOut: 'sy', role: 'S', extra: 0 }], rosters, posizione: {}, playersById: players });
    assert.equal(r.perse[0].motivo, 'più di 4 giocatori dello stesso club');
});

test('scambio: chi arriva prende il valore di chi parte, i crediti passano', () => {
    const rosters = { u1: rosa(['s1'], [10], 30), u2: rosa(['sx'], [40], 0) };
    const r = M.eseguiScambio(rosters, { from: 'u1', to: 'u2', give: 's1', take: 'sx', role: 'S', extra: 20 }, players);
    assert.equal(r.ok, true);
    assert.deepEqual(r.rosters.u1.S, ['sx']);
    assert.equal(r.rosters.u1.prices.sx, 30, '10 di valore + 20 crediti');
    assert.equal(r.rosters.u1.creditsLeft, 10);
    assert.deepEqual(r.rosters.u2.S, ['s1']);
    assert.equal(r.rosters.u2.prices.s1, 40);
    assert.equal(r.rosters.u2.creditsLeft, 20);
    assert.equal(r.movimenti.length, 2);
});

test('scambio non più valido', () => {
    const rosters = { u1: rosa(['s1'], [10], 0), u2: rosa(['sx'], [40], 0) };
    assert.equal(M.eseguiScambio(rosters, { from: 'u1', to: 'u2', give: 's1', take: 'sy', role: 'S', extra: 0 }, players).ok, false);
    assert.equal(M.eseguiScambio(rosters, { from: 'u1', to: 'u2', give: 's1', take: 'sx', role: 'S', extra: 5 }, players).motivo, 'crediti insufficienti');
});

test('formazione: chi arriva prima della scadenza prende il posto di chi parte', () => {
    const lineup = { starters: { S1: 's1', P: 'p' }, bench: ['c1'], captain: 's1' };
    const movimenti = [{ playerOut: 's1', playerIn: 'sx', at: 100 }, { playerOut: 'c1', playerIn: 'c9', at: 300 }];
    const l = M.applicaSostituzioni(lineup, movimenti, 200);
    assert.equal(l.starters.S1, 'sx');
    assert.equal(l.captain, 'sx');
    assert.deepEqual(l.bench, ['c1'], 'il movimento dopo la scadenza non vale per questa giornata');
    assert.equal(lineup.starters.S1, 's1', 'la formazione salvata non viene toccata');
});

test('i trasferimenti precedenti al salvataggio della formazione non la toccano', () => {
    // A esce (X entra), poi A torna e il giocatore salva una formazione con entrambi: X non deve contare due volte
    const lineup = { starters: { S1: 'A', S2: 'X' }, bench: [], captain: 'A', savedAt: 250 };
    const movimenti = [{ playerOut: 'A', playerIn: 'X', at: 100 }, { playerOut: 'Y', playerIn: 'A', at: 200 }];
    const l = M.applicaSostituzioni(lineup, movimenti, 1000);
    assert.deepEqual(l.starters, { S1: 'A', S2: 'X' });
});

test('crediti impegnati nelle offerte attive', () => {
    const offerte = [{ id: 'a', uid: 'u1', status: 'active', extra: 10 }, { id: 'b', uid: 'u1', status: 'withdrawn', extra: 50 }, { id: 'c', uid: 'u1', status: 'active', extra: 5 }];
    assert.equal(M.creditiImpegnati(offerte, 'u1'), 15);
    assert.equal(M.creditiImpegnati(offerte, 'u1', 'a'), 5);
});

test('chi viene lasciato torna svincolato solo dalla finestra successiva', () => {
    // u1 vince sx lasciando s1; u2 aveva offerto meno per s1 (che al momento dell'offerta era di u1)
    const rosters = { u1: rosa(['s1'], [10], 50), u2: rosa(['s2'], [5], 50) };
    const offers = [
        { id: 'o1', uid: 'u1', playerIn: 'sx', playerOut: 's1', role: 'S', extra: 5 },
        { id: 'o2', uid: 'u2', playerIn: 's1', playerOut: 's2', role: 'S', extra: 0 },
    ];
    const r = M.risolviOfferte({ offers, rosters, posizione: {}, playersById: players });
    assert.deepEqual(r.vinte.map(o => o.id), ['o1']);
    assert.match(r.perse[0].motivo, /prossima finestra/);
});

test('rosa alla scadenza: i movimenti dopo si annullano, quelli senza un vero cambio di rosa non contano', () => {
    const scadenza = 1000;
    const roster = { all: ['sy', 'c1'] }; // oggi: sx è arrivato prima della scadenza, poi sy dopo
    const movimenti = [
        { uid: 'u1', playerIn: 'sx', playerOut: 's1', at: 500 },
        { uid: 'u1', playerIn: 'sy', playerOut: 'sx', at: 1500 },
        { uid: 'u1', playerIn: 'a3', playerOut: 'c1', at: 700 }, // registrato ma la rosa non è cambiata
    ];
    const { rosa: allaScadenza, movimenti: validi } = M.rosaAllaScadenza(roster, movimenti, scadenza);
    assert.deepEqual([...allaScadenza].sort(), ['c1', 'sx']);
    assert.deepEqual(validi.map(m => m.playerIn), ['sx']);
});

test('rosa alla scadenza: una catena di trasferimenti prima della scadenza si applica in ordine', () => {
    const roster = { all: ['sy'] };
    const movimenti = [{ playerIn: 'sx', playerOut: 's1', at: 100 }, { playerIn: 'sy', playerOut: 'sx', at: 200 }];
    const { rosa: allaScadenza, movimenti: validi } = M.rosaAllaScadenza(roster, movimenti, 1000);
    assert.deepEqual([...allaScadenza], ['sy']);
    assert.deepEqual(validi.map(m => m.at), [100, 200]);
    const lineup = { starters: { S1: 's1' }, bench: [], captain: 's1', savedAt: 50 };
    assert.equal(M.applicaSostituzioni(lineup, validi, 1000).starters.S1, 'sy');
});
