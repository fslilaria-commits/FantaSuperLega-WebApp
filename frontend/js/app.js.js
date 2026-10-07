let currentSquad = JSON.parse(localStorage.getItem('my_squad')) || { starters: {}, bench: [] };
let marketPlayers = [];
let userBudget = 1000;

document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    await loadDynamicPlayers();
    renderMarket();
});

async function initAuth() {
    try {
        await auth.signInAnonymously();
        document.getElementById('userStatus').innerText = "Connesso";
    } catch (e) {
        document.getElementById('userStatus').innerText = "Modalità Offline";
    }
}

// Carica i giocatori da Firebase Firestore aggiornati dal bot, altrimenti usa il fallback
async function loadDynamicPlayers() {
    try {
        const snapshot = await db.collection('global_players').get();
        if (!snapshot.empty) {
            marketPlayers = snapshot.docs.map(doc => doc.data());
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
}

function renderMarket() {
    const tbody = document.getElementById('marketTableBody');
    tbody.innerHTML = marketPlayers.map(p => `
        <tr>
            <td>
                <div class="player-row">
                    <img src="${p.photo}" class="player-avatar" onerror="this.src='https://via.placeholder.com/40'">
                    <strong>${p.name}</strong>
                </div>
            </td>
            <td>${p.team}</td>
            <td><span class="role-tag">${p.role}</span></td>
            <td><strong>${p.price} G</strong></td>
            <td>
                <button class="btn btn-primary" onclick="buyPlayer('${p.id}')">Acquista</button>
            </td>
        </tr>
    `).join('');
}