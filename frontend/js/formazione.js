// Scheda Campo: formazione della prossima giornata, capitano e blocco alla scadenza
const lineupEdit = { key: null, starters: {}, captain: null, saved: false };
let pickerSlot = null;
// Trattino morbido: sui telefoni stretti il ruolo va a capo nel punto giusto anche se il browser non sillaba l'italiano
const SEGNAPOSTO = { S: 'Schiac­ciatore', P: 'Palleg­giatore' };

document.getElementById('saveLineupBtn').addEventListener('click', saveLineup);
document.getElementById('captainSelect').addEventListener('change', e => {
    lineupEdit.captain = e.target.value || null;
    lineupEdit.saved = false;
    drawField();
});
document.getElementById('pickerCloseBtn').addEventListener('click', closePicker);
document.getElementById('slotPicker').addEventListener('click', e => {
    if (e.target.id === 'slotPicker') closePicker();
});

function isLocked() {
    return !state.matchday || new Date() >= state.matchday.lockAt;
}

function fieldNotice(text) {
    const notice = document.getElementById('fieldNotice');
    notice.textContent = text || '';
    notice.hidden = !text;
    document.getElementById('fieldBody').hidden = !!text;
}

async function renderField() {
    const roster = myRoster();
    document.getElementById('squadNameDisplay').textContent = myTeamName() || 'La mia formazione';
    document.getElementById('budgetDisplay').textContent = roster ? `${roster.creditsLeft}` : '—';
    const badge = document.getElementById('deadlineBadge');
    badge.textContent = state.matchday
        ? `${state.matchday.label} · si blocca ${formatDateTime(state.matchday.lockAt)}${state.matchday.provisional ? ' (orario provvisorio)' : ''}`
        : '';

    if (!state.league) return fieldNotice('Per schierare la formazione entra in una lega dalla scheda Lega.');
    if (!state.matchday) return fieldNotice('Nessuna giornata da schierare: il calendario non è ancora stato caricato da un admin.');
    if (!FormazioneCheck.isRosterComplete(roster)) {
        return fieldNotice(`La tua rosa ha ${roster?.all?.length || 0} giocatori su ${RoseCheck.TOTALE}: il Presidente deve completarla dopo l'asta.`);
    }
    fieldNotice('');

    const key = `${state.league.id}_${state.matchday.number}_${state.user.uid}`;
    if (lineupEdit.key !== key) {
        lineupEdit.key = key;
        const caricata = await loadLineupForEdit(roster);
        if (lineupEdit.key !== key) return; // nel frattempo è cambiata lega o giornata
        Object.assign(lineupEdit, caricata);
    }
    drawField();
}

// Uguali titolare per titolare (Firestore restituisce le chiavi in ordine alfabetico: niente confronti tra JSON)
function stessaFormazione(a, b) {
    return FormazioneCheck.SLOTS.every(({ slot }) => (a.starters[slot] || null) === (b.starters?.[slot] || null))
        && a.captain === b.captain;
}

// La formazione salvata per questa giornata, oppure la precedente ancora valida come punto di partenza
async function loadLineupForEdit(roster) {
    const base = `leagues/${state.league.id}/lineups`;
    // Dopo un trasferimento chi arriva prende il posto di chi parte (come nel FantaLVF)
    const mieiMovimenti = state.transfers.filter(m => m.uid === state.user.uid);
    const aggiornata = l => l && Mercato.applicaSostituzioni({ ...l, savedAt: l.savedAt?.toMillis?.() ?? 0 }, mieiMovimenti, Date.now());
    try {
        const current = await db.doc(`${base}/${state.matchday.number}_${state.user.uid}`).get();
        if (current.exists) {
            const salvata = current.data();
            const valida = FormazioneCheck.suggestFrom(roster, aggiornata(salvata));
            return { ...valida, saved: stessaFormazione(valida, salvata) };
        }
        const mine = await db.collection(base).where('uid', '==', state.user.uid).get();
        const previous = mine.docs.map(d => d.data()).sort((a, b) => b.matchday - a.matchday)[0];
        return { ...FormazioneCheck.suggestFrom(roster, aggiornata(previous)), saved: false };
    } catch (e) {
        console.error(e);
        return { starters: {}, captain: null, saved: false };
    }
}

// Fanta-punti del giocatore, per scegliere chi schierare senza passare dal Mercato
function rigaStatistiche(id, completa) {
    const s = state.statistiche[id];
    if (!s) return completa ? el('small', { class: 'stat-line' }, 'Ancora nessuna giornata giocata') : null;
    return el('small', { class: 'stat-line' }, completa
        ? `media ${s.media.toFixed(2)} · ultima ${s.ultima.fp.toFixed(2)} (G${s.ultima.matchday}) · ${s.presenze} ${s.presenze === 1 ? 'presenza' : 'presenze'}`
        : `media ${s.media.toFixed(2)}`);
}

