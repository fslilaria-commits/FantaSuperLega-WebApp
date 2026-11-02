// Test delle regole Firestore: si lanciano con `npm run test:rules` (avvia l'emulatore)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';

// Il codice del sito che costruisce squadre e formazioni a quotazioni: i test lo passano alle regole così com'è
const require = createRequire(import.meta.url);
const Quotazioni = require('../frontend/js/quotazioni.js');
const FormazioneCheck = require('../frontend/js/formazione-check.js');

const LEAGUE = 'lega1';
const CODE = '123456';
const future = Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000);
const past = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);

// Rosa valida: 2 P, 4 S, 4 C, 2 O, 2 L
const roster = {
    P: ['p1', 'p2'],
    S: ['s1', 's2', 's3', 's4'],
    C: ['c1', 'c2', 'c3', 'c4'],
    O: ['o1', 'o2'],
    L: ['l1', 'l2'],
};
roster.all = [...roster.P, ...roster.S, ...roster.C, ...roster.O, ...roster.L];
roster.prices = Object.fromEntries(roster.all.map(id => [id, 10]));
roster.creditsLeft = 100;

const lineup = (matchday, uid, overrides = {}) => ({
    uid,
    matchday,
    starters: { P: 'p1', S1: 's1', S2: 's2', C1: 'c1', C2: 'c2', O: 'o1', L: 'l1' },
    bench: ['p2', 's3', 's4', 'c3', 'c4', 'o2', 'l2'],
    captain: 's1',
    savedAt: serverTimestamp(),
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
        await setDoc(doc(db, `leagues/${LEAGUE}/members/pres`), { teamName: 'Presidenti', code: CODE, joinedAt: serverTimestamp() });
        await setDoc(doc(db, `leagues/${LEAGUE}/members/anna`), { teamName: 'Anna Team', code: CODE, joinedAt: serverTimestamp() });
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
        createdAt: serverTimestamp(),
    });

    test('chiunque abbia fatto l\'accesso crea una lega di cui è Presidente', async () => {
        const db = as('marco');
        const batch = writeBatch(db);
        batch.set(doc(db, 'leagues/lega2'), newLeague('marco'));
        batch.set(doc(db, 'leagueCodes/654321'), { leagueId: 'lega2' });
        batch.set(doc(db, 'leagues/lega2/members/marco'), { teamName: 'Marco FC', code: '654321', joinedAt: serverTimestamp() });
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
            teamName: 'Marco FC', code: CODE, joinedAt: serverTimestamp(),
        }));
    });

    test('con un codice sbagliato no', async () => {
        await assertFails(setDoc(doc(as('marco'), `leagues/${LEAGUE}/members/marco`), {
            teamName: 'Marco FC', code: '000000', joinedAt: serverTimestamp(),
        }));
    });

    test('non si iscrive qualcun altro', async () => {
        await assertFails(setDoc(doc(as('marco'), `leagues/${LEAGUE}/members/luca`), {
            teamName: 'Luca FC', code: CODE, joinedAt: serverTimestamp(),
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
        batch.set(doc(db, `leagues/${LEAGUE}/members/marco`), { teamName: 'Marco FC', code: CODE, joinedAt: serverTimestamp() });
        batch.set(doc(db, `users/marco/leagues/${LEAGUE}`), { joinedAt: serverTimestamp() });
        await assertSucceeds(batch.commit());
        await assertSucceeds(getDocs(collection(db, 'users/marco/leagues')));
    });

    test('non si aggiunge una lega in cui non si è entrati', async () => {
        await assertFails(setDoc(doc(as('marco'), `users/marco/leagues/${LEAGUE}`), { joinedAt: serverTimestamp() }));
    });

    test('non si leggono né si scrivono le leghe di un altro', async () => {
        await assertFails(getDocs(collection(as('marco'), 'users/anna/leagues')));
        await assertFails(setDoc(doc(as('marco'), `users/anna/leagues/${LEAGUE}`), { joinedAt: serverTimestamp() }));
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
        const all = [...roster.P, ...roster.S, ...roster.C, 'o1', 'p1', ...roster.L];
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

    test("la propria formazione si legge anche prima di averla salvata, quella degli altri no", async () => {
        await assertSucceeds(getDoc(ref(as('anna'), '3_anna')));
        await assertFails(getDoc(ref(as('anna'), '3_pres')));
        await assertFails(getDoc(ref(as('marco'), '3_marco')), 'chi non è nella lega no');
    });

    test('non si schiera la formazione di un altro', async () => {
        await assertFails(setDoc(ref(as('anna'), '1_pres'), lineup(1, 'pres')));
    });

    test('solo giocatori della propria rosa', async () => {
        const bad = lineup(1, 'anna', { bench: ['p2', 's3', 's4', 'c3', 'c4', 'o2', 'altro'] });
        await assertFails(setDoc(ref(as('anna'), '1_anna'), bad));
    });

    test('ogni giocatore nel suo ruolo', async () => {
        const bad = lineup(1, 'anna', {
            starters: { P: 's1', S1: 'p1', S2: 's2', C1: 'c1', C2: 'c2', O: 'o1', L: 'l1' },
        });
        await assertFails(setDoc(ref(as('anna'), '1_anna'), bad));
    });

    test('nessun giocatore due volte', async () => {
        const bad = lineup(1, 'anna', { bench: ['p2', 's3', 's4', 'c3', 'c4', 'o2', 's1'] });
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
        number: 6, birthYear: 1996, nationality: 'ITA', photo: 'https://www.legavolley.it/Foto.aspx?Key=GIA-SIM-96', active: true,
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

    test('i giocatori li cancella solo l\'admin (nuova stagione); in stagione si segnano come non attivi', async () => {
        await assertFails(deleteDoc(doc(as('anna'), 'players/p1')));
        await assertFails(deleteDoc(doc(as('pres'), 'players/p1')));
        await assertSucceeds(deleteDoc(doc(as('boss'), 'players/p1')));
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

describe('scontri diretti', () => {
    const SCONTRI = 'lega-scontri';
    const calendario = { teams: ['pres', 'anna'], rounds: { 1: [{ a: 'pres', b: 'anna' }] }, createdAt: Timestamp.now(), createdBy: 'pres' };

    beforeEach(async () => {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            for (const [id, code, start] of [[SCONTRI, '222222', 1], ['lega-iniziata', '333333', 2]]) {
                await setDoc(doc(db, `leagues/${id}`), {
                    name: 'Scontri', code, presidentUid: 'pres',
                    settings: { budget: 300, mode: 'scontri', startMatchday: start }, createdAt: Timestamp.now(),
                });
                await setDoc(doc(db, `leagueCodes/${code}`), { leagueId: id });
                await setDoc(doc(db, `leagues/${id}/members/pres`), { teamName: 'Presidenti', code, joinedAt: serverTimestamp() });
            }
        });
    });

    test('il Presidente genera il calendario prima della giornata di inizio', async () => {
        await assertSucceeds(setDoc(doc(as('pres'), `leagues/${SCONTRI}/schedule/main`), calendario));
    });

    test('un calendario senza elenco delle squadre non si salva', async () => {
        await assertFails(setDoc(doc(as('pres'), `leagues/${SCONTRI}/schedule/main`), { ...calendario, teams: 'tutti' }));
    });

    test('dopo l\'inizio il Presidente non lo cambia più, l\'admin sì', async () => {
        await assertFails(setDoc(doc(as('pres'), 'leagues/lega-iniziata/schedule/main'), calendario));
        await assertSucceeds(setDoc(doc(as('boss'), 'leagues/lega-iniziata/schedule/main'), calendario));
    });

    test('dopo la creazione il calendario lo cambia solo un admin', async () => {
        await setDoc(doc(as('pres'), `leagues/${SCONTRI}/schedule/main`), calendario);
        await assertFails(setDoc(doc(as('pres'), `leagues/${SCONTRI}/schedule/main`), { ...calendario, rounds: {} }));
        await assertSucceeds(setDoc(doc(as('boss'), `leagues/${SCONTRI}/schedule/main`), { ...calendario, rounds: {} }));
    });

    test("dopo l'inizio il Presidente non cambia giornata di inizio né tipo di lega", async () => {
        await assertFails(updateDoc(doc(as('pres'), 'leagues/lega-iniziata'), { 'settings.startMatchday': 22 }));
        await assertFails(updateDoc(doc(as('pres'), 'leagues/lega-iniziata'), { 'settings.mode': 'classifica' }));
        await assertSucceeds(updateDoc(doc(as('pres'), 'leagues/lega-iniziata'), { 'settings.budget': 400 }), 'il budget sì');
    });

    test('con il calendario generato la giornata di inizio non si cambia più', async () => {
        await setDoc(doc(as('pres'), `leagues/${SCONTRI}/schedule/main`), calendario);
        await assertFails(updateDoc(doc(as('pres'), `leagues/${SCONTRI}`), { 'settings.startMatchday': 3 }));
    });

    test('un partecipante non scrive il calendario', async () => {
        await assertFails(setDoc(doc(as('anna'), `leagues/${SCONTRI}/schedule/main`), calendario));
    });

    test('senza calendario si entra, con il calendario generato no', async () => {
        const entra = uid => setDoc(doc(as(uid), `leagues/${SCONTRI}/members/${uid}`), { teamName: uid, code: '222222', joinedAt: serverTimestamp() });
        await assertSucceeds(entra('marco'));
        await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `leagues/${SCONTRI}/schedule/main`), calendario));
        await assertFails(entra('luca'));
    });

    test('nella classifica generale si entra anche a campionato iniziato', async () => {
        await assertSucceeds(setDoc(doc(as('marco'), `leagues/${LEAGUE}/members/marco`), { teamName: 'Marco FC', code: CODE, joinedAt: serverTimestamp() }));
    });
});

describe('mercato', () => {
    const offerta = (uid, extra = 5) => ({ uid, playerIn: 'sx', playerOut: 's1', role: 'S', extra, status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    const offRef = (db, n, uid) => doc(db, `leagues/${LEAGUE}/markets/${n}/offers/${uid}_sx`);
    const scambio = { from: 'pres', to: 'anna', give: 's2', take: 's3', role: 'S', extra: 10, status: 'proposed', matchday: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };

    beforeEach(async () => {
        await env.withSecurityRulesDisabled(async ctx => {
            // offerta di Anna nella finestra già chiusa della giornata 2, e uno scambio già accettato
            await setDoc(offRef(ctx.firestore(), 2, 'anna'), offerta('anna'));
            await setDoc(doc(ctx.firestore(), `leagues/${LEAGUE}/trades/accettato`), { ...scambio, status: 'accepted' });
        });
    });

    test('a mercato aperto si fa un\'offerta lasciando un proprio giocatore dello stesso ruolo', async () => {
        await assertSucceeds(setDoc(offRef(as('anna'), 1, 'anna'), offerta('anna')));
    });

    test('offerte non valide: dopo la chiusura, giocatore già in rosa, giocatore da lasciare non proprio', async () => {
        await assertFails(setDoc(offRef(as('pres'), 2, 'pres'), offerta('pres')));
        await assertFails(setDoc(doc(as('anna'), `leagues/${LEAGUE}/markets/1/offers/anna_s4`), { ...offerta('anna'), playerIn: 's4' }));
        await assertFails(setDoc(offRef(as('anna'), 1, 'anna'), { ...offerta('anna'), playerOut: 'nonmio' }));
        await assertFails(setDoc(offRef(as('anna'), 1, 'pres'), offerta('pres')), 'a nome di un altro');
    });

    test('con il mercato sospeso dal Presidente niente offerte', async () => {
        await assertSucceeds(updateDoc(doc(as('pres'), `leagues/${LEAGUE}`), { 'settings.marketSuspended': true }));
        await assertFails(setDoc(offRef(as('anna'), 1, 'anna'), offerta('anna')));
    });

    test('le offerte sono segrete: nessuno le legge prima della chiusura, nemmeno il Presidente', async () => {
        await setDoc(offRef(as('anna'), 1, 'anna'), offerta('anna'));
        await assertSucceeds(getDoc(offRef(as('anna'), 1, 'anna')));
        await assertFails(getDoc(offRef(as('pres'), 1, 'anna')));
        await assertFails(getDocs(collection(as('pres'), `leagues/${LEAGUE}/markets/1/offers`)));
        await assertSucceeds(getDocs(collection(as('pres'), `leagues/${LEAGUE}/markets/2/offers`)), 'dopo la chiusura sì');
    });

    test('chi ha fatto l\'offerta la cambia o la ritira, ma non cambia il giocatore richiesto', async () => {
        await setDoc(offRef(as('anna'), 1, 'anna'), offerta('anna'));
        await assertSucceeds(updateDoc(offRef(as('anna'), 1, 'anna'), { extra: 20, updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(offRef(as('anna'), 1, 'anna'), { playerIn: 'sy' }));
        await assertSucceeds(updateDoc(offRef(as('anna'), 1, 'anna'), { status: 'withdrawn', updatedAt: serverTimestamp() }));
        await assertSucceeds(updateDoc(offRef(as('anna'), 1, 'anna'), { status: 'active', extra: 3, updatedAt: serverTimestamp() }), 'e la rifà');
    });

    test('il Presidente segna l\'esito solo dopo la chiusura', async () => {
        await assertSucceeds(updateDoc(offRef(as('pres'), 2, 'anna'), { status: 'won', updatedAt: serverTimestamp() }));
        await setDoc(offRef(as('anna'), 1, 'anna'), offerta('anna'));
        await assertFails(updateDoc(offRef(as('pres'), 1, 'anna'), { status: 'won', updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(offRef(as('anna'), 2, 'anna'), { status: 'won', updatedAt: serverTimestamp() }), 'non da solo');
    });

    test('scambi: si propone tra giocatori dello stesso ruolo, l\'altro accetta o rifiuta', async () => {
        await assertSucceeds(setDoc(doc(as('pres'), `leagues/${LEAGUE}/trades/t1`), scambio));
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/trades/t2`), { ...scambio, take: 'c1' }), 'ruolo diverso');
        await assertFails(updateDoc(doc(as('pres'), `leagues/${LEAGUE}/trades/t1`), { status: 'accepted', updatedAt: serverTimestamp() }), 'non si accetta da soli');
        await assertSucceeds(updateDoc(doc(as('anna'), `leagues/${LEAGUE}/trades/t1`), { status: 'accepted', updatedAt: serverTimestamp() }));
        await assertFails(getDoc(doc(as('marco'), `leagues/${LEAGUE}/trades/t1`)), 'chi non c\'entra non lo vede');
    });

    test('il rilancio chiude la proposta ricevuta e parte la controproposta nella stessa scrittura', async () => {
        await setDoc(doc(as('pres'), `leagues/${LEAGUE}/trades/t1`), scambio);
        const db = as('anna');
        const batch = writeBatch(db);
        batch.update(doc(db, `leagues/${LEAGUE}/trades/t1`), { status: 'countered', updatedAt: serverTimestamp() });
        batch.set(doc(db, `leagues/${LEAGUE}/trades/t2`), { ...scambio, from: 'anna', to: 'pres', give: 's3', take: 's2', extra: 0, counterOf: 't1' });
        await assertSucceeds(batch.commit());
    });

    test('gli scambi accettati li applica solo il Presidente', async () => {
        await assertFails(updateDoc(doc(as('anna'), `leagues/${LEAGUE}/trades/accettato`), { status: 'executed', updatedAt: serverTimestamp() }));
        await assertSucceeds(updateDoc(doc(as('pres'), `leagues/${LEAGUE}/trades/accettato`), { status: 'executed', updatedAt: serverTimestamp() }));
    });

    test('il registro dei movimenti lo scrive il Presidente e lo leggono tutti i membri', async () => {
        const mov = { tipo: 'svincolato', uid: 'anna', playerIn: 'sx', playerOut: 's1', valore: 15, extra: 5, matchday: 2, at: serverTimestamp() };
        await assertSucceeds(setDoc(doc(as('pres'), `leagues/${LEAGUE}/transfers/m1`), mov));
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/transfers/m3`), { ...mov, playerIn: 's1' }), 'arriva e parte lo stesso giocatore');
        await assertFails(setDoc(doc(as('anna'), `leagues/${LEAGUE}/transfers/m2`), mov));
        await assertSucceeds(getDocs(collection(as('anna'), `leagues/${LEAGUE}/transfers`)));
        await assertFails(getDocs(collection(as('marco'), `leagues/${LEAGUE}/transfers`)));
    });
});

describe('nuova stagione: cancellazioni e archivio', () => {
    const offRef = db => doc(db, `leagues/${LEAGUE}/markets/2/offers/anna_sx`);
    const archivio = (overrides = {}) => ({
        anno: 2026, stagione: '2026/27', lega: 'Lega del bar', modalita: 'classifica', uids: ['pres', 'anna'],
        classifica: [{ pos: 1, squadra: 'Anna Team', total: 300 }, { pos: 2, squadra: 'Presidenti', total: 250, presidente: true }],
        archiviatoAt: serverTimestamp(), archiviatoBy: 'boss', ...overrides,
    });

    beforeEach(async () => {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(offRef(db), { uid: 'anna', playerIn: 'sx', playerOut: 's1', role: 'S', extra: 0, status: 'won' });
            await setDoc(doc(db, `leagues/${LEAGUE}/trades/t1`), { from: 'pres', to: 'anna', status: 'executed' });
            await setDoc(doc(db, `leagues/${LEAGUE}/transfers/m1`), { tipo: 'scambio', uid: 'anna' });
            await setDoc(doc(db, `leagues/${LEAGUE}/schedule/main`), { teams: ['pres', 'anna'], rounds: {} });
            await setDoc(doc(db, 'users/anna/leagues/' + LEAGUE), { joinedAt: Timestamp.now() });
            await setDoc(doc(db, 'archivio/2025_vecchia'), { ...archivio({ anno: 2025, stagione: '2025/26' }), archiviatoAt: Timestamp.now() });
        });
    });

    // Tutto quello che il pulsante "Inizia la stagione" cancella
    const daCancellare = [
        `leagues/${LEAGUE}/markets/2/offers/anna_sx`, `leagues/${LEAGUE}/trades/t1`, `leagues/${LEAGUE}/transfers/m1`,
        `leagues/${LEAGUE}/schedule/main`, `leagues/${LEAGUE}/lineups/2_pres`, `leagues/${LEAGUE}/rosters/anna`,
        `leagues/${LEAGUE}/members/anna`, 'users/anna/leagues/' + LEAGUE, `leagueCodes/${CODE}`, `leagues/${LEAGUE}`,
        'matchdays/2', 'players/p1', 'meta/statistiche',
    ];

    test("l'admin cancella tutti i dati della stagione", async () => {
        const db = as('boss');
        const batch = writeBatch(db);
        for (const percorso of daCancellare) batch.delete(doc(db, percorso));
        await assertSucceeds(batch.commit());
    });

    test("per raccogliere cosa cancellare l'admin legge offerte chiuse, scambi, movimenti e calendario delle sfide", async () => {
        const db = as('boss');
        await assertSucceeds(getDocs(collection(db, `leagues/${LEAGUE}/markets/2/offers`)));
        await assertSucceeds(getDocs(collection(db, `leagues/${LEAGUE}/trades`)));
        await assertSucceeds(getDocs(collection(db, `leagues/${LEAGUE}/transfers`)));
        await assertSucceeds(getDocs(collection(db, `leagues/${LEAGUE}/schedule`)));
        await assertSucceeds(getDocs(collection(db, 'matchdays/2/stats')));
    });

    test('nessun altro cancella i dati della stagione, nemmeno il Presidente', async () => {
        const vietati = daCancellare.filter(p => ![`leagues/${LEAGUE}/rosters/anna`, `leagues/${LEAGUE}/members/anna`].includes(p));
        for (const percorso of vietati) {
            await assertFails(deleteDoc(doc(as('pres'), percorso)), `Presidente: ${percorso}`);
        }
        await assertFails(deleteDoc(doc(as('marco'), 'users/anna/leagues/' + LEAGUE)), 'le leghe di un altro');
        await assertSucceeds(deleteDoc(doc(as('anna'), 'users/anna/leagues/' + LEAGUE)), 'le proprie sì, come prima');
    });

    test("gli admin non si cancellano dall'app", async () => {
        await assertFails(deleteDoc(doc(as('boss'), 'admins/boss')));
    });

    test("l'admin archivia la classifica finale", async () => {
        await assertSucceeds(setDoc(doc(as('boss'), 'archivio/2026_lega1'), archivio()));
        await assertFails(setDoc(doc(as('boss'), 'archivio/2026_lega2'), archivio({ archiviatoBy: 'anna' })), 'a nome di un altro');
        await assertFails(setDoc(doc(as('boss'), 'archivio/2026_lega3'), archivio({ extra: 1 })), 'campi in più');
        await assertFails(setDoc(doc(as('boss'), 'archivio/2026_lega4'), archivio({ modalita: 'coppa' })));
        await assertSucceeds(setDoc(doc(as('boss'), 'archivio/2026_lega6'), archivio({ tipo: 'quotazioni' })), 'lega a quotazioni');
        await assertFails(setDoc(doc(as('boss'), 'archivio/2026_lega7'), archivio({ tipo: 'altro' })));
        await assertFails(setDoc(doc(as('pres'), 'archivio/2026_lega5'), archivio({ archiviatoBy: 'pres' })), 'il Presidente no');
    });

    test("l'archivio lo vede solo chi era nella lega, e nessuno lo cancella", async () => {
        await assertSucceeds(getDoc(doc(as('anna'), 'archivio/2025_vecchia')));
        await assertSucceeds(getDocs(query(collection(as('anna'), 'archivio'), where('uids', 'array-contains', 'anna'))));
        await assertFails(getDoc(doc(as('marco'), 'archivio/2025_vecchia')));
        await assertFails(getDocs(collection(as('anna'), 'archivio')), 'niente elenco completo');
        await assertFails(getDocs(query(collection(as('marco'), 'archivio'), where('uids', 'array-contains', 'anna'))), 'non quelli degli altri');
        await assertFails(deleteDoc(doc(as('boss'), 'archivio/2025_vecchia')));
    });
});

describe('protezioni aggiunte con la revisione', () => {
    test('la data di iscrizione la mette il server, non il browser', async () => {
        await assertFails(setDoc(doc(as('marco'), `leagues/${LEAGUE}/members/marco`), {
            teamName: 'Marco FC', code: CODE, joinedAt: Timestamp.fromMillis(Date.UTC(2099, 0, 1)),
        }));
    });

    test("la formazione porta l'ora di salvataggio del server", async () => {
        const { savedAt, ...senza } = lineup(1, 'anna');
        await assertFails(setDoc(doc(as('anna'), `leagues/${LEAGUE}/lineups/1_anna`), senza));
    });

    test('la scadenza di una giornata già bloccata non si sposta, nemmeno da un admin', async () => {
        await assertFails(updateDoc(doc(as('boss'), 'matchdays/2'), { lockAt: future }));
        await assertSucceeds(updateDoc(doc(as('boss'), 'matchdays/2'), { status: 'scored' }), 'gli altri campi sì');
    });

    test('le foto dei giocatori arrivano solo dal sito della Lega', async () => {
        const g = { name: 'X', team: 'Y', role: 'P', active: true };
        await assertSucceeds(setDoc(doc(as('boss'), 'players/ok'), { ...g, photo: 'https://www.legavolley.it/Foto.aspx?Key=X' }));
        await assertFails(setDoc(doc(as('boss'), 'players/ko'), { ...g, photo: 'https://altro-sito.example/traccia.gif' }));
    });
});

describe('correzioni manuali del tabellino', () => {
    const ref = (uid, id = 'tabellino') => doc(as(uid), `matchdays/1/correzioni/${id}`);
    const correzioni = uid => ({ righe: { '6858|Rossi Mario': { id: 'p1' } }, updatedAt: serverTimestamp(), updatedBy: uid });

    test("le scrive e le legge solo un admin, con data del server e il proprio nome", async () => {
        await assertSucceeds(setDoc(ref('boss'), correzioni('boss')));
        await assertSucceeds(getDoc(ref('boss')));
        await assertSucceeds(updateDoc(ref('boss'), { 'righe.6858|Bianchi Luca': { id: null }, updatedAt: serverTimestamp(), updatedBy: 'boss' }));
        await assertFails(getDoc(ref('anna')), 'un partecipante non le legge');
        await assertFails(setDoc(ref('anna'), correzioni('anna')), 'né le scrive');
        await assertFails(setDoc(ref('boss'), { ...correzioni('boss'), updatedAt: Timestamp.now() }), 'data del browser');
        await assertFails(setDoc(ref('boss'), { ...correzioni('boss'), updatedBy: 'anna' }), 'a nome di un altro');
        await assertFails(setDoc(ref('boss', 'altro'), correzioni('boss')), 'un solo documento per giornata');
        await assertFails(setDoc(ref('boss'), { ...correzioni('boss'), extra: 1 }), 'campi in più');
    });
});

describe('punteggi e classifica', () => {
    test('nessun utente scrive punteggi o classifica', async () => {
        await assertFails(setDoc(doc(as('pres'), `leagues/${LEAGUE}/scores/1_pres`), { total: 999 }));
        await assertFails(setDoc(doc(as('anna'), `leagues/${LEAGUE}/standings/anna`), { total: 999 }));
    });
});

describe('leghe a quotazioni', () => {
    const QL = 'quot';
    const QCODE = '222222';
    const ruoli = { P: ['qp1', 'qp2'], S: ['qs1', 'qs2', 'qs3', 'qs4'], C: ['qc1', 'qc2', 'qc3', 'qc4'], O: ['qo1', 'qo2'], L: ['ql1', 'ql2'] };
    // Ogni ruolo ha qualche giocatore in più per i cambi; qo3 costa troppo per il budget di 110
    const quotazioni = {
        P: { qp1: 7, qp2: 7, qp3: 7 },
        S: { qs1: 7, qs2: 7, qs3: 7, qs4: 7, qs5: 7, qs6: 7, qs7: 7 },
        C: { qc1: 7, qc2: 7, qc3: 7, qc4: 7, qc5: 7 },
        O: { qo1: 7, qo2: 7, qo3: 30 },
        L: { ql1: 7, ql2: 7, ql3: 7 },
    };
    const prezzoDi = id => Object.values(quotazioni).find(m => id in m)?.[id] ?? 7;
    const squadra = (r = ruoli, { giornata = 6, dalla = giornata, cambi = 0, prezzi = {} } = {}) => {
        const all = [...r.P, ...r.S, ...r.C, ...r.O, ...r.L];
        const prices = Object.fromEntries(all.map(id => [id, prezzi[id] ?? prezzoDi(id)]));
        return { ...r, all, prices, creditsLeft: 110 - Object.values(prices).reduce((a, b) => a + b, 0), giornata, dalla, cambi };
    };
    const formazione = (s, uid, n) => ({
        uid,
        matchday: n,
        starters: { P: s.P[0], S1: s.S[0], S2: s.S[1], C1: s.C[0], C2: s.C[1], O: s.O[0], L: s.L[0] },
        bench: [s.P[1], s.S[2], s.S[3], s.C[2], s.C[3], s.O[1], s.L[1]].filter(Boolean),
        captain: s.S[0],
        savedAt: serverTimestamp(),
    });
    // Squadra e formazione della sua giornata nello stesso salvataggio, come fa l'app
    const salva = (uid, s, { conFormazione = true, perChi = uid } = {}) => {
        const db = as(uid);
        const batch = writeBatch(db);
        batch.set(doc(db, `leagues/${QL}/rosters/${perChi}`), s);
        if (conFormazione) batch.set(doc(db, `leagues/${QL}/lineups/${s.giornata}_${uid}`), formazione(s, uid, s.giornata));
        return batch.commit();
    };
    const cambia = (r, ruolo, fuori, dentro) => ({ ...r, [ruolo]: r[ruolo].map(id => (id === fuori ? dentro : id)) });
    const giaSalvata = (uid, s) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `leagues/${QL}/rosters/${uid}`), s));

    beforeEach(async () => {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'matchdays/5'), { number: 5, lockAt: past, status: 'scored' });
            await setDoc(doc(db, 'matchdays/6'), { number: 6, lockAt: future, status: 'open' });
            await setDoc(doc(db, 'meta/quotazioni'), { prezzi: quotazioni });
            await setDoc(doc(db, `leagues/${QL}`), {
                name: 'Lega F1', code: QCODE, presidentUid: 'pres',
                settings: { budget: 110, mode: 'classifica', startMatchday: 5, tipo: 'quotazioni' },
                createdAt: Timestamp.now(),
            });
            for (const uid of ['pres', 'anna', 'marco']) {
                await setDoc(doc(db, `leagues/${QL}/members/${uid}`), { teamName: uid, code: QCODE, joinedAt: serverTimestamp() });
            }
        });
    });

    test('ognuno si fa la propria squadra insieme alla formazione, e lo stesso giocatore sta in più squadre', async () => {
        await assertSucceeds(salva('anna', squadra()));
        await assertSucceeds(salva('marco', squadra()));
    });

    test('non senza formazione, non per un altro, non dal Presidente né da chi è fuori dalla lega', async () => {
        await assertFails(salva('anna', squadra(), { conFormazione: false }));
        await assertFails(salva('anna', squadra(), { perChi: 'marco' }));
        await assertFails(setDoc(doc(as('pres'), `leagues/${QL}/rosters/anna`), squadra()), 'il Presidente non scrive le squadre');
        await assertFails(salva('estraneo', squadra()));
    });

    test('ruoli, prezzi, budget e giornata li controllano le regole', async () => {
        await assertFails(salva('anna', squadra(ruoli, { prezzi: { qp1: 1 } })), 'prezzo diverso dalla quotazione');
        await assertFails(salva('anna', squadra(cambia(ruoli, 'O', 'qo1', 'qo3'))), 'budget superato');
        await assertFails(salva('anna', { ...squadra(), creditsLeft: 50 }), 'crediti che non tornano');
        await assertFails(salva('anna', squadra(cambia(ruoli, 'P', 'qp1', 'qs5'))), 'uno schiacciatore tra i palleggiatori');
        await assertFails(salva('anna', squadra(cambia(ruoli, 'S', 'qs1', 'senzaprezzo'))), 'un giocatore senza quotazione');
        await assertFails(salva('anna', squadra({ ...ruoli, L: ['ql1'] })), 'squadra incompleta');
        await assertFails(salva('anna', squadra(ruoli, { giornata: 5 })), 'giornata già bloccata');
        await assertFails(salva('anna', { ...squadra(), extra: 1 }), 'campi in più');
    });

    test('chi resta tiene il prezzo pagato, chi arriva paga la quotazione', async () => {
        await giaSalvata('anna', squadra(ruoli, { giornata: 5, prezzi: { qp1: 3 } }));
        const conCambio = cambia(ruoli, 'S', 'qs1', 'qs5');
        await assertFails(salva('anna', squadra(conCambio, { dalla: 5, cambi: 1 })), 'qp1 alla quotazione di oggi');
        await assertSucceeds(salva('anna', squadra(conCambio, { dalla: 5, cambi: 1, prezzi: { qp1: 3 } })));
    });

    test('fino a 5 cambi per giornata, contati anche su più salvataggi', async () => {
        await giaSalvata('anna', squadra(ruoli, { giornata: 5 }));
        const due = cambia(cambia(ruoli, 'P', 'qp1', 'qp3'), 'S', 'qs1', 'qs5');
        await assertFails(salva('anna', squadra(due, { dalla: 5, cambi: 0 })), 'i cambi vanno contati');
        await assertSucceeds(salva('anna', squadra(due, { dalla: 5, cambi: 2 })));
        const tre = cambia(due, 'C', 'qc1', 'qc5');
        await assertFails(salva('anna', squadra(tre, { dalla: 5, cambi: 1 })), 'si sommano a quelli già fatti');
        await assertSucceeds(salva('anna', squadra(tre, { dalla: 5, cambi: 3 })));
        const sei = cambia(cambia(cambia(tre, 'S', 'qs2', 'qs6'), 'S', 'qs3', 'qs7'), 'L', 'ql1', 'ql3');
        await assertFails(salva('anna', squadra(sei, { dalla: 5, cambi: 6 })), 'più di 5');
        await assertFails(salva('anna', squadra(sei, { dalla: 5, cambi: 5 })));
    });

    test('nella prima giornata della squadra i cambi sono liberi', async () => {
        await giaSalvata('marco', squadra(ruoli, { giornata: 6 }));
        const tante = cambia(cambia(cambia(cambia(cambia(cambia(ruoli, 'P', 'qp1', 'qp3'), 'S', 'qs1', 'qs5'), 'S', 'qs2', 'qs6'), 'S', 'qs3', 'qs7'), 'C', 'qc1', 'qc5'), 'L', 'ql1', 'ql3');
        await assertSucceeds(salva('marco', squadra(tante, { dalla: 6, cambi: 0 })));
        await assertFails(salva('marco', squadra(tante, { dalla: 5, cambi: 0 })), 'la prima giornata non si sposta');
    });

    test('la formazione da sola si salva con i giocatori della propria squadra', async () => {
        await giaSalvata('anna', squadra());
        await assertSucceeds(setDoc(doc(as('anna'), `leagues/${QL}/lineups/6_anna`), formazione(squadra(), 'anna', 6)));
        const altra = squadra(cambia(ruoli, 'S', 'qs1', 'qs5'));
        await assertFails(setDoc(doc(as('anna'), `leagues/${QL}/lineups/6_anna`), formazione(altra, 'anna', 6)));
    });

    test('niente offerte, scambi né movimenti del Presidente', async () => {
        await giaSalvata('anna', squadra());
        await giaSalvata('pres', squadra());
        const now = serverTimestamp();
        await assertFails(setDoc(doc(as('anna'), `leagues/${QL}/markets/6/offers/anna_qs5`),
            { uid: 'anna', playerIn: 'qs5', playerOut: 'qs1', role: 'S', extra: 0, status: 'active', createdAt: now, updatedAt: now }));
        await assertFails(setDoc(doc(as('pres'), `leagues/${QL}/trades/t1`),
            { from: 'pres', to: 'anna', give: 'qs2', take: 'qs3', role: 'S', extra: 0, status: 'proposed', matchday: 6, createdAt: now, updatedAt: now }));
        await assertFails(setDoc(doc(as('pres'), `leagues/${QL}/transfers/m1`),
            { tipo: 'svincolato', uid: 'anna', playerIn: 'qs5', playerOut: 'qs1', valore: 7, extra: 0, matchday: 6, at: now }));
    });

    test('il Presidente non cancella le squadre a quotazioni (ad asta sì)', async () => {
        await giaSalvata('pres', squadra(ruoli, { giornata: 5 }));
        await giaSalvata('anna', squadra(ruoli, { giornata: 5 }));
        await assertFails(deleteDoc(doc(as('pres'), `leagues/${QL}/rosters/pres`)), 'rifarla azzererebbe i cambi');
        await assertFails(deleteDoc(doc(as('pres'), `leagues/${QL}/rosters/anna`)), 'quella di un altro');
        await assertSucceeds(deleteDoc(doc(as('pres'), `leagues/${LEAGUE}/rosters/anna`)), 'lega ad asta');
    });

    test("a quotazioni il budget non cambia nemmeno prima dell'inizio", async () => {
        await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `leagues/${QL}`), { 'settings.startMatchday': 6 }));
        await assertFails(updateDoc(doc(as('pres'), `leagues/${QL}`), { 'settings.budget': 1000 }));
        await assertSucceeds(updateDoc(doc(as('pres'), `leagues/${QL}`), { 'settings.mode': 'scontri' }), 'il resto sì, prima dell\'inizio');
    });

    test('in una giornata nuova i cambi ripartono da zero, e la giornata non torna indietro', async () => {
        await giaSalvata('anna', squadra(ruoli, { giornata: 5, dalla: 4, cambi: 4 }));
        const uno = cambia(ruoli, 'S', 'qs1', 'qs5');
        await assertFails(salva('anna', squadra(uno, { dalla: 4, cambi: 5 })), 'i 4 della giornata prima non contano');
        await assertSucceeds(salva('anna', squadra(uno, { dalla: 4, cambi: 1 })));
        // Squadra salvata per una giornata più avanti (scadenze non in ordine): non si torna alla 6
        await giaSalvata('marco', squadra(ruoli, { giornata: 7, dalla: 5, cambi: 0 }));
        await assertFails(salva('marco', squadra(uno, { dalla: 5, cambi: 1 })));
    });

    test('i cambi valgono solo per la prossima giornata, non per una più avanti', async () => {
        await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'matchdays/7'), { number: 7, lockAt: future, status: 'open' }));
        await assertFails(salva('anna', squadra(ruoli, { giornata: 7 })), 'la 6 non si è ancora bloccata');
    });

    test('un ruolo senza prezzi blocca solo chi arriva in quel ruolo', async () => {
        const { L, ...senzaLiberi } = quotazioni;
        await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'meta/quotazioni'), { prezzi: senzaLiberi }));
        await giaSalvata('anna', squadra(ruoli, { giornata: 5 }));
        await assertSucceeds(salva('anna', squadra(cambia(ruoli, 'S', 'qs1', 'qs5'), { dalla: 5, cambi: 1 })));
        await giaSalvata('marco', squadra(ruoli, { giornata: 5 }));
        await assertFails(salva('marco', squadra(cambia(ruoli, 'L', 'ql1', 'ql3'), { dalla: 5, cambi: 1 })));
    });

    test('squadra e cambi costruiti dal codice del sito passano le regole', async () => {
        const doc6 = { prezzi: quotazioni };
        // Giocatori sparsi su 6 club, così nessuno supera i 4 per club
        const playersById = {};
        Object.entries(quotazioni).flatMap(([ruolo, m]) => Object.keys(m).map(id => [id, ruolo]))
            .forEach(([id, ruolo], i) => { playersById[id] = { name: id, role: ruolo, team: `Club ${i % 6}`, active: true }; });
        const prezzi = Quotazioni.prezziPerId(doc6, playersById);
        const salvaDalSito = async (uid, picks, vecchia, precedente) => {
            const controllo = Quotazioni.controllaSquadra({ picks, vecchia, quotazioni: prezzi, budget: 110, playersById, giornata: 6 });
            assert.deepEqual(controllo.errors, []);
            const nuova = Quotazioni.costruisciSquadra({ picks, controllo, vecchia, giornata: 6 });
            const { starters, captain } = Quotazioni.formazioneDopoCambi({ nuova, precedente });
            const lineup = { ...FormazioneCheck.buildLineup({ roster: nuova, starters, captain, matchday: 6, uid }), savedAt: serverTimestamp() };
            const db = as(uid);
            const batch = writeBatch(db);
            batch.set(doc(db, `leagues/${QL}/rosters/${uid}`), nuova);
            batch.set(doc(db, `leagues/${QL}/lineups/6_${uid}`), lineup);
            await assertSucceeds(batch.commit());
            return { nuova, lineup };
        };
        // Squadra nuova, con i giocatori scelti in ordine sparso
        const picks = Object.entries(ruoli).flatMap(([role, ids]) => ids.map(id => ({ id, role }))).reverse();
        await salvaDalSito('anna', picks, null, null);
        // Squadra già salvata nella giornata prima: due cambi contati, con chi resta al prezzo pagato
        const prima = Quotazioni.costruisciSquadra({ picks, controllo: Quotazioni.controllaSquadra({ picks, quotazioni: { ...prezzi, qp2: 3 }, budget: 110, playersById, giornata: 5 }), vecchia: null, giornata: 5 });
        await giaSalvata('marco', prima);
        const conCambi = picks.map(p => (p.id === 'qs1' ? { id: 'qs5', role: 'S' } : p.id === 'qc1' ? { id: 'qc5', role: 'C' } : p));
        const { nuova } = await salvaDalSito('marco', conCambi, prima, formazione(prima, 'marco', 5));
        assert.equal(nuova.cambi, 2);
        assert.equal(nuova.prices.qp2, 3);
    });

    test("tipo di gioco fisso; a quotazioni il budget non cambia dopo l'inizio e va da 1 credito in su", async () => {
        await assertFails(updateDoc(doc(as('pres'), `leagues/${QL}`), { 'settings.tipo': 'asta' }));
        await assertFails(updateDoc(doc(as('pres'), `leagues/${LEAGUE}`), { 'settings.tipo': 'quotazioni' }));
        await assertFails(updateDoc(doc(as('pres'), `leagues/${QL}`), { 'settings.budget': 200 }), 'giornata di inizio già bloccata');
        await assertSucceeds(updateDoc(doc(as('pres'), `leagues/${QL}`), { name: 'Lega F1 bis' }));
        const nuova = (budget, tipo = 'quotazioni') => setDoc(doc(as('marco'), 'leagues/lega9'), {
            name: 'Nuova', code: '777777', presidentUid: 'marco', settings: { budget, mode: 'classifica', startMatchday: 1, tipo }, createdAt: serverTimestamp(),
        });
        await assertFails(nuova(0));
        await assertFails(nuova(99.5));
        await assertFails(nuova(100, 'altro'));
        await assertSucceeds(nuova(100));
    });
});
