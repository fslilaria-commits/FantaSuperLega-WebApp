// Scheda Mercato: stato della finestra, offerte per gli svincolati, scambi tra squadre e movimenti della lega
const mercatoDati = { key: null, caricamento: null, offerte: [], scambiRicevuti: [], scambiInviati: [] };
let dialogo = null; // { tipo: 'offerta' | 'scambio', player, owner?, offerta?, counterOf? }

document.getElementById('marketCancel').addEventListener('click', chiudiDialogo);
document.getElementById('marketDialog').addEventListener('click', e => { if (e.target.id === 'marketDialog') chiudiDialogo(); });
document.getElementById('marketForm').addEventListener('submit', inviaDialogo);
document.getElementById('marketExtra').addEventListener('input', aggiornaValoreDialogo);
document.getElementById('marketGive').addEventListener('change', aggiornaValoreDialogo);

function finestraCorrente() {
    const f = Mercato.finestraMercato(state.matchdays, new Date());
    const sospeso = !!state.league?.settings?.marketSuspended;
    return { ...f, sospeso, aperto: f.aperto && !sospeso, offerteAperte: f.offerteAperte && !sospeso };
}

// Una proposta di scambio vale solo nella finestra in cui è stata fatta: dopo non si può più accettare
function scaduto(t) {
    return t.status === 'proposed' && t.matchday !== finestraCorrente().matchday;
}

// Scambi che impegnano ancora giocatori e crediti: proposti in questa finestra o accettati e da applicare
function scambioInCorso(t) {
    return t.status === 'accepted' || (t.status === 'proposed' && !scaduto(t));
}

// Giocatori della mia rosa già impegnati in un'offerta attiva o in uno scambio in corso
function impegnati(tranne) {
    const ids = new Set();
    for (const o of mercatoDati.offerte) if (o.status === 'active' && o.id !== tranne) ids.add(o.playerOut);
    for (const t of mercatoDati.scambiInviati) if (scambioInCorso(t) && t.id !== tranne) ids.add(t.give);
    return ids;
}

function creditiDisponibili(tranne) {
    const rosa = myRoster();
    const offerte = Mercato.creditiImpegnati(mercatoDati.offerte, state.user.uid, tranne);
    const scambi = mercatoDati.scambiInviati
        .filter(t => scambioInCorso(t) && t.id !== tranne)
        .reduce((tot, t) => tot + (t.extra || 0), 0);
    return (rosa?.creditsLeft ?? 0) - offerte - scambi;
}

// Offerte e scambi miei; Mercato e La mia giornata li chiedono insieme: si carica una volta sola
function caricaMercatoPersonale(f) {
    const key = `${state.league?.id}_${f.matchday}_${state.user?.uid}`;
    if (mercatoDati.key !== key) {
        mercatoDati.key = key;
        mercatoDati.caricamento = leggiMercatoPersonale(f, key);
    }
    return mercatoDati.caricamento;
}

async function leggiMercatoPersonale(f, key) {
    Object.assign(mercatoDati, { offerte: [], scambiRicevuti: [], scambiInviati: [] });
    if (!state.league || !f.matchday) return;
    const base = `leagues/${state.league.id}`;
    try {
        const [offerte, ricevuti, inviati] = await Promise.all([
            db.collection(`${base}/markets/${f.matchday}/offers`).where('uid', '==', state.user.uid).get(),
            db.collection(`${base}/trades`).where('to', '==', state.user.uid).get(),
            db.collection(`${base}/trades`).where('from', '==', state.user.uid).get(),
        ]);
        if (mercatoDati.key !== key) return; // nel frattempo è cambiata lega o finestra
        mercatoDati.offerte = offerte.docs.map(d => ({ id: d.id, ...d.data() }));
        const recenti = docs => docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        mercatoDati.scambiRicevuti = recenti(ricevuti.docs);
        mercatoDati.scambiInviati = recenti(inviati.docs);
    } catch (e) {
        console.error(e);
    }
}

async function renderMercato() {
    const status = document.getElementById('marketStatus');
    const panels = document.getElementById('marketPanels');
    if (!state.league) {
        status.textContent = 'Entra in una lega per fare offerte e scambi.';
        panels.hidden = true;
        renderMovimenti();
        return;
    }
    const f = finestraCorrente();
    await caricaMercatoPersonale(f);

    const quando = d => formatDateTime(d);
    if (!f.matchday) status.textContent = 'Stagione finita: il mercato è chiuso.';
    else if (f.sospeso) status.textContent = 'Mercato sospeso dal Presidente.';
    else if (!f.aperto) status.textContent = `Mercato chiuso: riapre ${quando(f.apre)}, a fine giornata.`;
    else if (f.offerteAperte) status.textContent = `Mercato aperto per la ${f.label}: offerte per gli svincolati fino a ${quando(f.offerteFino)}, scambi fino a ${quando(f.chiude)}.`;
    else status.textContent = `Offerte chiuse: il Presidente assegna gli svincolati. Scambi ancora possibili fino a ${quando(f.chiude)}.`;
    status.classList.toggle('aperto', f.aperto);

    panels.hidden = false;
    renderMieOfferte(f);
    renderScambi(f);
    renderMovimenti();
    renderMarket(); // per i pulsanti nella tabella del listone
}

