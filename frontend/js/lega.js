// Scheda Lega: le mie leghe, creazione, ingresso con codice, partecipanti e classifica
const LEAGUE_KEY = 'fsl-lega-selezionata';
let richiestaLega = 0; // solo l'ultima lega scelta aggiorna lo stato, anche se una risposta precedente arriva dopo

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
    const richiesta = ++richiestaLega;
    const league = state.leagues.find(l => l.id === id) || null;
    const dati = { league, members: [], rosters: {}, standings: {}, scores: [], schedule: null, transfers: [] };
    if (league) {
        saveSelectedLeague(id);
        const [members, rosters, standings, scores, schedule, transfers] = await Promise.all([
            db.collection(`leagues/${id}/members`).get(),
            db.collection(`leagues/${id}/rosters`).get(),
            db.collection(`leagues/${id}/standings`).get(),
            db.collection(`leagues/${id}/scores`).get(),
            db.doc(`leagues/${id}/schedule/main`).get(),
            db.collection(`leagues/${id}/transfers`).get(),
        ]);
        dati.schedule = schedule.exists ? schedule.data() : null;
        dati.transfers = transfers.docs
            .map(d => ({ id: d.id, ...d.data(), at: d.data().at?.toMillis?.() ?? 0 }))
            .sort((a, b) => b.at - a.at);
        dati.members = members.docs
            .map(d => ({ uid: d.id, ...d.data() }))
            .sort((a, b) => a.teamName.localeCompare(b.teamName, 'it'));
        dati.rosters = Object.fromEntries(rosters.docs.map(d => [d.id, d.data()]));
        dati.standings = Object.fromEntries(standings.docs.map(d => [d.id, d.data()]));
        dati.scores = scores.docs.map(d => d.data());
    }
    if (richiesta !== richiestaLega) return;
    Object.assign(state, dati);
    refreshAll();
}

function isPresident() {
    return !!state.league && state.league.presidentUid === state.user?.uid;
}

function renderLeague() {
    const selectBox = document.getElementById('leagueSelectBox');
    const select = document.getElementById('leagueSelect');
    selectBox.hidden = state.leagues.length < 2;
    riempi(select, state.leagues.map(l => el('option', { value: l.id, selected: l.id === state.league?.id }, l.name)));

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

    // Classifica: negli scontri diretti contano i punti delle sfide, nella classifica generale i fanta-punti.
    // A parità: fanta-punti totali, poi chi si è iscritto prima (come nel FantaLVF)
    const scontri = l.settings?.mode === 'scontri';
    const ordinati = Scontri.ordinaClassifica(iscrittiConData(), state.standings, l.settings?.mode);
    riempi(document.getElementById('leaderboardHead'), el('tr', {},
        el('th', {}, 'Pos'), el('th', {}, 'Squadra'), el('th', {}, 'Rosa'),
        scontri ? el('th', { title: 'Vittorie, tie-break vinti e persi, sconfitte' }, 'V · TB · S') : el('th', {}, 'Ultima giornata'),
        el('th', {}, scontri ? 'Fanta-punti' : 'Punti'),
        scontri ? el('th', {}, 'Punti') : null));
    riempi(document.getElementById('leaderboardBody'), ordinati.map((m, i) => {
        const rosa = state.rosters[m.uid]?.all?.length || 0;
        const c = state.standings[m.uid];
        return el('tr', {},
            el('td', {}, i + 1),
            el('td', {},
                el('strong', {}, m.teamName),
                m.uid === l.presidentUid ? el('i', { class: 'fas fa-crown president-icon', title: 'Presidente' }) : null,
                m.uid === state.user.uid ? el('span', { class: 'admin-sub' }, ' (tu)') : null),
            el('td', {}, `${rosa}/12`),
            scontri
                ? el('td', {}, c ? `${c.won ?? 0} · ${c.tbWon ?? 0}/${c.tbLost ?? 0} · ${c.lost ?? 0}` : '—')
                : el('td', {}, c?.ultima ? `${c.ultima.total.toFixed(2)} (G${c.ultima.matchday})` : '—'),
            el('td', {}, scontri ? (c ? c.total.toFixed(2) : '—') : el('strong', {}, c ? c.total.toFixed(2) : '—')),
            scontri ? el('td', {}, el('strong', {}, c ? String(c.points ?? 0) : '—')) : null);
    }));
    document.getElementById('leaderboardNote').textContent = Object.keys(state.standings).length
        ? (scontri ? 'Vittoria 3 punti; a parità di fanta-punti tie-break: 2 punti a chi ha più punti in classifica generale, 1 all\'altro.' : '')
        : 'I punti compaiono dopo il calcolo della prima giornata.';
    renderSfide();
}

// Perché le regole hanno rifiutato l'ingresso: chi era già entrato ed è stato tolto, o calendario delle sfide già fatto
async function motivoIngressoNegato(leagueId) {
    try {
        if (leagueId && (await db.doc(`users/${state.user.uid}/leagues/${leagueId}`).get()).exists) {
            return 'Eri già entrato in questa lega e sei stato tolto: per rientrare chiedi al Presidente di scrivere all\'admin.';
        }
    } catch { /* si usa il messaggio generico */ }
    return 'Non puoi entrare: la lega è a scontri diretti e il calendario delle sfide è già stato generato.';
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
        const now = firebase.firestore.FieldValue.serverTimestamp();
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
    let legaTrovata = null; // per spiegare un eventuale rifiuto delle regole
    try {
        const codeDoc = await db.doc(`leagueCodes/${code}`).get();
        if (!codeDoc.exists) {
            status.textContent = 'Nessuna lega con questo codice: controlla le cifre.';
            return;
        }
        const leagueId = codeDoc.data().leagueId;
        legaTrovata = leagueId;
        if (state.leagues.some(l => l.id === leagueId)) {
            status.textContent = 'Sei già in questa lega.';
            await selectLeague(leagueId);
            return;
        }
        const now = firebase.firestore.FieldValue.serverTimestamp();
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
        status.textContent = err.code === 'permission-denied'
            ? await motivoIngressoNegato(legaTrovata)
            : 'Non sono riuscito a entrare nella lega, riprova.';
    }
}
