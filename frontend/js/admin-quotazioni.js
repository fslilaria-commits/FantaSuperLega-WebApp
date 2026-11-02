// Pannello Admin, riquadro Quotazioni: i prezzi dei giocatori per le leghe a quotazioni (meta/quotazioni).
// Si parte da una proposta dalle medie fanta-punti (quotazioni.js), si ritocca a mano e si salva. Chi ha già un
// giocatore tiene il prezzo pagato: un prezzo cambiato vale solo per chi lo prende dopo. I prezzi restano anche
// alla stagione nuova (il passaggio non li cancella), come punto di partenza.
const quotEdit = { prezzi: {}, q: '', role: 'ALL', soloSenza: false, dirty: false };

if (auth) {
    document.getElementById('quotazioniApriBtn').addEventListener('click', apriQuotazioni);
    document.getElementById('quotazioniSalvaBtn').addEventListener('click', salvaQuotazioni);
}

async function leggiQuotazioni() {
    const snap = await db.doc('meta/quotazioni').get();
    return snap.exists ? snap.data() : null;
}

async function mostraInfoQuotazioni() {
    const info = document.getElementById('quotazioniInfo');
    try {
        const doc = await leggiQuotazioni();
        const prezzi = Quotazioni.prezziPerId(doc);
        const quanti = Object.keys(prezzi).length;
        if (!quanti) {
            info.textContent = 'Prezzi per le leghe a quotazioni: nessuno ancora.';
            return;
        }
        const senza = state.players.length ? Quotazioni.senzaPrezzo(state.players, prezzi).length : 0;
        const quando = doc.aggiornateAt?.toDate ? ` · ultimo salvataggio ${formatDateTime(doc.aggiornateAt.toDate())}` : '';
        info.textContent = `Prezzi per le leghe a quotazioni: ${quanti} giocatori${senza ? `, ${senza} del listone ancora senza` : ''}${quando}.`;
    } catch (e) {
        info.textContent = 'Prezzi per le leghe a quotazioni: non riesco a leggerli.';
        console.error(e);
    }
}

// Avviso per la routine e per La mia giornata: solo se c'è almeno una lega a quotazioni
async function avvisoQuotazioni() {
    const leghe = await db.collection('leagues').where('settings.tipo', '==', 'quotazioni').limit(1).get();
    if (leghe.empty) return null;
    const prezzi = Quotazioni.prezziPerId(await leggiQuotazioni());
    if (!Object.keys(prezzi).length) return 'nessun prezzo per le leghe a quotazioni: senza non si fa la squadra (riquadro Quotazioni)';
    const senza = Quotazioni.senzaPrezzo(state.players, prezzi).length;
    return senza ? `${senza} giocatori del listone senza prezzo: nelle leghe a quotazioni non si possono prendere (riquadro Quotazioni)` : null;
}

async function apriQuotazioni() {
    const editor = document.getElementById('quotazioniEditor');
    const status = document.getElementById('quotazioniStatus');
    if (!editor.hidden && !quotEdit.dirty) {
        editor.hidden = true;
        document.getElementById('quotazioniSalvaBtn').hidden = true;
        return;
    }
    status.textContent = 'Leggo i prezzi…';
    try {
        quotEdit.prezzi = { ...Quotazioni.prezziPerId(await leggiQuotazioni()) };
        quotEdit.dirty = false;
        status.textContent = '';
    } catch (e) {
        status.textContent = 'Non riesco a leggere i prezzi: ' + messaggioErrore(e);
        return;
    }
    editor.hidden = false;
    document.getElementById('quotazioniSalvaBtn').hidden = false;
    disegnaQuotazioni();
}

// Proposta dalle medie: solo per chi non ha ancora un prezzo, oppure per tutti
function proponiQuotazioni(tutti) {
    if (tutti && !confirm('Ricalcolo i prezzi di tutti i giocatori dalle medie: quelli scritti a mano si perdono (finché non salvi puoi ancora riaprire senza salvare). Continuo?')) return;
    const proposta = Quotazioni.proponiPrezzi(state.players, state.statistiche);
    for (const [id, prezzo] of Object.entries(proposta)) {
        if (tutti || !Number.isInteger(quotEdit.prezzi[id])) quotEdit.prezzi[id] = prezzo;
    }
    quotEdit.dirty = true;
    disegnaQuotazioni();
}

function riepilogoQuotazioni() {
    const senza = Quotazioni.senzaPrezzo(state.players, quotEdit.prezzi).length;
    const conPrezzo = state.players.length - senza;
    return `${conPrezzo} giocatori del listone su ${state.players.length} hanno un prezzo${senza ? `, ${senza} ancora senza` : ''}.`
        + (quotEdit.dirty ? ' Ci sono modifiche da salvare.' : '');
}