function nomeGiocatore(id) {
    const p = state.playersById[id];
    return p ? `${p.name} (${p.role}, ${p.team})` : id;
}

function renderMieOfferte(f) {
    const box = document.getElementById('myOffers');
    const rosa = myRoster();
    const visibili = mercatoDati.offerte.filter(o => o.status !== 'withdrawn' || f.offerteAperte);
    if (!visibili.length) {
        riempi(box, el('p', { class: 'admin-sub' }, f.offerteAperte
            ? 'Nessuna offerta. Nel listone, accanto agli svincolati, trovi "Fai un\'offerta".'
            : 'Nessuna offerta in questa finestra.'));
        return;
    }
    const etichetta = { active: 'in corso', withdrawn: 'ritirata', won: 'vinta', lost: 'persa' };
    // Dopo l'assegnazione il giocatore lasciato non è più in rosa: per le vinte vale il prezzo del nuovo arrivato
    const valore = o => (o.status === 'won' ? rosa?.prices?.[o.playerIn]
        : rosa?.prices?.[o.playerOut] !== undefined ? rosa.prices[o.playerOut] + o.extra : null);
    riempi(box, visibili.map(o => el('div', { class: 'market-row' },
        el('div', {},
            el('strong', {}, nomeGiocatore(o.playerIn)),
            el('small', { class: 'admin-sub' }, ` · lasci ${state.playersById[o.playerOut]?.name || o.playerOut} · +${o.extra} crediti${valore(o) != null ? ` · valore ${valore(o)}` : ''}`),
            el('span', { class: `pill ${o.status}` }, etichetta[o.status] || o.status),
            o.motivo ? el('small', { class: 'msg-warning' }, ` ${o.motivo}`) : null),
        f.offerteAperte && o.status !== 'won' && o.status !== 'lost' ? el('div', { class: 'admin-actions' },
            el('button', { class: 'btn btn-secondary btn-small', onclick: () => apriOfferta(state.playersById[o.playerIn], o) }, o.status === 'withdrawn' ? 'Rifai' : 'Modifica'),
            o.status === 'active' ? el('button', { class: 'btn btn-secondary btn-small', onclick: () => ritiraOfferta(o) }, 'Ritira') : null) : null)));
}

function renderScambi(f) {
    const box = document.getElementById('myTrades');
    const stato = { proposed: 'in attesa', accepted: 'accettato: lo applica il Presidente', refused: 'rifiutato', countered: 'rilanciato', withdrawn: 'ritirato', executed: 'fatto', void: 'non più valido', scaduto: 'scaduto' };
    const riga = (t, ricevuto) => {
        const altro = nomeSquadra(ricevuto ? t.from : t.to);
        const testo = ricevuto
            ? `${altro} ti offre ${nomeGiocatore(t.give)}${t.extra ? ` + ${t.extra} crediti` : ''} per ${nomeGiocatore(t.take)}`
            : `A ${altro}: ${nomeGiocatore(t.give)}${t.extra ? ` + ${t.extra} crediti` : ''} per ${nomeGiocatore(t.take)}`;
        const azioni = [];
        const etichetta = scaduto(t) ? 'scaduto' : t.status;
        if (t.status === 'proposed' && ricevuto && f.aperto && !scaduto(t)) {
            azioni.push(el('button', { class: 'btn btn-primary btn-small', onclick: () => rispondiScambio(t, 'accepted') }, 'Accetta'));
            azioni.push(el('button', { class: 'btn btn-secondary btn-small', onclick: () => rilancia(t) }, 'Rilancia'));
            azioni.push(el('button', { class: 'btn btn-secondary btn-small', onclick: () => rispondiScambio(t, 'refused') }, 'Rifiuta'));
        }
        if (t.status === 'proposed' && ricevuto && scaduto(t)) azioni.push(el('button', { class: 'btn btn-secondary btn-small', onclick: () => rispondiScambio(t, 'refused') }, 'Togli'));
        if (t.status === 'proposed' && !ricevuto) azioni.push(el('button', { class: 'btn btn-secondary btn-small', onclick: () => ritiraScambio(t) }, 'Ritira'));
        return el('div', { class: 'market-row' },
            el('div', {}, el('span', {}, testo), el('span', { class: `pill ${etichetta}` }, stato[etichetta] || etichetta),
                t.motivo ? el('small', { class: 'msg-warning' }, ` ${t.motivo}`) : null),
            azioni.length ? el('div', { class: 'admin-actions' }, azioni) : null);
    };
    const righe = [
        ...mercatoDati.scambiRicevuti.slice(0, 10).map(t => riga(t, true)),
        ...mercatoDati.scambiInviati.slice(0, 10).map(t => riga(t, false)),
    ];
    riempi(box, righe.length ? righe : el('p', { class: 'admin-sub' }, f.aperto
        ? 'Nessuno scambio. Nel listone, accanto ai giocatori delle altre squadre, trovi "Proponi scambio".'
        : 'Nessuno scambio.'));
}

