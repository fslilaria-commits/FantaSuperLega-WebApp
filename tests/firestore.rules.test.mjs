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
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where,
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
        await setDoc(doc(db, 'admins/boss'), { name: 'Admin' });
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
    test('il listone si vede solo dopo l\'accesso', async () => {
        await assertFails(getDoc(doc(as(null), 'players/p1')));
        await assertSucceeds(getDoc(doc(as('marco'), 'players/p1')));
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

describe('le mie leghe', () => {
    test('entrando in una lega la si aggiunge alle proprie', async () => {
        const db = as('marco');
        const batch = writeBatch(db);
        batch.set(doc(db, `leagues/${LEAGUE}/members/marco`), { teamName: 'Marco FC', code: CODE, joinedAt: Timestamp.now() });
        batch.set(doc(db, `users/marco/leagues/${LEAGUE}`), { joinedAt: Timestamp.now() });
        await assertSucceeds(batch.commit());
        await assertSucceeds(getDocs(collection(db, 'users/marco/leagues')));
    });

    test('non si aggiunge una lega in cui non si è entrati', async () => {
        await assertFails(setDoc(doc(as('marco'), `users/marco/leagues/${LEAGUE}`), { joinedAt: Timestamp.now() }));
    });

    test('non si leggono né si scrivono le leghe di un altro', async () => {
        await assertFails(getDocs(collection(as('marco'), 'users/anna/leagues')));
        await assertFails(setDoc(doc(as('marco'), `users/anna/leagues/${LEAGUE}`), { joinedAt: Timestamp.now() }));
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

    test('al massimo 2 P, 4 S, 3 C, 2 O, 1 L', async () => {
        const wrong = { ...roster, P: ['p1'], S: ['p2', 's1', 's2', 's3', 's4'] };
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/anna`), wrong));
    });

    test('durante l\'asta la rosa si salva anche incompleta', async () => {
        const parziale = { P: ['p1'], S: ['s1'], C: [], O: [], L: [], all: ['p1', 's1'], prices: { p1: 20, s1: 35 }, creditsLeft: 245 };
        await assertSucceeds(setDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/anna`), parziale));
    });

    test('i prezzi devono corrispondere ai giocatori della rosa', async () => {
        const sbagliata = { ...roster, prices: { p1: 10 } };
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/anna`), sbagliata));
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

    test('ognuno ritrova con una ricerca le proprie formazioni', async () => {
        const db = as('pres');
        await assertSucceeds(getDocs(query(collection(db, `leagues/${LEAGUE}/lineups`), where('uid', '==', 'pres'))));
        await assertFails(getDocs(query(collection(db, `leagues/${LEAGUE}/lineups`), where('uid', '==', 'anna'))));
    });

    test('le formazioni altrui si vedono solo dopo la scadenza', async () => {
        await assertFails(getDoc(ref(as('anna'), '1_pres')));
        await assertSucceeds(getDoc(ref(as('anna'), '2_pres')));
    });
});

describe('ruolo Admin', () => {
    const giocatore = {
        name: 'Simone Giannelli', team: 'Sir Susa Scai Perugia', teamId: 6865, role: 'P',
        number: 6, birthYear: 1996, nationality: 'ITA', photo: 'https://example.org/f.jpg', active: true,
    };

    test('nessuno si nomina admin dall\'app', async () => {
        await assertFails(setDoc(doc(as('anna'), 'admins/anna'), { name: 'Anna' }));
        await assertFails(setDoc(doc(as('boss'), 'admins/anna'), { name: 'Anna' }));
    });

    test('ognuno verifica solo se è admin lui stesso', async () => {
        await assertSucceeds(getDoc(doc(as('boss'), 'admins/boss')));
        await assertSucceeds(getDoc(doc(as('anna'), 'admins/anna')));
        await assertFails(getDoc(doc(as('anna'), 'admins/boss')));
        await assertFails(getDocs(collection(as('boss'), 'admins')));
    });

    test('l\'admin aggiorna il listone', async () => {
        await assertSucceeds(setDoc(doc(as('boss'), 'players/GIA-SIM-96'), giocatore));
        await assertSucceeds(updateDoc(doc(as('boss'), 'players/p1'), { active: false }));
    });

    test('anche l\'admin rispetta il formato dei giocatori', async () => {
        await assertFails(setDoc(doc(as('boss'), 'players/X'), { ...giocatore, role: 'Z' }));
        await assertFails(setDoc(doc(as('boss'), 'players/X'), { ...giocatore, price: 100 }));
    });

    test('i giocatori non si cancellano, si segnano come non attivi', async () => {
        await assertFails(deleteDoc(doc(as('boss'), 'players/p1')));
    });

    test('l\'admin gestisce giornate, statistiche e informazioni di aggiornamento', async () => {
        await assertSucceeds(updateDoc(doc(as('boss'), 'matchdays/1'), { lockAt: future }));
        await assertSucceeds(setDoc(doc(as('boss'), 'matchdays/1/stats/p1'), { set: 5 }));
        await assertSucceeds(setDoc(doc(as('boss'), 'meta/listone'), { appliedAt: Timestamp.now() }));
        await assertFails(setDoc(doc(as('anna'), 'meta/listone'), { appliedAt: Timestamp.now() }));
    });

    test('l\'admin scrive punteggi e classifica e vede le leghe', async () => {
        await assertSucceeds(setDoc(doc(as('boss'), `leagues/${LEAGUE}/scores/1_anna`), { total: 250 }));
        await assertSucceeds(setDoc(doc(as('boss'), `leagues/${LEAGUE}/standings/anna`), { total: 250 }));
        await assertSucceeds(getDoc(doc(as('boss'), `leagues/${LEAGUE}`)));
    });

    test('l\'admin legge partecipanti, rose e formazioni per calcolare i punteggi', async () => {
        const db = as('boss');
        await assertSucceeds(getDocs(collection(db, `leagues/${LEAGUE}/members`)));
        await assertSucceeds(getDocs(collection(db, `leagues/${LEAGUE}/rosters`)));
        await assertSucceeds(getDocs(collection(db, `leagues/${LEAGUE}/lineups`)));
        await assertSucceeds(getDocs(collection(db, 'leagues')));
    });

    test('chi non è admin né membro non legge formazioni e rose', async () => {
        await assertFails(getDocs(collection(as('marco'), `leagues/${LEAGUE}/lineups`)));
        await assertFails(getDocs(collection(as('marco'), `leagues/${LEAGUE}/rosters`)));
        await assertFails(getDocs(collection(as('marco'), 'leagues')));
    });

    test('l\'admin non fa il Presidente né schiera formazioni altrui', async () => {
        await assertFails(setDoc(doc(as('boss'), `leagues/${LEAGUE}/rosters/anna`), roster));
        await assertFails(updateDoc(doc(as('boss'), `leagues/${LEAGUE}`), { 'settings.budget': 1 }));
        await assertFails(setDoc(doc(as('boss'), `leagues/${LEAGUE}/lineups/1_anna`), lineup(1, 'anna')));
    });
});

describe('punteggi e classifica', () => {
    test('nessun utente scrive punteggi o classifica', async () => {
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/scores/1_pres`), { total: 999 }));
        await assertFails(setDoc(doc(as('anna'), `leagues/${LEAGUE}/standings/anna`), { total: 999 }));
    });
});
