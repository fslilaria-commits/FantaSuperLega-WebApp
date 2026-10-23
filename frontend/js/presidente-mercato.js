// Pannello mercato del Presidente: senza server le assegnazioni non scattano da sole, le applica lui con un clic
let anteprimaMercato = null; // { tipo: 'svincolati' | 'scambi', ... }

document.getElementById('marketSuspendToggle').addEventListener('change', async e => {
    const sospeso = e.target.checked;
    try {
        await db.doc(`leagues/${state.league.id}`).update({ 'settings.marketSuspended': sospeso });
        state.league.settings = { ...state.league.settings, marketSuspended: sospeso };
        mercatoDati.key = null;
        refreshAll();
    } catch (err) {
        e.target.checked = !sospeso;
        document.getElementById('presidentMarketStatus').textContent = 'Modifica non riuscita: ' + err.message;
    }
});

function renderPresidenteMercato() {
    const box = document.getElementById('presidentMarketBox');
    box.hidden = !isPresident();
    if (box.hidden) return;
    document.getElementById('marketSuspendToggle').checked = !!state.league.settings?.marketSuspended;
    if (anteprimaMercato?.leagueId !== state.league.id) anteprimaMercato = null;
    disegnaPannelloPresidente();
}

function disegnaPannelloPresidente() {
    const body = document.getElementById('presidentMarketBody');
    const azioni = el('div', { class: 'admin-actions' },
        el('button', { class: 'btn btn-secondary', onclick: preparaSvincolati }, el('i', { class: 'fas fa-gavel' }), ' Assegna gli svincolati'),
        el('button', { class: 'btn btn-secondary', onclick: preparaScambi }, el('i', { class: 'fas fa-right-left' }), ' Applica gli scambi accettati'));
    riempi(body, azioni, anteprimaMercato ? disegnaAnteprima(anteprimaMercato) : null);
}

function disegnaAnteprima(a) {
    const nome = id => state.playersById[id]?.name || id;
    let sezioni;
    if (a.tipo === 'svincolati') {
        sezioni = [
            ['Assegnati', a.risultato.vinte, o => `${nomeSquadra(o.uid)}: ${nome(o.playerIn)} al posto di ${nome(o.playerOut)} (valore ${o.valore})`],
            ['Non assegnati', a.risultato.perse, o => `${nomeSquadra(o.uid)}: ${nome(o.playerIn)} (valore ${o.valore}): ${o.motivo}`],
        ];
    } else {
        sezioni = [
            ['Scambi da fare', a.esiti.filter(x => x.ok), x => `${nomeSquadra(x.trade.from)} ↔ ${nomeSquadra(x.trade.to)}: ${nome(x.trade.give)} per ${nome(x.trade.take)}${x.trade.extra ? ` + ${x.trade.extra} crediti` : ''}`],
            ['Non più validi', a.esiti.filter(x => !x.ok), x => `${nome(x.trade.give)} per ${nome(x.trade.take)}: ${x.motivo}`],
        ];
    }
    return el('div', { id: 'anteprimaMercato' },
        el('p', { class: 'admin-sub' }, a.titolo),
        listaDettagli(sezioni, Infinity),
        a.daApplicare ? el('button', { class: 'btn btn-primary', onclick: applicaMercato }, el('i', { class: 'fas fa-check' }), ' Conferma e applica') : null);
}

function posizioniInClassifica() {
    return Object.fromEntries(Scontri.ordinaClassifica(iscrittiConData(), state.standings, state.league.settings?.mode).map((m, i) => [m.uid, i]));
}

// Le finestre con le offerte già chiuse (fino a 3 giornate indietro) che hanno ancora offerte da assegnare
async function preparaSvincolati() {
    const status = document.getElementById('presidentMarketStatus');
    status.textContent = 'Cerco le offerte da assegnare…';
    const now = Date.now();
    const chiuse = state.matchdays.filter(g => g.lockAt.getTime() - Mercato.ANTICIPO_OFFERTE <= now).slice(-3).reverse();
    try {
        for (const g of chiuse) {
            const snap = await db.collection(`leagues/${state.league.id}/markets/${g.number}/offers`).where('status', '==', 'active').get();
            if (snap.empty) continue;
            const offers = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? 0 }));
            const risultato = Mercato.risolviOfferte({ offers, rosters: state.rosters, posizione: posizioniInClassifica(), playersById: state.playersById });
            anteprimaMercato = {
                leagueId: state.league.id, tipo: 'svincolati', matchday: g.number, risultato, daApplicare: true,
                titolo: `Offerte della finestra per la ${g.label}: ${offers.length} offerte.${g.lockAt.getTime() <= now ? ' La giornata è già bloccata: i nuovi giocatori varranno dalla prossima.' : ''}`,
            };
            status.textContent = '';
            disegnaPannelloPresidente();
            return;
        }
        anteprimaMercato = null;
        const chiusuraOfferte = state.matchday && new Date(state.matchday.lockAt.getTime() - Mercato.ANTICIPO_OFFERTE);
        status.textContent = chiusuraOfferte && chiusuraOfferte.getTime() > now
            ? `Nessuna offerta da assegnare: le offerte della finestra in corso chiudono ${formatDateTime(chiusuraOfferte)}.`
            : 'Nessuna offerta da assegnare.';
        disegnaPannelloPresidente();
    } catch (e) {
        status.textContent = 'Ricerca non riuscita: ' + e.message;
    }
}