function renderMovimenti() {
    const box = document.getElementById('transfersList');
    document.getElementById('transfersBox').hidden = !state.league;
    if (!state.transfers.length) {
        riempi(box, el('p', { class: 'admin-sub' }, 'Ancora nessun movimento.'));
        return;
    }
    riempi(box, el('ul', {}, state.transfers.slice(0, 50).map(m => el('li', {},
        `${new Date(m.at).toLocaleDateString('it-IT')} · ${nomeSquadra(m.uid)}: `,
        el('strong', {}, state.playersById[m.playerIn]?.name || m.playerIn),
        ` al posto di ${state.playersById[m.playerOut]?.name || m.playerOut} (${m.tipo}, valore ${m.valore})`))));
}

// Pulsante nella riga del listone: offerta per uno svincolato o proposta di scambio
function azioneMercato(p, ownerUid) {
    if (!state.league) return null;
    const f = finestraCorrente();
    const rosa = myRoster();
    if (!FormazioneCheck.isRosterComplete(rosa)) return null;
    if (!ownerUid && f.offerteAperte) {
        const giaFatta = mercatoDati.offerte.find(o => o.playerIn === p.id && ['active', 'withdrawn'].includes(o.status));
        const testo = giaFatta?.status === 'active' ? 'Modifica offerta' : giaFatta ? "Rifai l'offerta" : "Fai un'offerta";
        return el('button', { class: 'btn btn-secondary btn-small', onclick: () => apriOfferta(p, giaFatta) }, testo);
    }
    if (ownerUid && ownerUid !== state.user.uid && f.aperto) {
        return el('button', { class: 'btn btn-secondary btn-small', onclick: () => apriScambio(p, ownerUid) }, 'Proponi scambio');
    }
    return null;
}

function riempiGiocatoriDaLasciare(ruolo, preselezionato, tranne) {
    const rosa = myRoster();
    const occupati = impegnati(tranne);
    const select = document.getElementById('marketGive');
    const opzioni = (rosa[ruolo] || []).filter(id => !occupati.has(id) || id === preselezionato);
    riempi(select, opzioni.map(id => el('option', { value: id, selected: id === preselezionato },
        `${state.playersById[id]?.name || id} · valore ${rosa.prices?.[id] ?? 0}`)));
    return opzioni.length;
}

function apriOfferta(player, offerta) {
    dialogo = { tipo: 'offerta', player, offerta };
    document.getElementById('marketDialogTitle').textContent = `Offerta per ${player.name}`;
    document.getElementById('marketDialogInfo').textContent = `${ROLE_NAMES[player.role]} · ${player.team}. Offerta segreta: vince la più alta (valore del giocatore lasciato + crediti); a parità chi è più in basso in classifica.`;
    const n = riempiGiocatoriDaLasciare(player.role, offerta?.playerOut, offerta?.id);
    document.getElementById('marketExtra').value = offerta?.extra ?? 0;
    document.getElementById('marketSubmit').textContent = offerta?.status === 'active' ? 'Aggiorna offerta' : 'Invia offerta';
    document.getElementById('marketDialogError').textContent = n ? '' : `Nessun ${ROLE_NAMES[player.role].toLowerCase()} libero da lasciare: sono già tutti in altre offerte o scambi.`;
    aggiornaValoreDialogo();
    document.getElementById('marketDialog').hidden = false;
}

