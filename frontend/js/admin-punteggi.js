// Pannello Admin, tabellini e punteggi: calcola i punti dei giocatori di una giornata (regole FantaLVF),
// poi punteggi e classifiche di tutte le leghe e il riepilogo stagionale dei giocatori.
// Le correzioni manuali del tabellino (correzioni.js) restano salvate e si riapplicano a ogni calcolo.
// Usa BATCH_SIZE, renderSections, loadMetaInfo e messaggioErrore di admin.js.
const TABELLINI_URL = '../data/tabellini';
const AUTOMATICO = '__automatico';
const NON_CONTA = '__non-conta';
let calcolo = null; // { numero, punti, originale, righe, nonAbbinate }
let rigaScelta = null; // la riga del tabellino aperta nell'editor delle correzioni

if (auth) {
    document.getElementById('punteggiCheckBtn').addEventListener('click', checkPunteggi);
    document.getElementById('punteggiApplyBtn').addEventListener('click', applyPunteggi);
}

// Le giornate con il tabellino scaricato (admin.js la chiama solo per gli admin)
async function loadGiornateTabellini() {
    const select = document.getElementById('punteggiGiornata');
    const giornate = await giornateConTabellino().catch(() => []);
    riempi(select, giornate.length
        ? giornate.slice().reverse().map(n => el('option', { value: n }, `Giornata ${n}`))
        : el('option', { value: '' }, 'Nessun tabellino'));
    loadMetaInfo('punteggi', 'punteggiInfo');
}

