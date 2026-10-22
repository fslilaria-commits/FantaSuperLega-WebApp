let currentSquad = JSON.parse(localStorage.getItem('my_squad')) || { starters: {}, bench: [] };
let marketPlayers = [];
let userBudget = 1000;

document.addEventListener('DOMContentLoaded', async () => {
    initAuth();
    await loadDynamicPlayers();
    renderMarket();
});

// Accesso con Google: la squadra resta legata all'account su ogni dispositivo
function initAuth() {
    const status = document.getElementById('userStatus');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!auth) {
        status.innerText = "Modalità Offline";
        return;
    }

    loginBtn.addEventListener('click', async () => {
        try {
            await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        } catch (e) {
            if (e.code !== 'auth/popup-closed-by-user') {
                status.innerText = "Accesso non riuscito, riprova";
            }
        }
    });
    logoutBtn.addEventListener('click', () => auth.signOut());

    auth.onAuthStateChanged(user => {
        status.innerText = user ? (user.displayName || user.email || "Connesso") : "Non connesso";
        loginBtn.hidden = !!user;
        logoutBtn.hidden = !user;
    });
}

// Carica i giocatori da Firebase Firestore aggiornati dal bot, altrimenti usa il fallback
async function loadDynamicPlayers() {
    if (!db) {
        marketPlayers = window.DEFAULT_PLAYERS;
        return;
    }
    try {
        const snapshot = await db.collection('players').get();
        if (!snapshot.empty) {
            marketPlayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            marketPlayers = window.DEFAULT_PLAYERS;
        }
    } catch (e) {
        console.warn("Impossibile caricare dal DB cloud, uso dati di default.", e);
        marketPlayers = window.DEFAULT_PLAYERS;
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.querySelector(`.nav-btn[data-tab="${tabId}"]`)?.classList.add('active');
}

// I dati dei giocatori arrivano da fonti esterne: vanno sempre trattati come testo
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

function renderMarket() {
    const tbody = document.getElementById('marketTableBody');
    tbody.innerHTML = marketPlayers.map(p => `
        <tr>
            <td>
                <div class="player-row">
                    <img src="${escapeHtml(p.photo || 'img/avatar.svg')}" class="player-avatar" alt="" onerror="this.onerror=null;this.src='img/avatar.svg'">
                    <strong>${escapeHtml(p.name)}</strong>
                </div>
            </td>
            <td>${escapeHtml(p.team)}</td>
            <td><span class="role-tag">${escapeHtml(p.role)}</span></td>
            <td><strong>${escapeHtml(p.price)} G</strong></td>
            <td>
                <button class="btn btn-primary" data-player-id="${escapeHtml(p.id)}">Acquista</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('marketTableBody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-player-id]');
    if (btn) buyPlayer(btn.dataset.playerId);
});