// Scheda giocatore: dati, fanta-punti di ogni giornata e media, fanta-squadra nella lega
document.getElementById('playerDialog').addEventListener('click', e => {
    if (e.target.id === 'playerDialog') chiudiGiocatore();
});

function chiudiGiocatore() {
    document.getElementById('playerDialog').hidden = true;
}

function apriGiocatore(id) {
    const p = state.playersById[id];
    if (!p) return;
    const s = state.statistiche[id];
    const owner = ownersInLeague()[id];

    // Barre dei fanta-punti per giornata, in scala sul punteggio più alto
    const giornate = Object.entries(s?.g || {}).map(([n, fp]) => ({ n: Number(n), fp })).sort((a, b) => a.n - b.n);
    const massimo = Math.max(1, ...giornate.map(g => Math.abs(g.fp)));
    const barre = giornate.length
        ? el('div', { class: 'fp-chart' }, giornate.map(g => el('div', { class: 'fp-col', title: `Giornata ${g.n}: ${g.fp.toFixed(2)}` },
            el('span', { class: 'fp-val' }, g.fp.toFixed(1)),
            el('div', { class: `fp-bar${g.fp < 0 ? ' neg' : ''}`, style: `height:${Math.max(4, Math.abs(g.fp) / massimo * 100)}%` }),
            el('span', { class: 'fp-n' }, `G${g.n}`))))
        : el('p', { class: 'admin-sub' }, 'Ancora nessuna giornata giocata.');

    riempi(document.getElementById('playerCard'),
        el('div', { class: 'player-head' },
            fotoGiocatore(p, 'player-photo', 300),
            el('div', {},
                el('h3', {}, p.name),
                el('p', {}, el('span', { class: 'role-tag' }, p.role), ` ${ROLE_NAMES[p.role]} · ${p.team}`),
                el('p', { class: 'admin-sub' }, [p.number ? `Maglia ${p.number}` : null, p.nationality, p.birthYear ? `nato nel ${p.birthYear}` : null].filter(Boolean).join(' · ')),
                p.active === false ? el('p', { class: 'msg-warning' }, 'Non più in SuperLega') : null)),
        el('div', { class: 'player-stats' },
            el('div', {}, el('strong', {}, s ? s.media.toFixed(2) : '—'), el('span', {}, 'media')),
            el('div', {}, el('strong', {}, s ? String(s.presenze) : '0'), el('span', {}, 'presenze')),
            el('div', {}, el('strong', {}, s ? s.ultima.fp.toFixed(2) : '—'), el('span', {}, s ? `ultima (G${s.ultima.matchday})` : 'ultima'))),
        barre,
        state.league ? el('p', {}, 'Fanta-squadra: ', owner ? el('strong', {}, owner.nome) : el('span', { class: 'free' }, 'svincolato')) : null,
        el('div', { class: 'admin-actions' }, azioneMercato(p, owner?.uid), el('button', { class: 'btn btn-secondary', onclick: chiudiGiocatore }, 'Chiudi')));
    document.getElementById('playerDialog').hidden = false;
}