// Restituisce { ok, nonTrovati }: la routine non applica da sola una giornata con nomi non abbinati al listone
async function checkPunteggi() {
    const status = document.getElementById('punteggiStatus');
    const applyBtn = document.getElementById('punteggiApplyBtn');
    const numero = parseInt(document.getElementById('punteggiGiornata').value, 10);
    applyBtn.hidden = true;
    if (calcolo?.numero !== numero) rigaScelta = null;
    calcolo = null;
    disegnaCorrezioni();
    if (!numero) return { ok: false, nonTrovati: 0 };
    status.textContent = 'Calcolo in corso…';
    try {
        const res = await fetch(`${TABELLINI_URL}/${numero}.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`tabellino non trovato (HTTP ${res.status})`);
        const originale = await res.json();
        const { righe, avviso } = await leggiCorrezioni(numero);
        const { tabellino, forzati, inutilizzate } = Correzioni.applicaCorrezioni(originale, righe);
        const listone = Object.values(state.playersById);

        // Gare spostate: i giocatori delle due squadre prendono la media delle giornate precedenti
        const spostate = new Set(tabellino.matches.filter(m => m.moved).flatMap(m => [m.homeId, m.awayId]));
        if (spostate.size) await loadStatistiche(); // il riepilogo più recente, anche se un altro admin ha appena calcolato
        const medie = Object.fromEntries(listone.filter(p => spostate.has(p.teamId))
            .map(p => [p.id, Statistiche.mediaPrima(state.statistiche, p.id, numero)]));
        const { punti, nonTrovati } = Punteggi.punteggiGiornata(tabellino, listone, medie, forzati);
        calcolo = { numero, punti, originale, righe, nonAbbinate: righeNonAbbinate(tabellino, punti, righe) };

        const nome = id => state.playersById[id]?.name || id;
        const inCampo = Object.entries(punti).filter(([, p]) => p.inCampo);
        const migliori = inCampo.slice().sort((a, b) => b[1].fp - a[1].fp).slice(0, 10);
        renderSections('punteggiDiff', `${tabellino.label}: ${inCampo.length} giocatori in campo`, [
            ['Risultati', tabellino.matches, m => (m.moved ? `${m.home} – ${m.away}: gara spostata, punteggio medio` : `${m.home} ${m.result.home}-${m.result.away} ${m.away}`)],
            ['Nomi del tabellino non trovati nel listone (prendono 0: aggiornare il listone)', nonTrovati, n => n],
            ['Migliori 10', migliori, ([id, p]) => `${p.fp.toFixed(2)} · ${nome(id)} (${p.ruolo}, ${p.team})`],
            ['Punteggio medio per gara spostata', Object.entries(punti).filter(([, p]) => p.media), ([id, p]) => `${p.fp.toFixed(2)} · ${nome(id)}`],
            ['Correzioni manuali applicate', Object.entries(righe).filter(([k]) => !inutilizzate.includes(k)), ([k, c]) => descriviCorrezione(k, c)],
            ['Correzioni che non trovano più la loro riga (la Lega ha cambiato il tabellino: controllale)', inutilizzate, k => descriviCorrezione(k, righe[k])],
        ]);
        disegnaCorrezioni();
        applyBtn.hidden = false;
        const messaggi = [nonTrovati.length ? `Attenzione: ${nonTrovati.length} nomi non trovati, abbinali da "Correzioni manuali".` : 'Tabellino pronto da applicare.'];
        if (avviso) messaggi.push(avviso);
        status.textContent = messaggi.join(' ');
        return { ok: true, nonTrovati: nonTrovati.length };
    } catch (e) {
        status.textContent = 'Calcolo non riuscito: ' + e.message;
        return { ok: false, nonTrovati: 0 };
    }
}

// Restituisce true se la giornata è stata applicata
async function applyPunteggi() {
    if (!calcolo) return false;
    const { numero, punti } = calcolo;
    const status = document.getElementById('punteggiStatus');
    const applyBtn = document.getElementById('punteggiApplyBtn');
    applyBtn.disabled = true;
    try {
        // Prima di scrivere: la giornata deve essere nel calendario, la sua scadenza decide le sostituzioni di mercato
        const ref = db.collection('matchdays').doc(String(numero));
        const giornata = await ref.get();
        const lockAt = giornata.exists ? giornata.data().lockAt : null;
        if (!lockAt?.toMillis) throw new Error(`la giornata ${numero} non è nel calendario: applica prima il calendario.`);
        const scadenza = lockAt.toMillis();

        status.textContent = 'Salvo i punteggi dei giocatori…';
        const voci = Object.entries(punti);
        for (let i = 0; i < voci.length; i += BATCH_SIZE) {
            const batch = db.batch();
            for (const [id, p] of voci.slice(i, i + BATCH_SIZE)) {
                batch.set(ref.collection('stats').doc(id), {
                    fp: p.fp, inCampo: !!p.inCampo, media: !!p.media, ruolo: p.ruolo || null,
                    team: p.team || null, set: p.set || 0, voci: p.voci || {}, molt: p.molt ?? 1, corretto: !!p.corretto,
                });
            }
            await batch.commit();
        }

        // Ogni lega per conto suo: una lega con dati sbagliati non ferma le altre
        status.textContent = 'Calcolo le squadre di tutte le leghe…';
        const leghe = await db.collection('leagues').get();
        let squadre = 0;
        const fallite = [];
        for (const lega of leghe.docs) {
            try {
                squadre += await calcolaLega(lega, numero, punti, scadenza);
            } catch (e) {
                console.error(`Lega ${lega.id}`, e);
                fallite.push(`${lega.data().name || lega.id} (${messaggioErrore(e)})`);
            }
        }

        status.textContent = 'Aggiorno le statistiche dei giocatori…';
        await aggiornaStatistiche(numero, punti);
        loadMetaInfo('punteggi', 'punteggiInfo');
        if (fallite.length) {
            // La giornata resta da calcolare: la routine la ripropone finché tutte le leghe non riescono
            status.textContent = `Giornata ${numero} calcolata per ${squadre} squadre, ma non per ${fallite.length} leghe: ${fallite.join('; ')}. Correggi e rifai il calcolo.`;
            return false;
        }
        await ref.update({ status: 'scored', scoredAt: firebase.firestore.FieldValue.serverTimestamp() });
        await db.doc('meta/punteggi').set({ appliedAt: firebase.firestore.FieldValue.serverTimestamp(), appliedBy: auth.currentUser.uid, matchday: numero });
        status.textContent = `Fatto: giornata ${numero} calcolata per ${squadre} squadre in ${leghe.size} leghe.`;
        applyBtn.hidden = true;
        calcolo = null;
        disegnaCorrezioni();
        loadMetaInfo('punteggi', 'punteggiInfo');
        await loadNextMatchday();
        if (state.league) await selectLeague(state.league.id);
        return true;
    } catch (e) {
        status.textContent = 'Calcolo non riuscito: ' + messaggioErrore(e);
        return false;
    } finally {
        applyBtn.disabled = false;
    }
}

// Raggruppa i documenti per partecipante, con le date convertite in millisecondi
function perPartecipante(snap, campoData) {
    const gruppi = {};
    for (const doc of snap.docs) {
        const d = doc.data();
        (gruppi[d.uid] = gruppi[d.uid] || []).push({ ...d, [campoData]: d[campoData]?.toMillis?.() ?? 0 });
    }
    return gruppi;
}

// Punteggi di giornata e classifica di una lega; restituisce quante squadre ha calcolato
async function calcolaLega(lega, numero, punti, scadenza) {
    const inizio = lega.data().settings?.startMatchday ?? 1;
    if (numero < inizio) return 0;
    const [membri, formazioni, trasferimenti, rose] = await Promise.all([
        lega.ref.collection('members').get(),
        lega.ref.collection('lineups').get(),
        lega.ref.collection('transfers').get(),
        lega.ref.collection('rosters').get(),
    ]);
    const perUtente = perPartecipante(formazioni, 'savedAt');
    const movimenti = perPartecipante(trasferimenti, 'at');
    const rosaDi = Object.fromEntries(rose.docs.map(d => [d.id, d.data()]));

    const batch = db.batch();
    for (const m of membri.docs) {
        // Chi non ha salvato la formazione per questa giornata gioca con la sua ultima formazione;
        // chi è arrivato col mercato dopo il salvataggio e prima della scadenza prende il posto di chi è partito
        // Contano la rosa alla scadenza e solo i trasferimenti che l'hanno davvero cambiata
        const { rosa, movimenti: validi } = Mercato.rosaAllaScadenza(rosaDi[m.id], movimenti[m.id] || [], scadenza);
        const formazione = Mercato.applicaSostituzioni(Punteggi.formazionePer(numero, perUtente[m.id] || []), validi, scadenza);
        const risultato = formazione ? Punteggi.punteggioSquadra(formazione, punti, rosa) : { totale: 0, dettaglio: [] };
        batch.set(lega.ref.collection('scores').doc(`${numero}_${m.id}`), {
            uid: m.id, matchday: numero, total: risultato.totale, dettaglio: risultato.dettaglio,
            formazioneDellaGiornata: formazione ? formazione.matchday : null,
        });
    }
    await batch.commit();

    // Classifica: ricalcolata da tutte le giornate, così un ricalcolo resta coerente
    const punteggi = (await lega.ref.collection('scores').get()).docs.map(d => d.data());
    const classifica = {};
    for (const d of punteggi) {
        const c = classifica[d.uid] = classifica[d.uid] || { total: 0, giornate: 0, ultima: null };
        c.total += d.total;
        c.giornate += 1;
        if (!c.ultima || d.matchday > c.ultima.matchday) c.ultima = { matchday: d.matchday, total: d.total };
    }

    const iscritti = membri.docs.map(m => ({ uid: m.id, joinedAt: m.data().joinedAt?.toMillis?.() ?? 0 }));
    // Con meno di 2 squadre non ci sono sfide: vale solo la classifica dei fanta-punti
    if (lega.data().settings?.mode === 'scontri' && iscritti.length >= 2) {
        const calendario = await calendarioScontri(lega, iscritti, inizio);
        const { classifica: scontri } = Scontri.risultatiScontri({ rounds: calendario.rounds, scores: punteggi, members: iscritti });
        for (const [uid, s] of Object.entries(scontri)) {
            const c = classifica[uid] = classifica[uid] || { total: 0, giornate: 0, ultima: null };
            Object.assign(c, { points: s.points, won: s.won, lost: s.lost, tbWon: s.tbWon, tbLost: s.tbLost, for: s.for, against: s.against });
        }
    }

    const batchClassifica = db.batch();
    for (const [uid, c] of Object.entries(classifica)) {
        batchClassifica.set(lega.ref.collection('standings').doc(uid), { ...c, total: Math.round(c.total * 100) / 100 });
    }
    await batchClassifica.commit();
    return membri.size;
}

// Il calendario delle sfide; se il Presidente non l'ha generato prima dell'inizio lo genera l'admin adesso
async function calendarioScontri(lega, iscritti, inizio) {
    const ref = lega.ref.collection('schedule').doc('main');
    const snap = await ref.get();
    if (snap.exists) return snap.data();
    const calendario = Scontri.generaCalendario(iscritti.map(m => m.uid), { start: inizio });
    await ref.set({ ...calendario, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: auth.currentUser.uid });
    return calendario;
}

// Riepilogo stagionale dei giocatori (meta/statistiche): si aggiorna con la sola giornata calcolata;
// se non c'è ancora viene ricostruito da tutte le giornate calcolate
async function aggiornaStatistiche(numero, punti) {
    const ref = db.doc('meta/statistiche');
    const snap = await ref.get();
    let players;
    let giornate;
    if (snap.exists) {
        players = Statistiche.aggiornaRiepilogo(snap.data().players || {}, numero, punti);
        giornate = [...new Set([...(snap.data().giornate || []), numero])];
    } else {
        const calcolate = await db.collection('matchdays').where('status', '==', 'scored').get();
        const tutte = [];
        for (const g of calcolate.docs) {
            const stats = await g.ref.collection('stats').get();
            tutte.push({ number: g.data().number, stats: Object.fromEntries(stats.docs.map(d => [d.id, d.data()])) });
        }
        players = Statistiche.costruisciRiepilogo(tutte);
        giornate = tutte.map(g => g.number);
    }
    await ref.set({ players, giornate: giornate.sort((a, b) => a - b), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    state.statistiche = players;
}

// --- Correzioni manuali del tabellino ---

function refCorrezioni(numero) {
    return db.doc(`matchdays/${numero}/correzioni/tabellino`);
}

// Le correzioni salvate; se non si possono leggere (regole non ancora ripubblicate) il calcolo va avanti senza
async function leggiCorrezioni(numero) {
    try {
        const snap = await refCorrezioni(numero).get();
        return { righe: snap.exists ? snap.data().righe || {} : {}, avviso: null };
    } catch (e) {
        if (e.code !== 'permission-denied') throw e;
        return { righe: {}, avviso: 'Correzioni manuali non disponibili: ripubblica le regole Firestore.' };
    }
}

function nomeSquadraTabellino(teamId) {
    return calcolo?.originale.teams?.[teamId]?.team || teamId;
}

function descriviCorrezione(chiave, c) {
    const [teamId, ...nome] = chiave.split('|');
    const abbinamento = !('id' in c) ? null
        : c.id === null ? 'la riga non conta'
            : `abbinata a ${state.playersById[c.id]?.name || c.id}`;
    return [`${nomeSquadraTabellino(teamId)} · ${nome.join('|')}`, abbinamento, c.stats ? 'numeri corretti' : null].filter(Boolean).join(': ');
}

// Righe delle gare giocate che non sono finite su nessun giocatore (e che nessuno ha escluso a mano)
function righeNonAbbinate(tabellino, punti, righe) {
    const abbinate = new Set(Object.values(punti).filter(p => p.nomeTabellino).map(p => `${p.team}|${p.nomeTabellino}`));
    return new Set(righeTabellino(tabellino)
        .filter(({ squadra, s, chiave }) => !abbinate.has(`${squadra.team}|${s.name}`) && righe[chiave]?.id !== null)
        .map(r => r.chiave));
}

// Le righe dei giocatori delle gare giocate: [{ teamId, squadra, s, chiave }]
function righeTabellino(tabellino) {
    const giocate = new Set(tabellino.matches.filter(m => !m.moved && m.result).flatMap(m => [String(m.homeId), String(m.awayId)]));
    return Object.entries(tabellino.teams || {})
        .filter(([teamId]) => giocate.has(teamId))
        .flatMap(([teamId, squadra]) => squadra.players.map(s => ({ teamId, squadra, s, chiave: Correzioni.chiaveRiga(teamId, s.name) })));
}

function disegnaCorrezioni() {
    const box = document.getElementById('correzioniBox');
    if (!calcolo) {
        box.hidden = true;
        riempi(box);
        return;
    }
    const { originale, righe, nonAbbinate } = calcolo;
    const tutte = righeTabellino(originale);
    if (!tutte.some(r => r.chiave === rigaScelta)) rigaScelta = ([...nonAbbinate][0]) || tutte[0]?.chiave || null;
    const riga = tutte.find(r => r.chiave === rigaScelta);
    box.hidden = !riga;
    if (!riga) return;
    const correzione = righe[riga.chiave] || {};

    const sceltaRiga = el('select', { 'aria-label': 'Riga del tabellino', onchange: e => { rigaScelta = e.target.value; disegnaCorrezioni(); } },
        Object.entries(originale.teams).filter(([teamId]) => tutte.some(r => r.teamId === teamId)).map(([teamId, squadra]) =>
            el('optgroup', { label: squadra.team }, tutte.filter(r => r.teamId === teamId).map(r =>
                el('option', { value: r.chiave, selected: r.chiave === rigaScelta },
                    `${r.s.name}${nonAbbinate.has(r.chiave) ? ' · NON TROVATO' : ''}${righe[r.chiave] ? ' · corretto' : ''}`)))));

    // Giocatore: automatico, nessuno, oppure uno del listone (prima quelli della squadra)
    const valoreGiocatore = !('id' in correzione) ? AUTOMATICO : correzione.id === null ? NON_CONTA : correzione.id;
    const perNome = (a, b) => a.name.localeCompare(b.name, 'it');
    const listone = Object.values(state.playersById);
    const opzione = p => el('option', { value: p.id, selected: p.id === valoreGiocatore }, `${p.name} · ${p.role} · ${p.team}${p.active === false ? ' (non attivo)' : ''}`);
    const sceltaGiocatore = el('select', { 'aria-label': 'Giocatore del listone' },
        el('option', { value: AUTOMATICO, selected: valoreGiocatore === AUTOMATICO }, 'Abbinamento automatico'),
        el('option', { value: NON_CONTA, selected: valoreGiocatore === NON_CONTA }, 'Nessuno: la riga non conta'),
        el('optgroup', { label: riga.squadra.team }, listone.filter(p => String(p.teamId) === riga.teamId).sort(perNome).map(opzione)),
        el('optgroup', { label: 'Altre squadre' }, listone.filter(p => String(p.teamId) !== riga.teamId).sort(perNome).map(opzione)));

    // Numeri: quelli corretti se ci sono, altrimenti quelli della Lega
    const lega = Correzioni.numeri(riga.s);
    const attuali = correzione.stats ? Correzioni.numeri(correzione.stats) : lega;
    const campi = Correzioni.CAMPI.map(([campo, etichetta]) => {
        const [a, b] = campo.split('.');
        const valore = b ? attuali[a][b] : attuali[a];
        const originaleLega = b ? lega[a][b] : lega[a];
        return {
            campo,
            input: el('input', { type: 'number', min: 0, step: 1, value: valore, class: 'price-input', 'aria-label': etichetta }),
            etichetta,
            diverso: valore !== originaleLega ? `Lega: ${originaleLega}` : null,
        };
    });

    const stato = el('span', { class: 'admin-sub', id: 'correzioneStatus' });
    const salva = el('button', { class: 'btn btn-primary btn-small', onclick: () => salvaCorrezione(riga, sceltaGiocatore.value, campi, stato) },
        el('i', { class: 'fas fa-floppy-disk' }), ' Salva correzione');
    const togli = righe[riga.chiave]
        ? el('button', { class: 'btn btn-secondary btn-small', onclick: () => scriviCorrezione(riga.chiave, null, stato) }, 'Togli correzione')
        : null;

    riempi(box,
        el('h4', {}, 'Correzioni manuali'),
        el('p', { class: 'admin-sub' }, "Se un nome non si abbina al listone o un numero del tabellino è sbagliato, correggilo qui. La correzione resta salvata e vale anche quando il tabellino viene riscaricato; dopo il salvataggio il controllo si rifà da solo, poi serve \"Calcola e applica\"."),
        el('div', { class: 'admin-actions' }, sceltaRiga, sceltaGiocatore),
        el('div', { class: 'correzione-grid' }, campi.map(c => el('label', { class: 'correzione-campo' },
            el('span', {}, c.etichetta), c.input, c.diverso ? el('small', { class: 'msg-warning' }, c.diverso) : null))),
        el('div', { class: 'admin-actions' }, salva, togli, stato));
}

async function salvaCorrezione(riga, giocatore, campi, stato) {
    const numeri = {};
    for (const { campo, input } of campi) {
        const [a, b] = campo.split('.');
        const valore = input.value.trim() === '' ? NaN : Number(input.value);
        if (b) (numeri[a] = numeri[a] || {})[b] = valore;
        else numeri[a] = valore;
    }
    const errori = Correzioni.validaStatistiche(numeri);
    if (errori.length) {
        stato.textContent = errori[0];
        return;
    }
    const correzione = {};
    if (giocatore === NON_CONTA) correzione.id = null;
    else if (giocatore !== AUTOMATICO) correzione.id = giocatore;
    if (!Correzioni.stessiNumeri(numeri, riga.s)) correzione.stats = numeri;
    // Automatico e numeri uguali a quelli della Lega: è come togliere la correzione
    await scriviCorrezione(riga.chiave, Object.keys(correzione).length ? correzione : null, stato);
}

// Salva o toglie (correzione null) la correzione di una riga, poi rifà il controllo della giornata
async function scriviCorrezione(chiave, correzione, stato) {
    const numero = calcolo.numero;
    const ref = refCorrezioni(numero);
    const meta = { updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: auth.currentUser.uid };
    stato.textContent = 'Salvo…';
    try {
        const snap = await ref.get();
        if (!snap.exists) {
            await ref.set({ righe: correzione ? { [chiave]: correzione } : {}, ...meta });
        } else {
            // Un campo alla volta: due admin che correggono righe diverse non si sovrascrivono
            await ref.update(new firebase.firestore.FieldPath('righe', chiave), correzione || firebase.firestore.FieldValue.delete(),
                'updatedAt', meta.updatedAt, 'updatedBy', meta.updatedBy);
        }
    } catch (e) {
        stato.textContent = 'Salvataggio non riuscito: ' + messaggioErrore(e);
        return;
    }
    rigaScelta = chiave;
    await checkPunteggi();
    const nuovoStato = document.getElementById('correzioneStatus');
    if (nuovoStato) nuovoStato.textContent = correzione ? 'Correzione salvata: ricontrolla e premi "Calcola e applica".' : 'Correzione tolta.';
}
