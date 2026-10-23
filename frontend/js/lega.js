// Scheda Lega: le mie leghe, creazione, ingresso con codice, partecipanti e classifica
const LEAGUE_KEY = 'fsl-lega-selezionata';

document.getElementById('leagueSelect').addEventListener('change', e => selectLeague(e.target.value));
document.getElementById('createLeagueForm').addEventListener('submit', createLeague);
document.getElementById('joinLeagueForm').addEventListener('submit', joinLeague);

function readSavedLeague() {
    try { return localStorage.getItem(`${LEAGUE_KEY}-${state.user.uid}`); } catch { return null; }
}

function saveSelectedLeague(id) {
    try { localStorage.setItem(`${LEAGUE_KEY}-${state.user.uid}`, id || ''); } catch { /* solo una comodità */ }
}

async function loadMyLeagues(preferredId) {
    const snap = await db.collection(`users/${state.user.uid}/leagues`).get();
    const leagues = await Promise.all(snap.docs.map(async d => {
        try {
            const l = await db.doc(`leagues/${d.id}`).get();
            return l.exists ? { id: l.id, ...l.data() } : null;
        } catch {
            return null; // per esempio se il Presidente ci ha rimosso dalla lega
        }
    }));
    state.leagues = leagues.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const wanted = preferredId || readSavedLeague();
    const pick = state.leagues.find(l => l.id === wanted) || state.leagues[0] || null;
    await selectLeague(pick?.id || null);
}

async function selectLeague(id) {
    state.league = state.leagues.find(l => l.id === id) || null;
    state.members = [];
    state.rosters = {};
    if (state.league) {
        saveSelectedLeague(id);
        const [members, rosters] = await Promise.all([
            db.collection(`leagues/${id}/members`).get(),
            db.collection(`leagues/${id}/rosters`).get(),
        ]);
        state.members = members.docs
            .map(d => ({ uid: d.id, ...d.data() }))
            .sort((a, b) => a.teamName.localeCompare(b.teamName, 'it'));
        state.rosters = Object.fromEntries(rosters.docs.map(d => [d.id, d.data()]));
    }
    refreshAll();
}

function isPresident() {
    return !!state.league && state.league.presidentUid === state.user?.uid;
}

function renderLeague() {
    const selectBox = document.getElementById('leagueSelectBox');
    const select = document.getElementById('leagueSelect');
    selectBox.hidden = state.leagues.length < 2;
    select.replaceChildren(...state.leagues.map(l => el('option', { value: l.id, selected: l.id === state.league?.id }, l.name)));

    const dashboard = document.getElementById('leagueDashboard');
    dashboard.hidden = !state.league;
    document.getElementById('joinCreateBox').open = state.leagues.length === 0;
    if (!state.league) return;

    const l = state.league;
    const modalita = l.settings?.mode === 'scontri' ? 'Scontri diretti' : 'Classifica generale';
    const crediti = l.settings?.budget ? `${l.settings.budget} crediti per l'asta` : 'Asta senza crediti';
    document.getElementById('leagueTitle').textContent = l.name;
    document.getElementById('leagueMeta').textContent = `${modalita} · ${crediti} · dalla giornata ${l.settings?.startMatchday ?? 1}`;
    document.getElementById('leagueCodeDisplay').textContent = l.code;

    document.getElementById('leaderboardBody').replaceChildren(...state.members.map((m, i) => {
        const rosa = state.rosters[m.uid]?.all?.length || 0;
        return el('tr', {},
            el('td', {}, i + 1),
            el('td', {},
                el('strong', {}, m.teamName),
                m.uid === l.presidentUid ? el('i', { class: 'fas fa-crown president-icon', title: 'Presidente' }) : null,
                m.uid === state.user.uid ? el('span', { class: 'admin-sub' }, ' (tu)') : null),
            el('td', {}, `${rosa}/12`),
            el('td', {}, '—'));
    }));
}

function randomCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function createLeague(e) {
    e.preventDefault();
    const status = document.getElementById('leagueFormStatus');
    const name = document.getElementById('newLeagueName').value.trim();
    const teamName = document.getElementById('newLeagueTeam').value.trim();
    const budget = parseInt(document.getElementById('newLeagueBudget').value, 10);
    const mode = document.getElementById('newLeagueMode').value;
    if (!name || !teamName || !Number.isInteger(budget) || budget < 0) {
        status.textContent = 'Compila nome della lega, nome della squadra e crediti.';
        return;
    }

    status.textContent = 'Creo la lega…';
    const uid = state.user.uid;
    for (let tentativo = 0; tentativo < 5; tentativo++) {
        const code = randomCode();
        if ((await db.doc(`leagueCodes/${code}`).get()).exists) continue;
        const leagueRef = db.collection('leagues').doc();
        const now = firebase.firestore.Timestamp.now();
        const batch = db.batch();
        batch.set(leagueRef, {
            name,
            code,
            presidentUid: uid,
            settings: { budget, mode, startMatchday: state.matchday?.number || 1 },
            createdAt: now,
        });
        batch.set(db.doc(`leagueCodes/${code}`), { leagueId: leagueRef.id });
        batch.set(db.doc(`leagues/${leagueRef.id}/members/${uid}`), { teamName, code, joinedAt: now });
        batch.set(db.doc(`users/${uid}/leagues/${leagueRef.id}`), { joinedAt: now });
        try {
            await batch.commit();
            status.textContent = `Lega creata! Codice da condividere con gli amici: ${code}`;
            e.target.reset();
            await loadMyLeagues(leagueRef.id);
            return;
        } catch (err) {
            console.warn('Creazione lega non riuscita, riprovo con un altro codice', err);
        }
    }
    status.textContent = 'Non sono riuscito a creare la lega, riprova tra poco.';
}

async function joinLeague(e) {
    e.preventDefault();
    const status = document.getElementById('leagueFormStatus');
    const code = document.getElementById('joinCode').value.trim();
    const teamName = document.getElementById('joinTeam').value.trim();
    if (!/^\d{6}$/.test(code) || !teamName) {
        status.textContent = 'Inserisci il codice a 6 cifre e il nome della tua squadra.';
        return;
    }

    status.textContent = 'Cerco la lega…';
    try {
        const codeDoc = await db.doc(`leagueCodes/${code}`).get();
        if (!codeDoc.exists) {
            status.textContent = 'Nessuna lega con questo codice: controlla le cifre.';
            return;
        }
        const leagueId = codeDoc.data().leagueId;
        if (state.leagues.some(l => l.id === leagueId)) {
            status.textContent = 'Sei già in questa lega.';
            await selectLeague(leagueId);
            return;
        }
        const now = firebase.firestore.Timestamp.now();
        const uid = state.user.uid;
        const batch = db.batch();
        batch.set(db.doc(`leagues/${leagueId}/members/${uid}`), { teamName, code, joinedAt: now });
        batch.set(db.doc(`users/${uid}/leagues/${leagueId}`), { joinedAt: now });
        await batch.commit();
        status.textContent = 'Sei entrato nella lega!';
        e.target.reset();
        await loadMyLeagues(leagueId);
    } catch (err) {
        console.error(err);
        status.textContent = 'Non sono riuscito a entrare nella lega, riprova.';
    }
}
