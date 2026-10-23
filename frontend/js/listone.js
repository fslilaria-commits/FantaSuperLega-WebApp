// Scheda Mercato: listone con ricerca, filtro per ruolo e fanta-squadra proprietaria nella lega selezionata
const marketFilter = { q: '', role: 'ALL', freeOnly: false, sort: 'nome' };

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
document.getElementById('marketSort').addEventListener('change', e => {
    marketFilter.sort = e.target.value;
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
    const stat = id => state.statistiche[id];
    if (marketFilter.sort === 'media') visibili.sort((a, b) => (stat(b.id)?.media ?? -999) - (stat(a.id)?.media ?? -999));
    if (marketFilter.sort === 'ultima') visibili.sort((a, b) => (stat(b.id)?.ultima.fp ?? -999) - (stat(a.id)?.ultima.fp ?? -999));

    // Il pulsante di mercato compare due volte: nella sua colonna (computer) e sotto il nome (telefono, dove
    // la colonna è nascosta): il CSS ne mostra uno solo
    const azione = p => azioneMercato(p, owners[p.id]?.uid);
    riempi(document.getElementById('marketTableBody'), visibili.map(p => el('tr', {},
        el('td', {}, el('div', { class: 'player-row' },
            fotoGiocatore(p),
            el('div', { class: 'player-cell' },
                el('button', { class: 'link-player', onclick: () => apriGiocatore(p.id), title: 'Apri la scheda del giocatore' }, p.name),
                el('div', { class: 'azione-telefono' }, azione(p))))),
        el('td', {}, p.team),
        el('td', {}, el('span', { class: 'role-tag', title: ROLE_NAMES[p.role] }, p.role)),
        el('td', { class: 'num' }, stat(p.id) ? stat(p.id).media.toFixed(2) : '—'),
        el('td', { class: 'num' }, stat(p.id) ? stat(p.id).ultima.fp.toFixed(2) : '—'),
        el('td', {}, state.league ? (owners[p.id] ? el('span', { class: 'owner' }, owners[p.id].nome) : el('span', { class: 'free' }, 'Svincolato')) : '—'),
        el('td', { class: 'col-mercato' }, azione(p)),
    )));

    document.getElementById('marketCount').textContent = `${visibili.length} giocatori su ${state.players.length}`;
}
