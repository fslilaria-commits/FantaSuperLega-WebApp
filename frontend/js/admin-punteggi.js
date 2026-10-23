// Pannello Admin, tabellini e punteggi: calcola i punti dei giocatori di una giornata (regole FantaLVF),
// poi punteggi e classifiche di tutte le leghe e il riepilogo stagionale dei giocatori.
// Usa BATCH_SIZE, renderSections, loadMetaInfo e messaggioErrore di admin.js.
const TABELLINI_URL = '../data/tabellini';
let calcolo = null;

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
    calcolo = null;
    if (!numero) return { ok: false, nonTrovati: 0 };
    status.textContent = 'Calcolo in corso…';
    try {
        const res = await fetch(`${TABELLINI_URL}/${numero}.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`tabellino non trovato (HTTP ${res.status})`);
        const tabellino = await res.json();
        const listone = Object.values(state.playersById);

        // Gare spostate: i giocatori delle due squadre prendono la media delle giornate precedenti
        const spostate = new Set(tabellino.matches.filter(m => m.moved).flatMap(m => [m.homeId, m.awayId]));
        if (spostate.size) await loadStatistiche(); // il riepilogo più recente, anche se un altro admin ha appena calcolato
        const medie = Object.fromEntries(listone.filter(p => spostate.has(p.teamId))
            .map(p => [p.id, Statistiche.mediaPrima(state.statistiche, p.id, numero)]));
        const { punti, nonTrovati } = Punteggi.punteggiGiornata(tabellino, listone, medie);
        calcolo = { numero, punti };

        const nome = id => state.playersById[id]?.name || id;
        const inCampo = Object.entries(punti).filter(([, p]) => p.inCampo);
        const migliori = inCampo.slice().sort((a, b) => b[1].fp - a[1].fp).slice(0, 10);
        renderSections('punteggiDiff', `${tabellino.label}: ${inCampo.length} giocatori in campo`, [
            ['Risultati', tabellino.matches, m => (m.moved ? `${m.home} – ${m.away}: gara spostata, punteggio medio` : `${m.home} ${m.result.home}-${m.result.away} ${m.away}`)],
            ['Nomi del tabellino non trovati nel listone (prendono 0: aggiornare il listone)', nonTrovati, n => n],
            ['Migliori 10', migliori, ([id, p]) => `${p.fp.toFixed(2)} · ${nome(id)} (${p.ruolo}, ${p.team})`],
            ['Punteggio medio per gara spostata', Object.entries(punti).filter(([, p]) => p.media), ([id, p]) => `${p.fp.toFixed(2)} · ${nome(id)}`],
        ]);
        applyBtn.hidden = false;
        status.textContent = nonTrovati.length ? `Attenzione: ${nonTrovati.length} nomi non trovati.` : 'Tabellino pronto da applicare.';
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
                    team: p.team || null, set: p.set || 0, voci: p.voci || {}, molt: p.molt ?? 1,
                });
            }
            await batch.commit();
        }
        await ref.update({ status: 'scored', scoredAt: firebase.firestore.FieldValue.serverTimestamp() });

        status.textContent = 'Calcolo le squadre di tutte le leghe…';
        const leghe = await db.collection('leagues').get();
        let squadre = 0;
        for (const lega of leghe.docs) squadre += await calcolaLega(lega, numero, punti, scadenza);

        status.textContent = 'Aggiorno le statistiche dei giocatori…';
        await aggiornaStatistiche(numero, punti);

        await db.doc('meta/punteggi').set({ appliedAt: firebase.firestore.FieldValue.serverTimestamp(), appliedBy: auth.currentUser.uid, matchday: numero });
        status.textContent = `Fatto: giornata ${numero} calcolata per ${squadre} squadre in ${leghe.size} leghe.`;
        applyBtn.hidden = true;
        calcolo = null;
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
    const [membri, formazioni, trasferimenti] = await Promise.all([
        lega.ref.collection('members').get(),
        lega.ref.collection('lineups').get(),
        lega.ref.collection('transfers').get(),
    ]);
    const perUtente = perPartecipante(formazioni, 'savedAt');
    const movimenti = perPartecipante(trasferimenti, 'at');

    const batch = db.batch();
    for (const m of membri.docs) {
        // Chi non ha salvato la formazione per questa giornata gioca con la sua ultima formazione;
        // chi è arrivato col mercato dopo il salvataggio e prima della scadenza prende il posto di chi è partito
        const formazione = Mercato.applicaSostituzioni(Punteggi.formazionePer(numero, perUtente[m.id] || []), movimenti[m.id] || [], scadenza);
        const risultato = formazione ? Punteggi.punteggioSquadra(formazione, punti) : { totale: 0, dettaglio: [] };
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

    if (lega.data().settings?.mode === 'scontri') {
        const iscritti = membri.docs.map(m => ({ uid: m.id, joinedAt: m.data().joinedAt?.toMillis?.() ?? 0 }));
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
