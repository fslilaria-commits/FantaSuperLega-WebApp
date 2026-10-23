// Scheda Mercato: listone con ricerca, filtro per ruolo e fanta-squadra proprietaria nella lega selezionata
const marketFilter = { q: '', role: 'ALL', freeOnly: false };

document.getElementById('searchPlayer').addEventListener('input', e => {
    marketFilter.q = e.target.value.trim().toLowerCase();
    renderMarket();
});
document.getElementById('roleFilters').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    marketFilter.role = chip.dataset.role;
    document.querySelectorAll('#roleFilters .filter-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderMarket();
});
document.getElementById('freeOnly').addEventListener('change', e => {
    marketFilter.freeOnly = e.target.checked;
    renderMarket();
});

// playerId -> { uid, nome } della fanta-squadra che lo ha in rosa
function ownersInLeague() {
    const teamNames = Object.fromEntries(state.members.map(m => [m.uid, m.teamName]));
    const owners = {};
    for (const [uid, roster] of Object.entries(state.rosters)) {
        for (const id of roster.all || []) owners[id] = { uid, nome: teamNames[uid] || 'Squadra' };
    }
    return owners;
}

function renderMarket() {
    const owners = ownersInLeague();
    const visibili = state.players.filter(p =>
        (marketFilter.role === 'ALL' || p.role === marketFilter.role)
        && (!marketFilter.q || p.name.toLowerCase().includes(marketFilter.q) || p.team.toLowerCase().includes(marketFilter.q))
        && (!marketFilter.freeOnly || !owners[p.id]));

    document.getElementById('marketTableBody').replaceChildren(...visibili.map(p => el('tr', {},
        el('td', {}, el('div', { class: 'player-row' },
            el('img', { src: p.photo || 'img/avatar.svg', class: 'player-avatar', alt: '', loading: 'lazy', onerror: e => { e.target.onerror = null; e.target.src = 'img/avatar.svg'; } }),
            el('strong', {}, p.name))),
        el('td', {}, p.team),
        el('td', {}, el('span', { class: 'role-tag', title: ROLE_NAMES[p.role] }, p.role)),
        el('td', {}, state.league ? (owners[p.id] ? el('span', { class: 'owner' }, owners[p.id].nome) : el('span', { class: 'free' }, 'Svincolato')) : '—'),
        el('td', {}, azioneMercato(p, owners[p.id]?.uid)),
    )));

    document.getElementById('marketCount').textContent = `${visibili.length} giocatori su ${state.players.length}`;
}
