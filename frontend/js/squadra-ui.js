// Scheda Mercato delle leghe a quotazioni (come il Fanta F1): ognuno si fa la squadra da solo con i prezzi dell'admin.
// Si prende e si toglie dal listone qui sotto; si salva tutto insieme, e con la squadra si aggiorna anche la
// formazione della prossima giornata (chi arriva prende il posto di chi parte). I conti sono in quotazioni.js.
const squadraEdit = { key: null, picks: [], dirty: false, salvando: false };

document.getElementById('saveSquadraBtn').addEventListener('click', salvaSquadra);
document.getElementById('resetSquadraBtn').addEventListener('click', () => {
    if (squadraEdit.salvando) return;
    squadraEdit.dirty = false;
    document.getElementById('squadraStatus').textContent = '';
    renderMarket();
    renderSquadra();
});

// I cambi valgono per la prossima giornata da schierare, fino alla sua scadenza
function finestraCambi() {
    return state.matchday ? { matchday: state.matchday.number, label: state.matchday.label, chiude: state.matchday.lockAt } : null;
}

// Perché non ci sono cambi: calendario non ancora nel gioco, o tutte le giornate già bloccate
function motivoSenzaCambi() {
    return state.matchdays.length ? 'Stagione finita: niente più cambi.' : 'Il calendario non è ancora stato caricato da un admin.';
}

// La bozza riparte dalla squadra salvata quando cambia lega o utente, o se non ci sono modifiche in sospeso
function sincronizzaBozza() {
    const key = `${state.league?.id}_${state.user?.uid}`;
    if (squadraEdit.key !== key || (!squadraEdit.dirty && !squadraEdit.salvando)) {
        squadraEdit.key = key;
        squadraEdit.picks = Quotazioni.picksDa(myRoster());
        squadraEdit.dirty = false;
    }
}

// Ogni modifica alla bozza passa di qui; durante il salvataggio la bozza resta ferma
function modificaBozza(cambia, dopo) {
    if (squadraEdit.salvando) return;
    sincronizzaBozza();
    cambia();
    squadraEdit.dirty = true;
    document.getElementById('squadraStatus').textContent = '';
    renderMarket();
    renderSquadra();
    if (dopo) dopo();
}

function controlloSquadra() {
    return Quotazioni.controllaSquadra({
        picks: squadraEdit.picks, vecchia: myRoster() || null, quotazioni: state.quotazioni,
        budget: state.league.settings?.budget ?? 0, playersById: state.playersById, giornata: finestraCambi()?.matchday,
    });
}

function inBozza(id) {
    sincronizzaBozza();
    return squadraEdit.picks.some(p => p.id === id);
}

// Quante squadre della lega hanno il giocatore (a quotazioni può stare in più squadre)
function squadreCon(id) {
    return Object.values(state.rosters).filter(r => (r.all || []).includes(id)).length;
}

// Colonna del listone: prezzo di oggi e se è nella tua squadra (in bozza)
function prezzoInListone(id) {
    const prezzo = state.quotazioni[id];
    return el('span', {},
        Number.isInteger(prezzo) ? `${prezzo} crediti` : '—',
        inBozza(id) ? el('span', { class: 'owner' }, ' · in squadra') : null);
}

// Pulsante del listone e della scheda giocatore: prendi o togli
function azioneSquadra(p, dallaScheda = false) {
    if (!state.league || !finestraCambi()) return null;
    const riapri = dallaScheda ? () => apriGiocatore(p.id) : null;
    if (inBozza(p.id)) {
        return el('button', { class: 'btn btn-secondary btn-small', onclick: () => modificaBozza(() => {
            squadraEdit.picks = squadraEdit.picks.filter(x => x.id !== p.id);
        }, riapri) }, 'Togli');
    }
    // Chi è uscito dalla SuperLega non si prende più (chi lo ha già lo tiene)
    if (p.active === false) return null;
    // Chi era in squadra ed è stato tolto nella bozza torna con il prezzo pagato, gli altri con quello di oggi
    const prezzo = Quotazioni.prezzoPer(p.id, p.role, myRoster(), state.quotazioni);
    if (!Number.isInteger(prezzo)) return el('small', { class: 'admin-sub' }, 'senza prezzo');
    if (squadraEdit.picks.filter(x => x.role === p.role).length >= RoseCheck.MAX_PER_RUOLO[p.role]) return null;
    return el('button', { class: 'btn btn-secondary btn-small', onclick: () => modificaBozza(() => {
        squadraEdit.picks.push({ id: p.id, role: p.role });
    }, riapri) }, `Prendi (${prezzo})`);
}