function playerCard(id, extra = {}) {
    const p = state.playersById[id];
    if (!p) return el('div', { class: 'player-slot-content empty' }, extra.placeholder || 'Scegli');
    return el('div', { class: 'player-slot-content' },
        fotoGiocatore(p),
        el('div', { class: 'player-slot-text' },
            el('strong', {}, p.name),
            el('small', {}, p.team),
            rigaStatistiche(id, extra.completa)));
}

function drawField() {
    const roster = myRoster();
    const locked = isLocked();

    riempi(document.getElementById('starterGrid'), FormazioneCheck.SLOTS.map(({ slot, role }) => {
        const id = lineupEdit.starters[slot];
        // A giornata bloccata il titolare non si cambia più, ma la sua scheda resta consultabile
        return el('button', {
            class: `slot-card slot-${slot.toLowerCase()}${id ? ' filled' : ''}${id && id === lineupEdit.captain ? ' captain' : ''}`,
            disabled: locked && !id,
            title: locked ? (id ? 'Giornata bloccata: apri la scheda del giocatore' : 'Giornata bloccata') : `Scegli ${ROLE_NAMES[role].toLowerCase()}`,
            onclick: () => (locked ? apriGiocatore(id) : openPicker(slot, role)),
        },
        el('span', { class: 'role-tag' }, slot),
        id && id === lineupEdit.captain ? el('span', { class: 'captain-tag', title: 'Capitano' }, 'C') : null,
        playerCard(id, { placeholder: SEGNAPOSTO[role] || ROLE_NAMES[role] }));
    }));

    const titolari = Object.values(lineupEdit.starters).filter(Boolean);
    const captainSelect = document.getElementById('captainSelect');
    riempi(captainSelect, el('option', { value: '' }, 'Scegli il capitano…'),
        titolari.map(id => el('option', { value: id, selected: id === lineupEdit.captain }, state.playersById[id]?.name || id)));
    captainSelect.disabled = locked;

    riempi(document.getElementById('benchGrid'), roster.all
        .filter(id => !titolari.includes(id))
        .map(id => el('button', { class: 'bench-card', title: 'Apri la scheda del giocatore', onclick: () => apriGiocatore(id) },
            el('span', { class: 'role-tag' }, state.playersById[id]?.role || '?'),
            playerCard(id))));

    const errors = FormazioneCheck.checkLineup(roster, lineupEdit.starters, lineupEdit.captain);
    const saveBtn = document.getElementById('saveLineupBtn');
    saveBtn.disabled = locked || errors.length > 0;
    const status = document.getElementById('lineupStatus');
    if (locked) status.textContent = lineupEdit.saved ? 'Giornata bloccata: questa è la formazione in gara.' : 'Giornata bloccata.';
    else if (errors.length) status.textContent = errors[0];
    else status.textContent = lineupEdit.saved ? 'Formazione salvata.' : 'Formazione pronta: ricordati di salvarla.';
}

function openPicker(slot, role) {
    if (isLocked()) return;
    pickerSlot = slot;
    const roster = myRoster();
    const usati = Object.entries(lineupEdit.starters).filter(([s]) => s !== slot).map(([, id]) => id);
    document.getElementById('pickerTitle').textContent = `${slot}: scegli ${ROLE_NAMES[role].toLowerCase()}`;
    riempi(document.getElementById('pickerList'), (roster[role] || [])
        .filter(id => !usati.includes(id))
        .map(id => el('div', { class: 'picker-row' },
            el('button', { class: 'picker-item', onclick: () => choose(id) }, playerCard(id, { completa: true })),
            el('button', { class: 'btn btn-secondary btn-small', title: 'Fanta-punti di ogni giornata, come nel Mercato', onclick: () => apriGiocatore(id) }, 'Statistiche'))));
    document.getElementById('slotPicker').hidden = false;
}

function choose(id) {
    lineupEdit.starters[pickerSlot] = id;
    lineupEdit.saved = false;
    closePicker();
    drawField();
}

function closePicker() {
    document.getElementById('slotPicker').hidden = true;
    pickerSlot = null;
}

async function saveLineup() {
    const roster = myRoster();
    const status = document.getElementById('lineupStatus');
    const errors = FormazioneCheck.checkLineup(roster, lineupEdit.starters, lineupEdit.captain);
    if (errors.length) {
        status.textContent = errors[0];
        return;
    }
    const lineup = FormazioneCheck.buildLineup({
        roster, starters: lineupEdit.starters, captain: lineupEdit.captain,
        matchday: state.matchday.number, uid: state.user.uid,
    });
    try {
        // savedAt dal server: i trasferimenti successivi sostituiscono i giocatori partiti
        await db.doc(`leagues/${state.league.id}/lineups/${state.matchday.number}_${state.user.uid}`)
            .set({ ...lineup, savedAt: firebase.firestore.FieldValue.serverTimestamp() });
        lineupEdit.saved = true;
        state.lineupSalvata = true;
        aggiornaPallinoCampo();
        drawField();
        status.textContent = `Formazione salvata alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`;
    } catch (e) {
        status.textContent = e.code === 'permission-denied'
            ? 'Salvataggio rifiutato: la giornata potrebbe essere già bloccata.'
            : 'Salvataggio non riuscito: ' + e.message;
    }
}
