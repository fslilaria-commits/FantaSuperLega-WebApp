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
    statistiche: {},    // playerId -> { g: { giornata: fp }, media, presenze, ultima }
    lineupSalvata: null, // la formazione della prossima giornata è salvata?
    matchday: null,     // prossima giornata da schierare: { id, number, label, lockAt: Date, provisional }
};

const STATO_VUOTO = {
    players: [], playersById: {}, leagues: [], league: null, members: [], rosters: {}, standings: {}, scores: [],
    schedule: null, transfers: [], matchdays: [], matchday: null, statistiche: {}, lineupSalvata: null,
};

const ROLE_NAMES = { P: 'Palleggiatore', S: 'Schiacciatore', C: 'Centrale', O: 'Opposto', L: 'Libero' };
const TABELLINI_INDICE = '../data/tabellini/index.json';
const AVATAR = 'img/avatar.svg';
const BATCH_SIZE = 400; // Firestore accetta al massimo 500 scritture per batch

// La stagione nelle scritte fisse della pagina viene da stagione.js, così ogni estate si cambia in un punto solo
document.title = `Fanta Superlega Maschile ${Stagione.nome}`;
document.querySelectorAll('[data-stagione]').forEach(e => { e.textContent = Stagione[e.dataset.stagione]; });

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    initAuth();
});

// App installabile: il service worker serve solo sul sito pubblicato (https), non in locale
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

// Accesso con Google: chi non ha fatto l'accesso vede solo la schermata di benvenuto
function initAuth() {
    const status = document.getElementById('userStatus');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!auth) {
        status.textContent = 'Configurazione Firebase mancante';
        return;
    }

    const login = async () => {
        try {
            await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        } catch (e) {
            if (e.code !== 'auth/popup-closed-by-user') status.textContent = 'Accesso non riuscito, riprova';
        }
    };
    loginBtn.addEventListener('click', login);
    document.getElementById('welcomeLoginBtn').addEventListener('click', login);
    logoutBtn.addEventListener('click', () => auth.signOut());

    auth.onAuthStateChanged(async user => {
        state.user = user;
        status.textContent = user ? (user.displayName || user.email || 'Connesso') : '';
        loginBtn.hidden = !!user;
        logoutBtn.hidden = !user;
        document.getElementById('mainNav').hidden = !user;

        if (!user) {
            Object.assign(state, structuredClone(STATO_VUOTO));
            chiudiInvito({ svuota: true });
            switchTab('welcome');
            return;
        }
        if (currentTab() === 'welcome') switchTab('home');
        try {
            await Promise.all([loadPlayers(), loadNextMatchday(), loadStatistiche()]);
            await loadMyLeagues();
            await gestisciInvito();
        } catch (e) {
            console.error(e);
            status.textContent = 'Errore nel caricamento dei dati, ricarica la pagina';
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

async function loadStatistiche() {
    const snap = await db.doc('meta/statistiche').get();
    state.statistiche = snap.exists ? snap.data().players || {} : {};
}

// Tutte le giornate (servono anche per la finestra di mercato) e la prossima non ancora bloccata.
// Una giornata senza scadenza (dato incompleto) viene ignorata invece di bloccare l'app.
async function loadNextMatchday() {
    const snap = await db.collection('matchdays').get();
    state.matchdays = snap.docs
        .filter(d => d.data().lockAt?.toDate)
        .map(d => ({ id: d.id, ...d.data(), lockAt: d.data().lockAt.toDate() }))
        .sort((a, b) => a.number - b.number);
    const now = new Date();
    state.matchday = state.matchdays.find(g => g.lockAt > now) || null;
}

// Ridisegna tutte le schede dopo un cambio di dati (lega, rose, listone).
// Se una scheda va in errore le altre si aggiornano comunque.
function refreshAll() {
    const viste = [renderMarket, renderLeague, renderRosterEditor, renderField, renderRisultati, renderMercato, renderPresidenteMercato, renderHome];
    for (const vista of viste) {
        try {
            const r = vista();
            if (r && r.catch) r.catch(e => console.error(`Errore in ${vista.name}`, e));
        } catch (e) {
            console.error(`Errore in ${vista.name}`, e);
        }
    }
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
    node.append(...figli(children));
    return node;
}

// Nodi da inserire: i valori vuoti (null, undefined, false) non diventano la scritta "null"
function figli(lista) {
    return lista.flat(Infinity)
        .filter(c => c !== null && c !== undefined && c !== false)
        .map(c => (c instanceof Node ? c : document.createTextNode(String(c))));
}

// Sostituisce il contenuto di un elemento ignorando i valori vuoti
function riempi(node, ...children) {
    node.replaceChildren(...figli(children));
}

// Foto del giocatore; se manca o non si carica, l'avatar (una sola volta, senza ricaricare all'infinito)
function fotoGiocatore(p, cls = 'player-avatar', altezza) {
    const src = p?.photo ? (altezza ? p.photo.replace(/heightImg=\d+/, `heightImg=${altezza}`) : p.photo) : AVATAR;
    return el('img', { src, class: cls, alt: '', loading: 'lazy', onerror: e => { if (!e.target.src.endsWith(AVATAR)) e.target.src = AVATAR; } });
}

// Elenchi a tendina: [titolo, elenco, riga(item)]; le sezioni vuote non compaiono
function listaDettagli(sezioni, apriFinoA = 10) {
    return sezioni.filter(([, elenco]) => elenco.length).map(([titolo, elenco, riga]) =>
        el('details', { class: 'admin-diff', open: elenco.length <= apriFinoA },
            el('summary', {}, `${titolo} (${elenco.length})`),
            el('ul', {}, elenco.map(item => el('li', {}, riga(item))))));
}

function formatDateTime(date) {
    return date.toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function myTeamName() {
    return state.members.find(m => m.uid === state.user?.uid)?.teamName || '';
}

function myRoster() {
    return state.rosters[state.user?.uid];
}

// Partecipanti con la data di iscrizione in millisecondi (criterio di parità in classifica)
function iscrittiConData() {
    return state.members.map(m => ({ ...m, joinedAt: m.joinedAt?.toMillis?.() ?? 0 }));
}

// Giornate con il tabellino scaricato e giornate già calcolate
async function giornateConTabellino() {
    const res = await fetch(`${TABELLINI_INDICE}?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? (await res.json()).giornate || [] : [];
}

function giornateCalcolate() {
    return new Set(state.matchdays.filter(g => g.status === 'scored').map(g => g.number));
}
