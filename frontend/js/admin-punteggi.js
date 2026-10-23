// Pannello Admin, tabellini e punteggi: calcola i punti dei giocatori di una giornata (regole FantaLVF),
// poi punteggi e classifiche di tutte le leghe. Usa BATCH_SIZE, renderSections e loadMetaInfo di admin.js.
const TABELLINI_URL = '../data/tabellini';
let calcolo = null;

if (auth) {
    document.getElementById('punteggiCheckBtn').addEventListener('click', checkPunteggi);
    document.getElementById('punteggiApplyBtn').addEventListener('click', applyPunteggi);
    auth.onAuthStateChanged(user => { if (user) loadGiornateTabellini(); });
}

async function loadGiornateTabellini() {
    const select = document.getElementById('punteggiGiornata');
    try {
        const res = await fetch(`${TABELLINI_URL}/index.json?t=${Date.now()}`, { cache: 'no-store' });
        const { giornate } = res.ok ? await res.json() : { giornate: [] };
        select.replaceChildren(...giornate.slice().reverse().map(n => el('option', { value: n }, `Giornata ${n}`)));
        if (!giornate.length) select.append(el('option', { value: '' }, 'Nessun tabellino'));
    } catch {
        select.replaceChildren(el('option', { value: '' }, 'Nessun tabellino'));
    }
    loadMetaInfo('punteggi', 'punteggiInfo');
}

// Media stagionale dei giocatori delle squadre con la gara spostata, dalle giornate già calcolate
async function medieGiocatori(ids, primaDi) {
    if (!ids.length) return {};
    const storico = Object.fromEntries(ids.map(id => [id, []]));
    const giornate = await db.collection('matchdays').where('status', '==', 'scored').get();
    for (const g of giornate.docs.filter(d => d.data().number < primaDi)) {
        const stats = await g.ref.collection('stats').get();
        for (const s of stats.docs) if (storico[s.id] && !s.data().media) storico[s.id].push(s.data());
    }
    return Object.fromEntries(ids.map(id => [id, Punteggi.media(storico[id])]));
}

async function checkPunteggi() {
    const status = document.getElementById('punteggiStatus');
    const applyBtn = document.getElementById('punteggiApplyBtn');
    const numero = parseInt(document.getElementById('punteggiGiornata').value, 10);
    applyBtn.hidden = true;
    calcolo = null;
    if (!numero) return;
    status.textContent = 'Calcolo in corso…';
    try {
        const res = await fetch(`${TABELLINI_URL}/${numero}.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`tabellino non trovato (HTTP ${res.status})`);
        const tabellino = await res.json();
        const listone = Object.values(state.playersById);
        const spostate = new Set(tabellino.matches.filter(m => m.moved).flatMap(m => [m.homeId, m.awayId]));
        const medie = await medieGiocatori(listone.filter(p => spostate.has(p.teamId)).map(p => p.id), numero);
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
    } catch (e) {
        status.textContent = 'Calcolo non riuscito: ' + e.message;
    }
}

async function applyPunteggi() {
    if (!calcolo) return;
    const { numero, punti } = calcolo;
    const status = document.getElementById('punteggiStatus');
    const applyBtn = document.getElementById('punteggiApplyBtn');
    applyBtn.disabled = true;
    try {
        status.textContent = 'Salvo i punteggi dei giocatori…';
        const ref = db.collection('matchdays').doc(String(numero));
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
        await ref.set({ status: 'scored', scoredAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

        status.textContent = 'Calcolo le squadre di tutte le leghe…';
        const leghe = await db.collection('leagues').get();
        const scadenza = (await ref.get()).data().lockAt.toMillis();
        let squadre = 0;
        for (const lega of leghe.docs) squadre += await calcolaLega(lega, numero, punti, scadenza);

        status.textContent = 'Aggiorno le statistiche dei giocatori…';
        await aggiornaStatistiche();

        await db.doc('meta/punteggi').set({ appliedAt: firebase.firestore.FieldValue.serverTimestamp(), appliedBy: auth.currentUser.uid, matchday: numero });
        status.textContent = `Fatto: giornata ${numero} calcolata per ${squadre} squadre in ${leghe.size} leghe.`;
        applyBtn.hidden = true;
        loadMetaInfo('punteggi', 'punteggiInfo');
        if (state.league) await selectLeague(state.league.id);
    } catch (e) {
        status.textContent = 'Calcolo non riuscito: ' + (e.code === 'permission-denied' ? 'permessi da admin mancanti (regole aggiornate?).' : e.message);
    } finally {
        applyBtn.disabled = false;
    }
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
    const perUtente = {};
    for (const f of formazioni.docs) (perUtente[f.data().uid] = perUtente[f.data().uid] || []).push(f.data());
    const movimenti = {};
    for (const t of trasferimenti.docs) (movimenti[t.data().uid] = movimenti[t.data().uid] || []).push({ ...t.data(), at: t.data().at?.toMillis?.() ?? 0 });

    const batch = db.batch();
    for (const m of membri.docs) {
        // Chi non ha salvato la formazione per questa giornata gioca con la sua ultima formazione
        // Chi è arrivato col mercato prima della scadenza prende il posto di chi è partito
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
        const iscritti = membri.docs.map(m => ({ uid: m.id, joinedAt: m.data().joinedAt?.toMillis() ?? 0 }));
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

// Riepilogo stagionale dei giocatori (meta/statistiche), ricostruito da tutte le giornate calcolate
async function aggiornaStatistiche() {
    const calcolate = await db.collection('matchdays').where('status', '==', 'scored').get();
    const giornate = [];
    for (const g of calcolate.docs) {
        const stats = await g.ref.collection('stats').get();
        giornate.push({ number: g.data().number, stats: Object.fromEntries(stats.docs.map(d => [d.id, d.data()])) });
    }
    const players = Statistiche.costruisciRiepilogo(giornate);
    await db.doc('meta/statistiche').set({ players, giornate: giornate.map(g => g.number).sort((a, b) => a - b), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    state.statistiche = players;
}