function disegnaQuotazioni() {
    const editor = document.getElementById('quotazioniEditor');
    const riepilogo = el('p', { class: 'admin-sub', id: 'quotazioniRiepilogo' }, riepilogoQuotazioni());
    const aggiornaRiepilogo = () => { document.getElementById('quotazioniRiepilogo').textContent = riepilogoQuotazioni(); };

    const cerca = el('input', { type: 'search', placeholder: 'Cerca giocatore o squadra…', value: quotEdit.q,
        oninput: e => { quotEdit.q = e.target.value.trim().toLowerCase(); disegnaRighe(); } });
    const ruolo = el('select', { 'aria-label': 'Ruolo', onchange: e => { quotEdit.role = e.target.value; disegnaRighe(); } },
        ['ALL', 'P', 'S', 'C', 'O', 'L'].map(r => el('option', { value: r, selected: r === quotEdit.role }, r === 'ALL' ? 'Tutti i ruoli' : ROLE_NAMES[r])));
    const soloSenza = el('label', { class: 'check-inline' },
        el('input', { type: 'checkbox', checked: quotEdit.soloSenza, onchange: e => { quotEdit.soloSenza = e.target.checked; disegnaRighe(); } }),
        ' Solo senza prezzo');
    const corpo = el('tbody', {});

    function disegnaRighe() {
        const stat = id => state.statistiche[id];
        const visibili = state.players
            .filter(p => (quotEdit.role === 'ALL' || p.role === quotEdit.role)
                && (!quotEdit.q || p.name.toLowerCase().includes(quotEdit.q) || p.team.toLowerCase().includes(quotEdit.q))
                && (!quotEdit.soloSenza || !Number.isInteger(quotEdit.prezzi[p.id])))
            .sort((a, b) => a.role.localeCompare(b.role) || (stat(b.id)?.media ?? -999) - (stat(a.id)?.media ?? -999));
        riempi(corpo, visibili.map(p => el('tr', {},
            el('td', {}, p.name),
            el('td', {}, p.team),
            el('td', {}, el('span', { class: 'role-tag', title: ROLE_NAMES[p.role] }, p.role)),
            el('td', { class: 'num' }, stat(p.id) ? stat(p.id).media.toFixed(2) : '—'),
            el('td', {}, el('input', {
                type: 'number', min: 1, max: 100, step: 1, class: 'price-input', 'aria-label': `Prezzo di ${p.name}`,
                value: Number.isInteger(quotEdit.prezzi[p.id]) ? quotEdit.prezzi[p.id] : '',
                onchange: e => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isInteger(v) && v >= 1 && v <= 100) quotEdit.prezzi[p.id] = v;
                    else {
                        delete quotEdit.prezzi[p.id];
                        e.target.value = '';
                    }
                    quotEdit.dirty = true;
                    aggiornaRiepilogo();
                },
            })))));
    }

    riempi(editor,
        el('div', { class: 'market-controls' }, cerca, ruolo, soloSenza),
        el('div', { class: 'admin-actions' },
            el('button', { class: 'btn btn-secondary btn-small', onclick: () => proponiQuotazioni(false) }, el('i', { class: 'fas fa-wand-magic-sparkles' }), ' Proponi i prezzi mancanti'),
            el('button', { class: 'btn btn-secondary btn-small', onclick: () => proponiQuotazioni(true) }, 'Ricalcola tutti dalle medie')),
        el('p', { class: 'admin-sub' }, `La proposta va da ${Quotazioni.PREZZO_MIN} a ${Quotazioni.PREZZO_MAX} crediti, in ordine di media dentro ogni ruolo; chi non ha ancora giocato vale ${Quotazioni.PREZZO_MIN}. Pensata per leghe da ${Quotazioni.BUDGET_CONSIGLIATO} crediti: con 14 giocatori non si prendono tutti i migliori.`),
        riepilogo,
        el('div', { class: 'market-table-wrapper' }, el('table', { class: 'market-table' },
            el('thead', {}, el('tr', {}, el('th', {}, 'Giocatore'), el('th', {}, 'Squadra'), el('th', {}, 'Ruolo'),
                el('th', { title: 'Media dei fanta-punti nelle giornate giocate' }, 'Media'), el('th', {}, 'Prezzo'))),
            corpo)));
    disegnaRighe();
}

async function salvaQuotazioni() {
    const status = document.getElementById('quotazioniStatus');
    const prezzi = Quotazioni.prezziPerRuolo(quotEdit.prezzi, state.playersById);
    status.textContent = 'Salvo…';
    try {
        await db.doc('meta/quotazioni').set({
            prezzi,
            aggiornateAt: firebase.firestore.FieldValue.serverTimestamp(),
            aggiornateBy: auth.currentUser.uid,
        });
        state.quotazioni = Quotazioni.prezziPerId({ prezzi });
        quotEdit.dirty = false;
        status.textContent = 'Quotazioni salvate: valgono subito per chi fa o cambia la squadra.';
        document.getElementById('quotazioniRiepilogo').textContent = riepilogoQuotazioni();
        mostraInfoQuotazioni();
        refreshAll();
    } catch (e) {
        status.textContent = 'Salvataggio non riuscito: ' + messaggioErrore(e);
    }
}
