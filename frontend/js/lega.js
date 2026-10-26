// Scheda Lega: le mie leghe, creazione, ingresso con codice, partecipanti e classifica
const LEAGUE_KEY = 'fsl-lega-selezionata';
const INVITO_KEY = 'fsl-invito';
let richiestaLega = 0; // solo l'ultima lega scelta aggiorna lo stato, anche se una risposta precedente arriva dopo
let invitoInSospeso = leggiInvito();

document.getElementById('leagueSelect').addEventListener('change', e => selectLeague(e.target.value));
document.getElementById('createLeagueForm').addEventListener('submit', createLeague);
document.getElementById('joinLeagueForm').addEventListener('submit', joinLeague);
document.getElementById('inviteCopy').addEventListener('click', copiaInvito);
document.getElementById('inviteShare').addEventListener('click', condividiInvito);
document.getElementById('welcomeInvite').hidden = !invitoInSospeso;

// --- Inviti: link con il codice della lega (?invito=123456) ---

// All'apertura il codice si toglie dall'indirizzo e resta in sospeso fino all'accesso con Google
function leggiInvito() {
    const url = new URL(location.href);
    const codice = url.searchParams.get('invito');
    if (codice !== null) {
        url.searchParams.delete('invito');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    if (codice && /^\d{6}$/.test(codice)) {
        try { sessionStorage.setItem(INVITO_KEY, codice); } catch { /* resta per questa pagina */ }
        return codice;
    }
    try {
        const salvato = sessionStorage.getItem(INVITO_KEY);
        return /^\d{6}$/.test(salvato || '') ? salvato : null;
    } catch {
        return null;
    }
}

function linkInvito(codice) {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('invito', codice);
    if (useEmulators) url.searchParams.set('emulatori', '');
    return url.toString();
}

function testoInvito(l) {
    return `Ti invito nella mia lega "${l.name}" del Fanta SuperLega${stagioneLega ? ` ${stagioneLega.nome}` : ''}, il fantavolley della SuperLega. Apri il link, entra con Google e scegli il nome della tua squadra:`;
}

async function copiaInvito() {
    const link = linkInvito(state.league.code);
    const nota = document.getElementById('inviteNote');
    try {
        await navigator.clipboard.writeText(link);
        nota.textContent = 'Link copiato: incollalo nella chat che vuoi.';
    } catch {
        nota.textContent = `Copia questo link: ${link}`;
    }
}

async function condividiInvito() {
    const l = state.league;
    try {
        await navigator.share({ title: `Lega ${l.name}`, text: testoInvito(l), url: linkInvito(l.code) });
    } catch { /* condivisione annullata */ }
}

// Squadre che ci stanno in una lega con il listone di oggi. 0 = il listone non basta per una rosa intera
// (vuoto, non ancora caricato o senza giocatori di un ruolo): in quel caso nessun limite
function postiMassimi() {
    return RoseCheck.maxSquadre(state.players);
}

// Il modulo "Unisciti" torna normale: niente più apertura forzata, codice e messaggio dell'invito
function chiudiInvito({ svuota = false } = {}) {
    delete document.getElementById('joinCreateBox').dataset.invito;
    if (svuota) {
        document.getElementById('joinCode').value = '';
        document.getElementById('leagueFormStatus').textContent = '';
    }
}

// Dopo l'accesso: chi arriva da un link di invito trova il modulo "Unisciti" già compilato
async function gestisciInvito() {
    const codice = invitoInSospeso;
    invitoInSospeso = null;
    try { sessionStorage.removeItem(INVITO_KEY); } catch { /* niente da togliere */ }
    document.getElementById('welcomeInvite').hidden = true;
    if (!codice) return;
    switchTab('league');
    const box = document.getElementById('joinCreateBox');
    const status = document.getElementById('leagueFormStatus');
    let leagueId;
    try {
        const codeDoc = await db.doc(`leagueCodes/${codice}`).get();
        leagueId = codeDoc.exists ? codeDoc.data().leagueId : null;
    } catch { /* ricerca non riuscita: si prova comunque con il modulo */ }
    if (leagueId === null) {
        box.open = true;
        status.textContent = 'Il link di invito non corrisponde a nessuna lega: chiedi di nuovo il codice a chi ti ha invitato.';
        return;
    }
    if (leagueId && state.leagues.some(l => l.id === leagueId)) {
        await selectLeague(leagueId).catch(e => console.error(e)); // ci sei già: si apre la lega
        return;
    }
    box.dataset.invito = '1';
    box.open = true;
    document.getElementById('joinCode').value = codice;
    status.textContent = 'Ti hanno invitato in una lega: scrivi il nome della tua squadra e premi Unisciti.';
    document.getElementById('joinTeam').focus();
}

// Pulsanti di invito: spariscono quando la lega è al completo o non accetta più iscrizioni
function disegnaInvito(l, max) {
    const piena = max > 0 && state.members.length >= max;
    const chiusa = l.settings?.mode === 'scontri' && !!state.schedule;
    document.getElementById('inviteActions').hidden = piena || chiusa;
    document.getElementById('inviteShare').hidden = !navigator.share;
    document.getElementById('inviteWhatsApp').href = `https://wa.me/?text=${encodeURIComponent(`${testoInvito(l)} ${linkInvito(l.code)}`)}`;
    document.getElementById('inviteNote').textContent = chiusa ? 'Iscrizioni chiuse: il calendario delle sfide è già stato generato.'
        : piena ? `Lega al completo: con il listone di oggi ci stanno al massimo ${max} squadre.`
            : '';
}

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
    const box = document.getElementById('joinCreateBox');
    box.open = state.leagues.length === 0 || box.dataset.invito === '1';
    if (!state.league) return;

    const l = state.league;
    const modalita = l.settings?.mode === 'scontri' ? 'Scontri diretti' : 'Classifica generale';
    const crediti = l.settings?.budget ? `${l.settings.budget} crediti per l'asta` : 'Asta senza crediti';
    document.getElementById('leagueTitle').textContent = l.name;
    // Posti: le rose sono esclusive, quindi il listone decide quante squadre ci stanno
    const max = postiMassimi();
    const squadre = max ? `squadre ${state.members.length}/${max}` : `${state.members.length} squadre`;
    document.getElementById('leagueMeta').textContent = `${modalita} · ${crediti} · dalla giornata ${l.settings?.startMatchday ?? 1} · ${squadre}`;
    document.getElementById('leagueCodeDisplay').textContent = l.code;
    disegnaInvito(l, max);

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
            el('td', {}, `${rosa}/${RoseCheck.TOTALE}`),
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

// Chi è entrato quando i posti erano già finiti: conta l'ordine di iscrizione (data del server)
async function oltreIPosti(leagueId, uid) {
    const max = postiMassimi();
    if (!max) return false;
    const membri = (await db.collection(`leagues/${leagueId}/members`).get()).docs
        .map(d => {
            const t = d.data().joinedAt;
            return { uid: d.id, s: t?.seconds ?? Infinity, n: t?.nanoseconds ?? 0 };
        })
        .sort((a, b) => a.s - b.s || a.n - b.n || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
    return membri.findIndex(m => m.uid === uid) >= max;
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

    const nuova = await stagioneNuovaInAttesa();
    if (nuova) {
        status.textContent = `La stagione ${nuova.nome} non è ancora cominciata nel gioco: le leghe nuove si creano dopo che un admin preme «Inizia la stagione». Una lega creata prima verrebbe cancellata insieme alla stagione finita.`;
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
            chiudiInvito();
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
        // Da qui si è dentro. Le regole non sanno contare i partecipanti: se la lega era già al completo si esce
        // subito. Se la verifica non riesce (per esempio senza connessione) l'ingresso resta: il limite è un aiuto
        let messaggio = 'Sei entrato nella lega!';
        let fuori = false;
        try {
            fuori = await oltreIPosti(leagueId, uid);
        } catch (err) {
            console.error(err);
        }
        if (fuori) {
            try {
                const esci = db.batch();
                esci.delete(db.doc(`leagues/${leagueId}/members/${uid}`));
                esci.delete(db.doc(`users/${uid}/leagues/${leagueId}`));
                await esci.commit();
                chiudiInvito();
                status.textContent = `La lega è al completo: con il listone di oggi ci stanno al massimo ${postiMassimi()} squadre (le rose sono esclusive). Chiedi al Presidente.`;
                return;
            } catch (err) {
                console.error(err);
                messaggio = 'La lega era già al completo ma non sono riuscito a farti uscire: avvisa il Presidente.';
            }
        }
        chiudiInvito();
        e.target.reset();
        await loadMyLeagues(leagueId);
        status.textContent = messaggio;
    } catch (err) {
        console.error(err);
        status.textContent = err.code === 'permission-denied'
            ? await motivoIngressoNegato(legaTrovata)
            : 'Non sono riuscito a entrare nella lega, riprova.';
    }
}