async function preparaScambi() {
    const status = document.getElementById('presidentMarketStatus');
    try {
        const snap = await db.collection(`leagues/${state.league.id}/trades`).where('status', '==', 'accepted').get();
        if (snap.empty) {
            anteprimaMercato = null;
            status.textContent = 'Nessuno scambio accettato da applicare.';
            disegnaPannelloPresidente();
            return;
        }
        // Gli scambi si applicano in ordine di accettazione, ognuno sulle rose aggiornate dal precedente
        const trades = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.updatedAt?.toMillis?.() ?? 0) - (b.updatedAt?.toMillis?.() ?? 0));
        let rosters = state.rosters;
        const esiti = trades.map(trade => {
            const r = Mercato.eseguiScambio(rosters, trade, state.playersById);
            if (r.ok) rosters = r.rosters;
            return { trade, ...r };
        });
        anteprimaMercato = { leagueId: state.league.id, tipo: 'scambi', esiti, rosters, daApplicare: true, titolo: `${trades.length} scambi accettati.` };
        status.textContent = '';
        disegnaPannelloPresidente();
    } catch (e) {
        status.textContent = 'Ricerca non riuscita: ' + e.message;
    }
}

async function applicaMercato() {
    const a = anteprimaMercato;
    if (!a) return;
    const status = document.getElementById('presidentMarketStatus');
    const base = db.doc(`leagues/${state.league.id}`);
    const now = firebase.firestore.FieldValue.serverTimestamp();
    // Scritture in ordine di importanza: rose, movimenti ed esiti positivi insieme; poi gli esiti negativi.
    // Se una parte dopo la prima non riesce, rifacendo l'assegnazione quelle offerte o quegli scambi risultano comunque persi.
    const prime = [];
    const dopo = [];
    let rosteNuove;
    let movimenti;
    let matchday;

    if (a.tipo === 'svincolati') {
        rosteNuove = a.risultato.rosters;
        movimenti = a.risultato.movimenti;
        matchday = a.matchday;
        const offerta = o => base.collection(`markets/${a.matchday}/offers`).doc(o.id);
        for (const o of a.risultato.vinte) prime.push(b => b.update(offerta(o), { status: 'won', updatedAt: now }));
        for (const o of a.risultato.perse) dopo.push(b => b.update(offerta(o), { status: 'lost', motivo: o.motivo, updatedAt: now }));
    } else {
        rosteNuove = a.rosters;
        movimenti = a.esiti.filter(x => x.ok).flatMap(x => x.movimenti);
        matchday = state.matchday?.number ?? null;
        for (const x of a.esiti) {
            const scambio = base.collection('trades').doc(x.trade.id);
            if (x.ok) prime.push(b => b.update(scambio, { status: 'executed', updatedAt: now }));
            else dopo.push(b => b.update(scambio, { status: 'void', motivo: x.motivo, updatedAt: now }));
        }
    }

    // Solo le rose che cambiano davvero
    for (const [uid, roster] of Object.entries(rosteNuove)) {
        if (!CalendarioDiff.uguali(roster, state.rosters[uid])) prime.unshift(b => b.set(base.collection('rosters').doc(uid), roster));
    }
    for (const m of movimenti) {
        prime.push(b => b.set(base.collection('transfers').doc(), { tipo: m.tipo, uid: m.uid, playerIn: m.playerIn, playerOut: m.playerOut, valore: m.valore, extra: m.extra, matchday, at: now }));
    }

    try {
        status.textContent = 'Applico…';
        const scritture = prime.concat(dopo);
        for (let i = 0; i < scritture.length; i += BATCH_SIZE) {
            const batch = db.batch();
            for (const scrivi of scritture.slice(i, i + BATCH_SIZE)) scrivi(batch);
            await batch.commit();
        }
        status.textContent = `Fatto: ${movimenti.length} movimenti registrati.`;
        anteprimaMercato = null;
        mercatoDati.key = null;
        await selectLeague(state.league.id);
    } catch (e) {
        status.textContent = 'Applicazione non riuscita: ' + (e.code === 'permission-denied' ? 'permessi mancanti, o le rose sono cambiate nel frattempo: ripeti il controllo.' : e.message);
    }
}