function stessaSquadra(picks, salvata) {
    const ids = new Set(salvata?.all || []);
    return !!salvata && picks.length === ids.size && picks.every(p => ids.has(p.id));
}

function renderSquadra() {
    const box = document.getElementById('squadraBox');
    box.hidden = !legaAQuotazioni();
    if (box.hidden) return;
    sincronizzaBozza();
    // Pagina aperta da prima della scadenza: si rilegge la giornata e si ridisegna tutto, bozza compresa
    giornataAggiornata().then(cambiata => { if (cambiata) refreshAll(); }).catch(e => console.error(e));

    const f = finestraCambi();
    const salvata = myRoster();
    const budget = state.league.settings?.budget ?? 0;
    const c = controlloSquadra();
    const quando = f ? formatDateTime(f.chiude) : '';
    const senzaPrezzi = !Object.keys(state.quotazioni).length;

    let info;
    if (!f) info = motivoSenzaCambi();
    else if (senzaPrezzi) info = "L'admin non ha ancora messo i prezzi dei giocatori: la squadra si fa appena ci sono.";
    else if (!salvata) info = `Scegli 14 giocatori (2 P, 4 S, 4 C, 2 O, 2 L) con ${budget} crediti, al massimo ${RoseCheck.MAX_PER_CLUB} per club: li prendi dal listone qui sotto. Gli stessi giocatori li possono avere anche gli altri. Fino al blocco della ${f.label} (${quando}) i cambi sono liberi.`;
    else if (c.liberi) info = `Cambi liberi fino al blocco della ${f.label} (${quando}): è la prima giornata della tua squadra.`;
    else info = `Cambi per la ${f.label}: ${c.cambi} su ${Quotazioni.MAX_CAMBI}, fino a ${quando}. Contano rispetto alla squadra salvata, a ogni salvataggio, e quelli non usati non si accumulano; chi resta tiene il prezzo pagato.`;
    document.getElementById('squadraInfo').textContent = info;

    const sezioni = Object.entries(RoseCheck.MAX_PER_RUOLO).map(([role, max]) => {
        const picks = squadraEdit.picks.filter(p => p.role === role);
        const mancanti = max - picks.length;
        return el('div', { class: 'roster-role' },
            el('h4', {}, `${ROLE_NAMES[role]} ${picks.length}/${max}`),
            picks.map(p => {
                const player = state.playersById[p.id];
                const nuovo = !(salvata?.all || []).includes(p.id);
                return el('div', { class: 'roster-row' },
                    el('span', { class: 'roster-name' },
                        el('button', { class: 'link-player', onclick: () => apriGiocatore(p.id) }, player?.name || p.id),
                        el('small', {}, ` · ${player?.team || ''}${player?.active === false ? ' · non più in SuperLega' : ''}${nuovo && salvata ? ' · nuovo' : ''}`)),
                    el('span', { class: 'admin-sub' }, c.prezzi[p.id] != null ? `${c.prezzi[p.id]} cr.` : '—'),
                    f ? el('button', { class: 'btn btn-secondary btn-small', title: 'Togli dalla squadra', onclick: () => modificaBozza(() => {
                        squadraEdit.picks = squadraEdit.picks.filter(x => x !== p);
                    }) }, el('i', { class: 'fas fa-xmark' })) : null);
            }),
            mancanti > 0 && f ? el('button', { class: 'btn btn-secondary btn-small', onclick: () => scegliNelListone(role) },
                `Scegli ${mancanti === 1 ? `1 ${ROLE_NAMES[role].toLowerCase()}` : `${mancanti} giocatori`} nel listone`) : null);
    });

    const riepilogo = el('div', { class: 'roster-summary' },
        el('span', {}, `Giocatori: ${squadraEdit.picks.length}/${RoseCheck.TOTALE} · spesi ${c.spesa} su ${budget} crediti · ne restano ${c.creditsLeft}`),
        c.errors.map(e => el('p', { class: 'msg-error' }, e)),
        c.warnings.map(w => el('p', { class: 'msg-warning' }, w)));
    riempi(document.getElementById('squadraEditor'), riepilogo, el('div', { class: 'roster-grid' }, sezioni));

    const invariata = stessaSquadra(squadraEdit.picks, salvata);
    document.getElementById('saveSquadraBtn').disabled = squadraEdit.salvando || !f || !c.completa || invariata;
    document.getElementById('resetSquadraBtn').hidden = !squadraEdit.dirty;
}

