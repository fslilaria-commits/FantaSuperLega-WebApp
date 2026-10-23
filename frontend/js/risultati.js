// Scheda Tabellini: punteggi di giornata della lega e dettaglio di ogni formazione
let risultatiScelta = { matchday: null, uid: null };

document.getElementById('risultatiGiornata').addEventListener('change', e => {
    risultatiScelta = { matchday: parseInt(e.target.value, 10), uid: null };
    renderRisultati();
});

function renderRisultati() {
    const notice = document.getElementById('risultatiNotice');
    const tabella = document.getElementById('risultatiTabella');
    const dettaglio = document.getElementById('risultatiDettaglio');
    const select = document.getElementById('risultatiGiornata');
    const giornate = [...new Set(state.scores.map(s => s.matchday))].sort((a, b) => b - a);

    const avviso = !state.league ? 'Entra in una lega per vedere i punteggi.'
        : !giornate.length ? 'Nessuna giornata ancora calcolata: i punti arrivano dopo che un admin applica il tabellino.'
            : '';
    notice.textContent = avviso;
    notice.hidden = !avviso;
    tabella.hidden = !!avviso;
    dettaglio.hidden = true;
    select.hidden = !!avviso;
    if (avviso) return;

    if (!giornate.includes(risultatiScelta.matchday)) risultatiScelta = { matchday: giornate[0], uid: null };
    select.replaceChildren(...giornate.map(n => el('option', { value: n, selected: n === risultatiScelta.matchday }, `Giornata ${n}`)));

    const nomi = Object.fromEntries(state.members.map(m => [m.uid, m.teamName]));
    const righe = state.scores.filter(s => s.matchday === risultatiScelta.matchday).sort((a, b) => b.total - a.total);
    if (!risultatiScelta.uid) risultatiScelta.uid = righe.find(r => r.uid === state.user.uid)?.uid || righe[0]?.uid;

    document.getElementById('risultatiBody').replaceChildren(...righe.map((r, i) => el('tr', {
        class: r.uid === risultatiScelta.uid ? 'selected' : null,
        onclick: () => { risultatiScelta.uid = r.uid; renderRisultati(); },
        title: 'Mostra la formazione',
    },
    el('td', {}, i + 1),
    el('td', {}, el('strong', {}, nomi[r.uid] || 'Squadra'), r.uid === state.user.uid ? el('span', { class: 'admin-sub' }, ' (tu)') : null),
    el('td', {}, el('strong', {}, r.total.toFixed(2))))));

    const scelta = righe.find(r => r.uid === risultatiScelta.uid);
    if (!scelta) return;
    dettaglio.hidden = false;
    document.getElementById('dettaglioTitolo').textContent = `${nomi[scelta.uid] || 'Squadra'} · ${scelta.total.toFixed(2)} punti`;
    document.getElementById('dettaglioNota').textContent = !scelta.dettaglio.length
        ? 'Nessuna formazione schierata.'
        : scelta.formazioneDellaGiornata !== scelta.matchday
            ? `Formazione non salvata per questa giornata: vale quella della giornata ${scelta.formazioneDellaGiornata}.`
            : '';
    document.getElementById('dettaglioBody').replaceChildren(...scelta.dettaglio.map(d => {
        const p = state.playersById[d.id];
        const conta = d.slot === 'panchina' ? 'Panchina 50%' : d.fattore === 2 ? 'Capitano x2' : 'Titolare';
        return el('tr', { class: d.slot === 'panchina' ? 'bench-row' : null },
            el('td', {}, el('span', { class: 'role-tag' }, d.slot === 'panchina' ? (p?.role || '?') : d.slot)),
            el('td', {}, p?.name || d.id, el('small', { class: 'admin-sub' }, p ? ` · ${p.team}` : ''), d.media ? el('small', { class: 'msg-warning' }, ' · media (gara spostata)') : null),
            el('td', {}, d.fp.toFixed(2)),
            el('td', {}, conta),
            el('td', {}, el('strong', {}, d.punti.toFixed(2))));
    }));
}