function apriScambio(player, ownerUid, counterOf, giveSuggerito) {
    dialogo = { tipo: 'scambio', player, owner: ownerUid, counterOf };
    document.getElementById('marketDialogTitle').textContent = `${counterOf ? 'Rilancio' : 'Scambio'}: ${player.name}`;
    document.getElementById('marketDialogInfo').textContent = `${ROLE_NAMES[player.role]} di ${nomeSquadra(ownerUid)}. Se accetta, ${player.name} arriva con il valore del giocatore che lasci più i crediti; i crediti vanno all'altra squadra.`;
    const n = riempiGiocatoriDaLasciare(player.role, giveSuggerito);
    document.getElementById('marketExtra').value = 0;
    document.getElementById('marketSubmit').textContent = 'Proponi';
    document.getElementById('marketDialogError').textContent = n ? '' : `Nessun ${ROLE_NAMES[player.role].toLowerCase()} libero da offrire.`;
    aggiornaValoreDialogo();
    document.getElementById('marketDialog').hidden = false;
}

function aggiornaValoreDialogo() {
    if (!dialogo) return;
    const rosa = myRoster();
    const give = document.getElementById('marketGive').value;
    const extra = parseInt(document.getElementById('marketExtra').value, 10) || 0;
    const disponibili = creditiDisponibili(dialogo.offerta?.id);
    document.getElementById('marketDialogValue').textContent =
        `Valore: ${(rosa?.prices?.[give] ?? 0) + extra} · crediti disponibili ${disponibili} (al netto delle altre offerte e scambi)`;
}

function chiudiDialogo() {
    document.getElementById('marketDialog').hidden = true;
    dialogo = null;
}

async function inviaDialogo(e) {
    e.preventDefault();
    if (!dialogo) return;
    const errore = document.getElementById('marketDialogError');
    const give = document.getElementById('marketGive').value;
    const extra = parseInt(document.getElementById('marketExtra').value, 10);
    if (!give) return;
    if (!Number.isInteger(extra) || extra < 0) {
        errore.textContent = 'I crediti devono essere un numero intero, 0 o più.';
        return;
    }
    if (extra > creditiDisponibili(dialogo.offerta?.id)) {
        errore.textContent = 'Non hai abbastanza crediti liberi.';
        return;
    }
    const f = finestraCorrente();
    const base = `leagues/${state.league.id}`;
    const now = firebase.firestore.FieldValue.serverTimestamp();
    try {
        if (dialogo.tipo === 'offerta') {
            const ref = db.doc(`${base}/markets/${f.matchday}/offers/${state.user.uid}_${dialogo.player.id}`);
            if (dialogo.offerta) await ref.update({ playerOut: give, extra, status: 'active', updatedAt: now });
            else await ref.set({ uid: state.user.uid, playerIn: dialogo.player.id, playerOut: give, role: dialogo.player.role, extra, status: 'active', createdAt: now, updatedAt: now });
        } else {
            const proposta = { from: state.user.uid, to: dialogo.owner, give, take: dialogo.player.id, role: dialogo.player.role, extra, status: 'proposed', matchday: f.matchday, createdAt: now, updatedAt: now };
            const batch = db.batch();
            if (dialogo.counterOf) {
                // Il rilancio chiude la proposta ricevuta nello stesso momento in cui parte la controproposta
                proposta.counterOf = dialogo.counterOf;
                batch.update(db.doc(`${base}/trades/${dialogo.counterOf}`), { status: 'countered', updatedAt: now });
            }
            batch.set(db.collection(`${base}/trades`).doc(), proposta);
            await batch.commit();
        }
        chiudiDialogo();
        mercatoDati.key = null;
        await renderMercato();
    } catch (err) {
        console.error(err);
        errore.textContent = err.code === 'permission-denied'
            ? 'Operazione rifiutata: il mercato potrebbe essere chiuso, o un giocatore non è più disponibile.'
            : 'Operazione non riuscita: ' + err.message;
    }
}

// Cambia lo stato di un'offerta o di uno scambio e ricarica il mercato; se non riesce lo dice
async function aggiornaStato(percorso, stato, errore) {
    let riuscito = true;
    try {
        await db.doc(percorso).update({ status: stato, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) {
        console.error(e);
        riuscito = false;
    }
    mercatoDati.key = null;
    await renderMercato();
    if (!riuscito) document.getElementById('marketStatus').textContent = `${errore}: il mercato potrebbe essere chiuso.`;
}

function ritiraOfferta(o) {
    return aggiornaStato(`leagues/${state.league.id}/markets/${finestraCorrente().matchday}/offers/${o.id}`, 'withdrawn', 'Ritiro non riuscito');
}

function rispondiScambio(t, stato) {
    return aggiornaStato(`leagues/${state.league.id}/trades/${t.id}`, stato, 'Risposta non riuscita');
}

function ritiraScambio(t) {
    return aggiornaStato(`leagues/${state.league.id}/trades/${t.id}`, 'withdrawn', 'Ritiro non riuscito');
}

// Rilancio: rispondi con una tua proposta sugli stessi giocatori
function rilancia(t) {
    apriScambio(state.playersById[t.give], t.from, t.id, t.take);
}
