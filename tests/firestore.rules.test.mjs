// Test delle regole Firestore: si lanciano con `npm run test:rules` (avvia l'emulatore)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    writeBatch,
} from 'firebase/firestore';

const LEAGUE = 'lega1';
const CODE = '123456';
const future = Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000);
const past = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);

// Rosa valida: 2 P, 4 S, 3 C, 2 O, 1 L
const roster = {
    P: ['p1', 'p2'],
    S: ['s1', 's2', 's3', 's4'],
    C: ['c1', 'c2', 'c3'],
    O: ['o1', 'o2'],
    L: ['l1'],
};
roster.all = [...roster.P, ...roster.S, ...roster.C, ...roster.O, ...roster.L];
roster.prices = Object.fromEntries(roster.all.map(id => [id, 10]));
roster.creditsLeft = 100;

const lineup = (matchday, uid, overrides = {}) => ({
    uid,
    matchday,
    starters: { P: 'p1', S1: 's1', S2: 's2', C1: 'c1', C2: 'c2', O: 'o1', L: 'l1' },
    bench: ['p2', 's3', 's4', 'c3', 'o2'],
    captain: 's1',
    ...overrides,
});

let env;

before(async () => {
    env = await initializeTestEnvironment({
        projectId: 'demo-fantasuperlega',
        firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
});

after(async () => {
    await env?.cleanup();
});

beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'players/p1'), { name: 'Simone Giannelli', team: 'Perugia', role: 'P', active: true });
        await setDoc(doc(db, 'matchdays/1'), { number: 1, lockAt: future, status: 'open' });
        await setDoc(doc(db, 'matchdays/2'), { number: 2, lockAt: past, status: 'locked' });
        await setDoc(doc(db, `leagues/${LEAGUE}`), {
            name: 'Lega del bar',
            code: CODE,
            presidentUid: 'pres',
            settings: { budget: 300, mode: 'classifica', startMatchday: 1 },
            createdAt: Timestamp.now(),
        });
        await setDoc(doc(db, `leagueCodes/${CODE}`), { leagueId: LEAGUE });
        await setDoc(doc(db, `leagues/${LEAGUE}/members/pres`), { teamName: 'Presidenti', code: CODE, joinedAt: Timestamp.now() });
        await setDoc(doc(db, `leagues/${LEAGUE}/members/anna`), { teamName: 'Anna Team', code: CODE, joinedAt: Timestamp.now() });
        await setDoc(doc(db, `leagues/${LEAGUE}/rosters/anna`), roster);
        await setDoc(doc(db, `leagues/${LEAGUE}/rosters/pres`), roster);
        await setDoc(doc(db, `leagues/${LEAGUE}/lineups/2_pres`), lineup(2, 'pres'));
        await setDoc(doc(db, `leagues/${LEAGUE}/lineups/1_pres`), lineup(1, 'pres'));
    });
});

const as = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('listone e giornate', () => {
    test('il listone è leggibile anche senza accesso', async () => {
        await assertSucceeds(getDoc(doc(as(null), 'players/p1')));
    });

    test('nessun utente può modificare il listone', async () => {
        await assertFails(setDoc(doc(as('anna'), 'players/p1'), { name: 'X', team: 'X', role: 'P', active: true }));
    });

    test('nessun utente può spostare la scadenza di una giornata', async () => {
        await assertFails(updateDoc(doc(as('pres'), 'matchdays/1'), { lockAt: future }));
    });
});

describe('creazione lega e codici invito', () => {
    const newLeague = presidentUid => ({
        name: 'Nuova lega',
        code: '654321',
        presidentUid,
        settings: { budget: 300, mode: 'scontri', startMatchday: 3 },
        createdAt: Timestamp.now(),
    });

    test('chiunque abbia fatto l\'accesso crea una lega di cui è Presidente', async () => {
        const db = as('marco');
        const batch = writeBatch(db);
        batch.set(doc(db, 'leagues/lega2'), newLeague('marco'));
        batch.set(doc(db, 'leagueCodes/654321'), { leagueId: 'lega2' });
        batch.set(doc(db, 'leagues/lega2/members/marco'), { teamName: 'Marco FC', code: '654321', joinedAt: Timestamp.now() });
        await assertSucceeds(batch.commit());
    });

    test('non si crea una lega a nome di un altro', async () => {
        await assertFails(setDoc(doc(as('marco'), 'leagues/lega2'), newLeague('anna')));
    });

    test('non si riusa un codice invito già preso', async () => {
        const db = as('marco');
        const batch = writeBatch(db);
        batch.set(doc(db, 'leagues/lega2'), { ...newLeague('marco'), code: CODE });
        batch.set(doc(db, `leagueCodes/${CODE}`), { leagueId: 'lega2' });
        await assertFails(batch.commit());
    });

    test('un codice si legge, ma l\'elenco dei codici no', async () => {
        await assertSucceeds(getDoc(doc(as('marco'), `leagueCodes/${CODE}`)));
        await assertFails(getDocs(collection(as('marco'), 'leagueCodes')));
    });
});

