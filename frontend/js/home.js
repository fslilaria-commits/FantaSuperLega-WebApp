// La mia giornata: il riepilogo dopo l'accesso (scadenza, formazione, classifica, sfida, mercato, cose da fare)
let homeLineupKey = null;
let homeTimer = null;

function tempoMancante(data) {
    const ms = data - Date.now();
    if (ms <= 0) return 'bloccata';
    const giorni = Math.floor(ms / 86400000);
    const ore = Math.floor((ms % 86400000) / 3600000);
    const minuti = Math.floor((ms % 3600000) / 60000);
    if (giorni > 0) return `tra ${giorni} g ${ore} h`;
    if (ore > 0) return `tra ${ore} h ${minuti} min`;
    return `tra ${minuti} min`;
}

// La formazione della prossima giornata è salvata? Serve anche al pallino sulla scheda Campo
async function controllaFormazioneSalvata() {
    if (!state.league || !state.matchday || !state.user) {
        state.lineupSalvata = null;
        return;
    }
    const key = `${state.league.id}_${state.matchday.number}_${state.user.uid}`;
    if (homeLineupKey === key && state.lineupSalvata !== null) return;
    homeLineupKey = key;
    try {
        state.lineupSalvata = (await db.doc(`leagues/${state.league.id}/lineups/${state.matchday.number}_${state.user.uid}`).get()).exists;
    } catch {
        state.lineupSalvata = null;
    }
}

function aggiornaPallinoCampo() {
    const rosaCompleta = FormazioneCheck.isRosterComplete(myRoster());
    const daFare = !!state.league && !!state.matchday && rosaCompleta && state.lineupSalvata === false && state.matchday.lockAt > new Date();
    document.getElementById('fieldDot').hidden = !daFare;
}

function homeCard(icona, titolo, corpo, azione) {
    return el('div', { class: 'home-card' },
        el('h3', {}, el('i', { class: `fas ${icona}` }), ` ${titolo}`),
        el('div', { class: 'home-body' }, corpo),
        azione ? el('div', { class: 'admin-actions' }, azione) : null);
}

function vaiA(tab, testo) {
    return el('button', { class: 'btn btn-secondary btn-small', onclick: () => switchTab(tab) }, testo);
}

