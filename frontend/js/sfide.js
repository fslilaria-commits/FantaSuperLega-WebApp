// Scontri diretti nella scheda Lega: generazione del calendario (Presidente), prossima sfida, calendario e risultati
function nomeSquadra(uid) {
    if (uid === Scontri.MEDIA) return 'Squadra media';
    return state.members.find(m => m.uid === uid)?.teamName || 'Squadra uscita';
}

function renderSfide() {
    const box = document.getElementById('scontriBox');
    const body = document.getElementById('scontriBody');
    box.hidden = !state.league || state.league.settings?.mode !== 'scontri';
    if (box.hidden) return;

    const inizio = state.league.settings?.startMatchday ?? 1;
    if (!state.schedule) {
        const parti = [el('p', { class: 'admin-sub' },
            `Il calendario delle sfide va generato prima della giornata ${inizio}. Dopo la generazione non può più entrare nessuno; se il Presidente non lo genera, lo farà l'admin al primo calcolo.`)];
        if (isPresident()) {
            parti.push(el('div', { class: 'admin-actions' },
                el('button', { class: 'btn btn-primary', id: 'generaSfideBtn', onclick: generaSfide }, el('i', { class: 'fas fa-shuffle' }), ' Genera il calendario delle sfide'),
                el('span', { class: 'admin-sub', id: 'sfideStatus' }, `${state.members.length} squadre iscritte`)));
        }
        riempi(body, parti);
        return;
    }

    const { partite } = Scontri.risultatiScontri({ rounds: state.schedule.rounds, scores: state.scores, members: iscrittiConData() });
    const giocate = new Set(partite.map(p => p.matchday));
    const prossima = state.matchday?.number;
    const mia = prossima && (state.schedule.rounds[prossima] || []).find(s => s.a === state.user.uid || s.b === state.user.uid);

    const giornate = Object.keys(state.schedule.rounds).map(Number).sort((a, b) => a - b);
    const righe = giornate.map(g => {
        const sfide = giocate.has(g)
            ? partite.filter(p => p.matchday === g).map(p => el('li', {},
                el('span', { class: p.vincitore === p.a ? 'vincente' : null }, nomeSquadra(p.a)),
                ` ${p.pa.toFixed(2)} – ${p.pb.toFixed(2)} `,
                el('span', { class: p.vincitore === p.b ? 'vincente' : null }, nomeSquadra(p.b)),
                p.tiebreak ? el('small', { class: 'admin-sub' }, ' (tie-break)') : null))
            : state.schedule.rounds[g].map(s => el('li', {}, `${nomeSquadra(s.a)} – ${nomeSquadra(s.b)}`));
        return el('details', { class: 'admin-diff', open: g === prossima },
            el('summary', {}, `Giornata ${g}${giocate.has(g) ? ' · giocata' : g === prossima ? ' · prossima' : ''}`),
            el('ul', {}, sfide));
    });

    riempi(body,
        mia ? el('p', { class: 'prossima-sfida' }, `Prossima sfida (giornata ${prossima}): `,
            el('strong', {}, `${nomeSquadra(mia.a)} – ${nomeSquadra(mia.b)}`)) : null,
        el('details', { class: 'admin-diff' }, el('summary', {}, 'Calendario delle sfide'), el('div', {}, righe)));
}

async function generaSfide() {
    const status = document.getElementById('sfideStatus');
    const btn = document.getElementById('generaSfideBtn');
    if (state.members.length < 2) {
        status.textContent = 'Servono almeno 2 squadre.';
        return;
    }
    btn.disabled = true;
    const inizio = state.league.settings?.startMatchday ?? 1;
    const calendario = Scontri.generaCalendario(state.members.map(m => m.uid), { start: inizio });
    try {
        await db.doc(`leagues/${state.league.id}/schedule/main`).set({
            ...calendario, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: state.user.uid,
        });
        state.schedule = calendario;
        renderLeague();
    } catch (e) {
        status.textContent = e.code === 'permission-denied'
            ? `Non è più possibile: la giornata ${inizio} è già iniziata. Il calendario lo genererà l'admin al primo calcolo.`
            : 'Generazione non riuscita: ' + e.message;
        btn.disabled = false;
    }
}