describe('ingresso nella lega', () => {
    test('si entra con il codice giusto', async () => {
        await assertSucceeds(setDoc(doc(as('marco'), `leagues/${LEAGUE}/members/marco`), {
            teamName: 'Marco FC', code: CODE, joinedAt: Timestamp.now(),
        }));
    });

    test('con un codice sbagliato no', async () => {
        await assertFails(setDoc(doc(as('marco'), `leagues/${LEAGUE}/members/marco`), {
            teamName: 'Marco FC', code: '000000', joinedAt: Timestamp.now(),
        }));
    });

    test('non si iscrive qualcun altro', async () => {
        await assertFails(setDoc(doc(as('marco'), `leagues/${LEAGUE}/members/luca`), {
            teamName: 'Luca FC', code: CODE, joinedAt: Timestamp.now(),
        }));
    });

    test('chi non è nella lega non la vede', async () => {
        await assertFails(getDoc(doc(as('marco'), `leagues/${LEAGUE}`)));
        await assertSucceeds(getDoc(doc(as('anna'), `leagues/${LEAGUE}`)));
    });
});

describe('impostazioni della lega', () => {
    test('il Presidente cambia le impostazioni', async () => {
        await assertSucceeds(updateDoc(doc(as('pres'), `leagues/${LEAGUE}`), { 'settings.budget': 500 }));
    });

    test('un partecipante non può farlo', async () => {
        await assertFails(updateDoc(doc(as('anna'), `leagues/${LEAGUE}`), { 'settings.budget': 500 }));
    });

    test('nessuno si prende la presidenza o cambia il codice', async () => {
        await assertFails(updateDoc(doc(as('pres'), `leagues/${LEAGUE}`), { presidentUid: 'anna' }));
        await assertFails(updateDoc(doc(as('pres'), `leagues/${LEAGUE}`), { code: '999999' }));
    });
});

describe('rose', () => {
    test('il Presidente inserisce una rosa valida', async () => {
        await assertSucceeds(setDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/anna`), roster));
    });

    test('un partecipante non può scriversi la rosa', async () => {
        await assertFails(setDoc(doc(as('anna'), `leagues/${LEAGUE}/rosters/anna`), roster));
    });

    test('i ruoli devono essere 2 P, 4 S, 3 C, 2 O, 1 L', async () => {
        const wrong = { ...roster, P: ['p1'], S: ['p2', 's1', 's2', 's3', 's4'] };
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/anna`), wrong));
    });

    test('nessun giocatore ripetuto', async () => {
        const all = [...roster.all.slice(0, 11), 'p1'];
        const dup = { ...roster, O: ['o1', 'p1'], all };
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/anna`), dup));
    });

    test('la rosa si dà solo a chi è nella lega', async () => {
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/marco`), roster));
    });
});

describe('formazioni', () => {
    const ref = (db, id) => doc(db, `leagues/${LEAGUE}/lineups/${id}`);

    test('si schiera una formazione valida prima della scadenza', async () => {
        await assertSucceeds(setDoc(ref(as('anna'), '1_anna'), lineup(1, 'anna')));
    });

    test('dopo la scadenza non si cambia più', async () => {
        await assertFails(setDoc(ref(as('anna'), '2_anna'), lineup(2, 'anna')));
    });

    test('non si schiera la formazione di un altro', async () => {
        await assertFails(setDoc(ref(as('anna'), '1_pres'), lineup(1, 'pres')));
    });

    test('solo giocatori della propria rosa', async () => {
        const bad = lineup(1, 'anna', { bench: ['p2', 's3', 's4', 'c3', 'altro'] });
        await assertFails(setDoc(ref(as('anna'), '1_anna'), bad));
    });

    test('ogni giocatore nel suo ruolo', async () => {
        const bad = lineup(1, 'anna', {
            starters: { P: 's1', S1: 'p1', S2: 's2', C1: 'c1', C2: 'c2', O: 'o1', L: 'l1' },
        });
        await assertFails(setDoc(ref(as('anna'), '1_anna'), bad));
    });

    test('nessun giocatore due volte', async () => {
        const bad = lineup(1, 'anna', { bench: ['p2', 's3', 's4', 'c3', 's1'] });
        await assertFails(setDoc(ref(as('anna'), '1_anna'), bad));
    });

    test('il capitano deve essere titolare', async () => {
        await assertFails(setDoc(ref(as('anna'), '1_anna'), lineup(1, 'anna', { captain: 'p2' })));
    });

    test('le formazioni altrui si vedono solo dopo la scadenza', async () => {
        await assertFails(getDoc(ref(as('anna'), '1_pres')));
        await assertSucceeds(getDoc(ref(as('anna'), '2_pres')));
    });
});

describe('punteggi e classifica', () => {
    test('nessun utente scrive punteggi o classifica', async () => {
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/scores/1_pres`), { total: 999 }));
        await assertFails(setDoc(doc(as('anna'), `leagues/${LEAGUE}/standings/anna`), { total: 999 }));
    });
});