async function renderHome() {
    if (!state.user) return;
    const cards = document.getElementById('homeCards');
    document.getElementById('homeTitle').textContent = state.user.displayName ? `Ciao ${state.user.displayName.split(' ')[0]}` : 'La mia giornata';
    document.getElementById('homeSub').textContent = state.league ? `${state.league.name} · ${myTeamName()}` : '';

    if (!state.league) {
        riempi(cards, homeCard('fa-trophy', 'Inizia', el('p', {}, 'Crea una lega o entra con il codice che ti hanno mandato.'), vaiA('league', 'Vai alla Lega')));
        aggiornaPallinoCampo();
        return;
    }

    await controllaFormazioneSalvata();
    aggiornaPallinoCampo();
    const lista = [];
    const rosa = myRoster();

    // Prossima giornata e formazione
    if (state.matchday) {
        let formazione;
        if (!FormazioneCheck.isRosterComplete(rosa)) formazione = el('p', { class: 'msg-warning' }, `Rosa incompleta (${rosa?.all?.length || 0}/${RoseCheck.TOTALE}): il Presidente deve completarla.`);
        else if (state.lineupSalvata) formazione = el('p', { class: 'ok-text' }, el('i', { class: 'fas fa-circle-check' }), ' Formazione salvata');
        else formazione = el('p', { class: 'msg-error' }, el('i', { class: 'fas fa-circle-exclamation' }), " Formazione non ancora salvata: se non la salvi vale l'ultima.");
        lista.push(homeCard('fa-stopwatch', state.matchday.label, [
            el('p', { class: 'home-big', id: 'homeCountdown' }, tempoMancante(state.matchday.lockAt)),
            el('p', { class: 'admin-sub' }, `Si blocca ${formatDateTime(state.matchday.lockAt)}${state.matchday.provisional ? ' (orario provvisorio)' : ''}`),
            formazione,
        ], vaiA('field', 'Vai al campo')));
    }

    // Classifica e ultimo punteggio
    const ordine = Scontri.ordinaClassifica(iscrittiConData(), state.standings, state.league.settings?.mode);
    const posizione = ordine.findIndex(m => m.uid === state.user.uid) + 1;
    const mia = state.standings[state.user.uid];
    const ultimo = state.scores.filter(s => s.uid === state.user.uid).sort((a, b) => b.matchday - a.matchday)[0];
    lista.push(homeCard('fa-ranking-star', 'Classifica', mia
        ? [el('p', { class: 'home-big' }, `${posizione}° su ${state.members.length}`),
            el('p', { class: 'admin-sub' }, state.league.settings?.mode === 'scontri' ? `${mia.points ?? 0} punti · ${mia.total.toFixed(2)} fanta-punti` : `${mia.total.toFixed(2)} fanta-punti`),
            ultimo ? el('p', {}, `Ultima giornata (G${ultimo.matchday}): `, el('strong', {}, ultimo.total.toFixed(2))) : null]
        : el('p', { class: 'admin-sub' }, 'La classifica parte dopo il calcolo della prima giornata.'),
    vaiA('calculator', 'Vedi i punteggi')));

    // Prossima sfida (scontri diretti)
    if (state.league.settings?.mode === 'scontri' && state.schedule && state.matchday) {
        const sfida = Scontri.sfideDi(state.schedule.rounds, state.matchday.number).find(s => s.a === state.user.uid || s.b === state.user.uid);
        if (sfida) {
            const avversario = sfida.a === state.user.uid ? sfida.b : sfida.a;
            lista.push(homeCard('fa-people-arrows', 'Prossima sfida', [
                el('p', { class: 'home-big' }, `contro ${nomeSquadra(avversario)}`),
                el('p', { class: 'admin-sub' }, state.matchday.label)], vaiA('league', 'Calendario sfide')));
        }
    }

    // Mercato
    const f = finestraCorrente();
    await caricaMercatoPersonale(f);
    const offerteAttive = mercatoDati.offerte.filter(o => o.status === 'active').length;
    const daRispondere = mercatoDati.scambiRicevuti.filter(t => t.status === 'proposed' && !scaduto(t)).length;
    lista.push(homeCard('fa-store', 'Mercato', [
        el('p', {}, f.sospeso ? 'Sospeso dal Presidente' : f.offerteAperte ? `Aperto: offerte fino a ${formatDateTime(f.offerteFino)}` : f.aperto ? `Solo scambi fino a ${formatDateTime(f.chiude)}` : f.matchday ? `Chiuso: riapre ${formatDateTime(f.apre)}` : 'Chiuso'),
        el('p', { class: 'admin-sub' }, `${offerteAttive} offerte in corso`),
        daRispondere ? el('p', { class: 'msg-warning' }, `${daRispondere} proposte di scambio da guardare`) : null,
    ], vaiA('market', 'Vai al mercato')));

    // Cose da fare per Presidente e admin
    const daFare = await promemoria(f);
    if (daFare.length) lista.push(homeCard('fa-bell', 'Da fare', el('ul', { class: 'todo-list' }, daFare.map(t => el('li', {}, t)))));

    riempi(cards, lista);

    clearInterval(homeTimer);
    homeTimer = setInterval(() => {
        const c = document.getElementById('homeCountdown');
        if (c && state.matchday) c.textContent = tempoMancante(state.matchday.lockAt);
        aggiornaPallinoCampo();
    }, 60000);
}

async function promemoria(f) {
    const voci = [];
    if (isPresident()) {
        const incomplete = state.members.filter(m => (state.rosters[m.uid]?.all?.length || 0) < RoseCheck.TOTALE).length;
        if (incomplete) voci.push(`Presidente: ${incomplete} rose da completare (scheda Lega)`);
        if (state.league.settings?.mode === 'scontri' && !state.schedule) voci.push('Presidente: genera il calendario delle sfide prima della giornata di inizio');
        if (f.matchday && !f.offerteAperte && f.aperto) voci.push('Presidente: le offerte sono chiuse, assegna gli svincolati (scheda Lega → Mercato)');
        try {
            const accettati = await db.collection(`leagues/${state.league.id}/trades`).where('status', '==', 'accepted').get();
            if (!accettati.empty) voci.push(`Presidente: ${accettati.size} scambi accettati da applicare (scheda Lega → Mercato)`);
        } catch { /* solo un promemoria */ }
    }
    if (!document.getElementById('adminNavBtn').hidden) {
        try {
            const calcolate = giornateCalcolate();
            const mancanti = (await giornateConTabellino()).filter(n => !calcolate.has(n));
            if (mancanti.length) voci.push(`Admin: tabellini da applicare (giornate ${mancanti.join(', ')}): Admin → Routine settimanale`);
        } catch { /* solo un promemoria */ }
    }
    return voci;
}
