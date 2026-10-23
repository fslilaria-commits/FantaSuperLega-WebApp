// Stagioni passate, in fondo alla scheda Lega: la classifica finale delle leghe in cui si era.
// La salva il pulsante "Inizia la stagione" del pannello Admin (archivio/{anno}_{lega}); le regole la mostrano
// solo a chi era nella lega, e resta anche quando i dati della stagione vengono cancellati.
async function caricaArchivio() {
    const box = document.getElementById('archivioBox');
    if (!state.user) {
        box.hidden = true;
        return;
    }
    try {
        const snap = await db.collection('archivio').where('uids', 'array-contains', state.user.uid).get();
        const voci = snap.docs.map(d => d.data()).sort((a, b) => b.anno - a.anno || a.lega.localeCompare(b.lega, 'it'));
        riempi(document.getElementById('archivioBody'), voci.map(disegnaArchivio));
        box.hidden = voci.length === 0;
    } catch (e) {
        console.error(e);
        box.hidden = true;
    }
}

function disegnaArchivio(a) {
    const scontri = a.modalita === 'scontri';
    return el('div', { class: 'archivio-lega' },
        el('h3', {}, `${a.stagione} · ${a.lega}`),
        el('p', { class: 'admin-sub' }, scontri ? 'Scontri diretti' : 'Classifica generale'),
        el('div', { class: 'market-table-wrapper' }, el('table', { class: 'market-table' },
            el('thead', {}, el('tr', {},
                el('th', {}, 'Pos'), el('th', {}, 'Squadra'),
                scontri ? el('th', { title: 'Vittorie, tie-break vinti e persi, sconfitte' }, 'V · TB · S') : null,
                el('th', {}, 'Fanta-punti'),
                scontri ? el('th', {}, 'Punti') : null)),
            el('tbody', {}, a.classifica.map(r => el('tr', {},
                el('td', {}, r.pos === 1 ? el('i', { class: 'fas fa-trophy archivio-oro', title: 'Campione' }) : String(r.pos)),
                el('td', {},
                    el('strong', {}, r.squadra),
                    r.presidente ? el('i', { class: 'fas fa-crown president-icon', title: 'Presidente' }) : null),
                scontri ? el('td', {}, `${r.won} · ${r.tbWon}/${r.tbLost} · ${r.lost}`) : null,
                el('td', {}, scontri ? r.total.toFixed(2) : el('strong', {}, r.total.toFixed(2))),
                scontri ? el('td', {}, el('strong', {}, String(r.points))) : null))))));
}