// Dal posto vuoto al listone, già filtrato sul ruolo
function scegliNelListone(role) {
    marketFilter.role = role;
    document.querySelectorAll('#roleFilters .filter-chip').forEach(c => c.classList.toggle('active', c.dataset.role === role));
    renderMarket();
    document.getElementById('searchPlayer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// La formazione da cui partire: quella della giornata, se c'è, altrimenti l'ultima salvata
async function formazioneDiPartenza(giornata) {
    const snap = await db.collection(`leagues/${state.league.id}/lineups`).where('uid', '==', state.user.uid).get();
    const tutte = snap.docs.map(d => ({ ...d.data(), savedAt: d.data().savedAt?.toMillis?.() ?? 0 }));
    return tutte.find(l => l.matchday === giornata) || Punteggi.formazionePiuRecente(giornata, tutte);
}

// Acquisti della bozza il cui prezzo è cambiato tra due controlli: "Nome 8 → 14"
function prezziCambiati(prima, dopo) {
    const salvata = myRoster();
    return squadraEdit.picks
        .filter(p => !(salvata?.prices && p.id in salvata.prices && (salvata[p.role] || []).includes(p.id)))
        .filter(p => prima.prezzi[p.id] !== dopo.prezzi[p.id])
        .map(p => `${state.playersById[p.id]?.name || p.id} ${prima.prezzi[p.id] ?? '—'} → ${dopo.prezzi[p.id] ?? 'senza prezzo'}`);
}

async function salvaSquadra() {
    const status = document.getElementById('squadraStatus');
    if (squadraEdit.salvando || !finestraCambi()) return;
    squadraEdit.salvando = true;
    document.getElementById('saveSquadraBtn').disabled = true;
    status.textContent = 'Salvo la squadra…';
    try {
        // La giornata potrebbe essersi bloccata mentre la pagina era aperta: i cambi varrebbero per un'altra
        const giornataPrima = finestraCambi();
        if (await giornataAggiornata()) {
            const ora = finestraCambi();
            status.textContent = ora
                ? `La ${giornataPrima.label} si è appena bloccata: la squadra vale dalla ${ora.label}. Ricontrolla i cambi e salva di nuovo.`
                : `La ${giornataPrima.label} si è appena bloccata. ${motivoSenzaCambi()}`;
            return;
        }
        // I prezzi si rileggono: se l'admin ne ha cambiato uno di un acquisto, si avvisa invece di farlo pagare di più
        const prima = controlloSquadra();
        try {
            await loadQuotazioni();
        } catch (e) {
            console.error(e);
        }
        const c = controlloSquadra();
        const cambiati = prezziCambiati(prima, c);
        if (cambiati.length) {
            status.textContent = `Nel frattempo l'admin ha cambiato dei prezzi (${cambiati.join(', ')}): ricontrolla la squadra e salva di nuovo.`;
            return;
        }
        if (!c.completa) {
            status.textContent = c.errors[0] || `Mancano ${RoseCheck.TOTALE - squadraEdit.picks.length} giocatori.`;
            return;
        }
        const f = finestraCambi();
        const uid = state.user.uid;
        const base = `leagues/${state.league.id}`;
        const vecchia = myRoster() || null;
        const nuova = Quotazioni.costruisciSquadra({ picks: squadraEdit.picks, controllo: c, vecchia, giornata: f.matchday });
        // Nello stesso salvataggio la formazione della giornata: per i punti conta lei, e le regole la vogliono
        const precedente = await formazioneDiPartenza(f.matchday);
        const { starters, captain } = Quotazioni.formazioneDopoCambi({ nuova, precedente });
        const lineup = FormazioneCheck.buildLineup({ roster: nuova, starters, captain, matchday: f.matchday, uid });
        const batch = db.batch();
        batch.set(db.doc(`${base}/rosters/${uid}`), nuova);
        batch.set(db.doc(`${base}/lineups/${f.matchday}_${uid}`), { ...lineup, savedAt: firebase.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        state.rosters[uid] = nuova;
        squadraEdit.dirty = false;
        lineupEdit.key = null; // il Campo rilegge la formazione appena aggiornata
        state.lineupSalvata = true;
        status.textContent = `Squadra salvata. Anche la formazione della ${f.label} è aggiornata: controlla titolari e capitano nella scheda Campo.`;
    } catch (e) {
        console.error(e);
        status.textContent = e.code === 'permission-denied'
            ? 'Salvataggio rifiutato: la giornata potrebbe essere già bloccata o un prezzo è cambiato. Ricarica la pagina e riprova.'
            : 'Salvataggio non riuscito: ' + messaggioErrore(e);
    } finally {
        squadraEdit.salvando = false;
        refreshAll();
    }
}
