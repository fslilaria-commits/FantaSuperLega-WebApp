// Pannello del Presidente: inserimento delle rose dopo l'asta.
// I controlli che le regole non possono fare (esclusività, massimo 4 per club, budget) li fa RoseCheck.
const rosterEdit = { leagueId: null, uid: null, picks: [], dirty: false };

document.getElementById('rosterMemberSelect').addEventListener('change', e => {
    if (rosterEdit.dirty) {
        // Le modifiche non salvate non si perdono cambiando squadra per sbaglio
        e.target.value = rosterEdit.uid;
        document.getElementById('rosterStatus').textContent = 'Hai modifiche non salvate: salvale prima di cambiare squadra.';
        return;
    }
    openRoster(e.target.value);
});
document.getElementById('saveRosterBtn').addEventListener('click', saveRoster);

function openRoster(uid) {
    rosterEdit.leagueId = state.league.id;
    rosterEdit.uid = uid;
    rosterEdit.picks = RoseCheck.rosterToPicks(state.rosters[uid]);
    rosterEdit.dirty = false;
    document.getElementById('rosterStatus').textContent = '';
    drawRosterEditor();
}

function renderRosterEditor() {
    const box = document.getElementById('presidentBox');
    box.hidden = !isPresident();
    if (box.hidden) return;

    const select = document.getElementById('rosterMemberSelect');
    select.replaceChildren(...state.members.map(m => el('option', { value: m.uid }, m.teamName)));
    const stillThere = rosterEdit.leagueId === state.league.id && state.members.some(m => m.uid === rosterEdit.uid);
    if (stillThere) {
        select.value = rosterEdit.uid;
        drawRosterEditor();
    } else if (state.members.length) {
        select.value = state.members[0].uid;
        openRoster(state.members[0].uid);
    }
}

function otherRosters() {
    return Object.fromEntries(Object.entries(state.rosters).filter(([uid]) => uid !== rosterEdit.uid));
}

function drawRosterEditor() {
    const budget = state.league.settings?.budget ?? 0;
    const check = RoseCheck.checkRoster({ picks: rosterEdit.picks, budget, playersById: state.playersById, altreRose: otherRosters() });
    const owned = new Set([...Object.values(otherRosters()).flatMap(r => r.all || []), ...rosterEdit.picks.map(p => p.id)]);

    const sections = Object.entries(RoseCheck.MAX_PER_RUOLO).map(([role, max]) => {
        const picks = rosterEdit.picks.filter(p => p.role === role);
        const free = state.players.filter(p => p.role === role && !owned.has(p.id));
        const addSelect = el('select', { 'aria-label': `Aggiungi ${ROLE_NAMES[role]}` },
            el('option', { value: '' }, `Aggiungi ${ROLE_NAMES[role].toLowerCase()}…`),
            free.map(p => el('option', { value: p.id }, `${p.name} · ${p.team}`)));
        const addPrice = el('input', { type: 'number', min: 0, value: budget ? 1 : 0, class: 'price-input', 'aria-label': 'Prezzo' });
        const full = picks.length >= max;

        return el('div', { class: 'roster-role' },
            el('h4', {}, `${ROLE_NAMES[role]} ${picks.length}/${max}`),
            picks.map(p => {
                const player = state.playersById[p.id];
                return el('div', { class: 'roster-row' },
                    el('span', { class: 'roster-name' }, player?.name || p.id, el('small', {}, ` · ${player?.team || ''}${player?.active === false ? ' · non più in SuperLega' : ''}`)),
                    el('input', {
                        type: 'number', min: 0, value: p.price, class: 'price-input', 'aria-label': 'Prezzo pagato',
                        onchange: e => { p.price = parseInt(e.target.value, 10) || 0; rosterEdit.dirty = true; drawRosterEditor(); },
                    }),
                    el('button', { class: 'btn btn-secondary btn-small', title: 'Togli dalla rosa', onclick: () => {
                        rosterEdit.picks = rosterEdit.picks.filter(x => x !== p);
                        rosterEdit.dirty = true;
                        drawRosterEditor();
                    } }, el('i', { class: 'fas fa-xmark' })));
            }),
            full ? null : el('div', { class: 'roster-row roster-add' }, addSelect, addPrice,
                el('button', { class: 'btn btn-primary btn-small', onclick: () => {
                    if (!addSelect.value) return;
                    rosterEdit.picks.push({ id: addSelect.value, role, price: parseInt(addPrice.value, 10) || 0 });
                    rosterEdit.dirty = true;
                    drawRosterEditor();
                } }, 'Aggiungi')));
    });

    const summary = el('div', { class: 'roster-summary' },
        el('span', {}, `Giocatori: ${rosterEdit.picks.length}/${RoseCheck.TOTALE}`),
        budget ? el('span', {}, `Crediti residui: ${check.creditsLeft} su ${budget}`) : el('span', {}, 'Asta senza crediti'),
        check.errors.map(e => el('p', { class: 'msg-error' }, e)),
        check.warnings.map(w => el('p', { class: 'msg-warning' }, w)));

    document.getElementById('rosterEditor').replaceChildren(summary, el('div', { class: 'roster-grid' }, sections));
    document.getElementById('saveRosterBtn').disabled = check.errors.length > 0;
}

async function saveRoster() {
    const status = document.getElementById('rosterStatus');
    const budget = state.league.settings?.budget ?? 0;
    const check = RoseCheck.checkRoster({ picks: rosterEdit.picks, budget, playersById: state.playersById, altreRose: otherRosters() });
    if (check.errors.length) {
        status.textContent = 'Correggi gli errori prima di salvare.';
        return;
    }
    const roster = RoseCheck.buildRoster(rosterEdit.picks, budget);
    try {
        await db.doc(`leagues/${state.league.id}/rosters/${rosterEdit.uid}`).set(roster);
        state.rosters[rosterEdit.uid] = roster;
        rosterEdit.dirty = false;
        status.textContent = check.complete ? 'Rosa completa salvata.' : `Rosa salvata (${rosterEdit.picks.length}/12).`;
        refreshAll();
    } catch (e) {
        status.textContent = 'Salvataggio non riuscito: ' + (e.code === 'permission-denied' ? 'solo il Presidente può modificare le rose.' : e.message);
    }
}
