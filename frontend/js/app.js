// Stato condiviso tra le schede dell'app
const state = {
    user: null,
    players: [],        // listone: solo i giocatori attivi
    playersById: {},    // tutti, anche quelli usciti dalla SuperLega (possono essere ancora nelle rose)
    leagues: [],        // leghe dell'utente: [{ id, ...dati }]
    league: null,       // lega selezionata
    members: [],        // partecipanti della lega: [{ uid, teamName, ... }]
    rosters: {},        // uid -> rosa
    standings: {},      // uid -> { total, giornate, ultima: { matchday, total } }
    scores: [],         // punteggi di giornata della lega: [{ uid, matchday, total, dettaglio }]
    schedule: null,     // calendario degli scontri diretti: { teams, rounds: { giornata: [{ a, b }] } }
    transfers: [],      // registro dei movimenti di mercato della lega
    matchdays: [],      // tutte le giornate del calendario
    matchday: null,     // prossima giornata da schierare: { id, number, label, lockAt: Date, provisional }
};

const ROLE_NAMES = { P: 'Palleggiatore', S: 'Schiacciatore', C: 'Centrale', O: 'Opposto', L: 'Libero' };

document.addEventListener('DOMContentLoaded', initAuth);

// Accesso con Google: chi non ha fatto l'accesso vede solo la schermata di benvenuto
function initAuth() {
    const status = document.getElementById('userStatus');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!auth) {
        status.innerText = "Configurazione Firebase mancante";
        return;
    }

    const login = async () => {
        try {
            await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        } catch (e) {
            if (e.code !== 'auth/popup-closed-by-user') status.innerText = "Accesso non riuscito, riprova";
        }
    };
    loginBtn.addEventListener('click', login);
    document.getElementById('welcomeLoginBtn').addEventListener('click', login);
    logoutBtn.addEventListener('click', () => auth.signOut());

    auth.onAuthStateChanged(async user => {
        state.user = user;
        status.innerText = user ? (user.displayName || user.email || "Connesso") : "";
        loginBtn.hidden = !!user;
        logoutBtn.hidden = !user;
        document.getElementById('mainNav').hidden = !user;

        if (!user) {
            Object.assign(state, { players: [], playersById: {}, leagues: [], league: null, members: [], rosters: {}, standings: {}, scores: [], schedule: null, transfers: [], matchdays: [], matchday: null });
            switchTab('welcome');
            return;
        }
        if (currentTab() === 'welcome') switchTab('field');
        try {
            await Promise.all([loadPlayers(), loadNextMatchday()]);
            await loadMyLeagues();
        } catch (e) {
            console.error(e);
            status.innerText = "Errore nel caricamento dei dati, ricarica la pagina";
        }
    });
}

async function loadPlayers() {
    const snapshot = await db.collection('players').get();
    const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    state.playersById = Object.fromEntries(all.map(p => [p.id, p]));
    state.players = all
        .filter(p => p.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

// Tutte le giornate (servono anche per la finestra di mercato) e la prossima non ancora bloccata
async function loadNextMatchday() {
    const snap = await db.collection('matchdays').get();
    state.matchdays = snap.docs
        .map(d => ({ id: d.id, ...d.data(), lockAt: d.data().lockAt.toDate() }))
        .sort((a, b) => a.number - b.number);
    const now = new Date();
    state.matchday = state.matchdays.find(g => g.lockAt > now) || null;
}

// Ridisegna tutte le schede dopo un cambio di dati (lega, rose, listone)
function refreshAll() {
    renderMarket();
    renderLeague();
    renderRosterEditor();
    renderField();
    renderRisultati();
    renderMercato();
    renderPresidenteMercato();
}

function currentTab() {
    return document.querySelector('.tab-content.active')?.id.replace('tab-', '');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.querySelector(`.nav-btn[data-tab="${tabId}"]`)?.classList.add('active');
}

// Crea un elemento DOM: i testi diventano nodi di testo, quindi i dati esterni non vengono mai interpretati come HTML
function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

function formatDateTime(date) {
    return date.toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function myTeamName() {
    return state.members.find(m => m.uid === state.user?.uid)?.teamName || '';
}
