// Riquadro "Nuova stagione" del pannello Admin. In estate, quando chi sviluppa ha portato frontend/js/stagione.js
// all'anno nuovo e il bot ha scaricato listone e calendario della nuova stagione, un admin con un clic:
// 1. archivia la classifica finale di ogni lega (archivio/{anno}_{lega}: la vedono i suoi partecipanti nella scheda Lega);
// 2. cancella i dati della stagione finita: leghe con tutto quello che contengono, codici invito, "le mie leghe",
//    giornate con statistiche e correzioni, listone e riepiloghi in meta. Restano gli admin e l'archivio;
// 3. applica listone e calendario nuovi, con le stesse funzioni dei riquadri qui sotto;
// 4. segna la stagione nuova in meta/stagione. È l'ultimo passo: se qualcosa si interrompe basta ripremere,
//    l'archivio non si rifà e la pulizia riprende da quello che è rimasto.
const STAGIONE_DATI_URL = '../data/stagione.json';
const SOTTORACCOLTE_LEGA = ['members', 'rosters', 'lineups', 'schedule', 'trades', 'transfers', 'scores', 'standings'];
const META_DELLA_STAGIONE = ['statistiche', 'punteggi', 'listone', 'calendario'];

let passaggioStagione = null; // { annoGioco, archiviata } quando il passaggio è pronto

if (auth) {
    document.getElementById('stagioneCheckBtn').addEventListener('click', controllaStagione);
    document.getElementById('stagioneConferma').addEventListener('input', aggiornaConfermaStagione);
    document.getElementById('stagioneApplyBtn').addEventListener('click', iniziaStagione);
}

// Stagione del gioco in Firestore; la prima volta si segna quella del codice, cioè la stagione in corso
async function leggiStagioneGioco() {
    const ref = db.doc('meta/stagione');
    const snap = await ref.get();
    if (snap.exists && Number.isInteger(snap.data().anno)) return snap.data();
    const dati = { anno: Stagione.ANNO };
    await ref.set(dati);
    return dati;
}

async function mostraStagioneGioco() {
    const info = document.getElementById('stagioneInfo');
    try {
        const { anno } = await leggiStagioneGioco();
        info.textContent = `Stagione in corso nel gioco: ${Stagione.nomeDi(anno)}`;
    } catch {
        info.textContent = 'Stagione in corso nel gioco: non disponibile';
    }
}

// Una proposta del bot, o null se non c'è ancora
async function propostaFacoltativa(url) {
    try {
        return await caricaProposta(url);
    } catch {
        return null;
    }
}

function mostraConfermaStagione(visibile) {
    document.getElementById('stagioneConfermaBox').hidden = !visibile;
    document.getElementById('stagioneConferma').value = '';
    aggiornaConfermaStagione();
}

function aggiornaConfermaStagione() {
    const scritto = document.getElementById('stagioneConferma').value.trim();
    document.getElementById('stagioneApplyBtn').disabled = !passaggioStagione || scritto !== Stagione.nome;
}

async function controllaStagione() {
    const status = document.getElementById('stagioneStatus');
    const riepilogo = document.getElementById('stagioneRiepilogo');
    passaggioStagione = null;
    mostraConfermaStagione(false);
    riempi(riepilogo);
    status.textContent = 'Controllo in corso…';
    try {
        const gioco = await leggiStagioneGioco();
        const [dati, listone, calendario] = await Promise.all([
            propostaFacoltativa(STAGIONE_DATI_URL), propostaFacoltativa(LISTONE_URL), propostaFacoltativa(CALENDARIO_URL), loadNextMatchday()]);
        const adesso = new Date();
        const nonCalcolate = state.matchdays.filter(g => g.lockAt <= adesso && g.status !== 'scored').map(g => g.number);
        const esito = NuovaStagione.controllaPassaggio({
            daGiocare: state.matchdays.filter(g => g.lockAt > adesso).length,
            annoGioco: gioco.anno,
            annoCodice: Stagione.ANNO,
            annoDati: dati?.anno ?? null,
            giocatori: Array.isArray(listone) ? listone.length : null,
            giornate: Array.isArray(calendario) ? calendario.length : null,
            squadre: Stagione.SQUADRE,
            giornateAttese: Stagione.GIORNATE,
        });
        if (esito.stato === 'in-corso') {
            status.textContent = `La stagione ${Stagione.nomeDi(gioco.anno)} è in corso: niente da fare. Il passaggio si fa in estate, dopo che chi sviluppa ha cambiato la stagione nel codice.`;
            return;
        }
        if (esito.stato === 'da-preparare') {
            status.textContent = `La stagione ${Stagione.nome} non è ancora pronta: ${esito.motivi.join('; ')}. Riprova dopo il prossimo aggiornamento dei dati (GitHub → Actions → "Aggiorna dati SuperLega").`;
            return;
        }
        const leghe = await db.collection('leagues').get();
        riempi(riepilogo, el('ul', { class: 'routine-list' },
            nonCalcolate.length ? rigaRoutine('errore', `Giornate giocate ma non calcolate: ${nonCalcolate.join(', ')}. La classifica archiviata non le conterrà: se servono, calcolale prima con la routine settimanale`) : null,
            rigaRoutine('da', `Archivia la classifica finale di ${leghe.size === 1 ? '1 lega' : `${leghe.size} leghe`} della stagione ${Stagione.nomeDi(gioco.anno)}`),
            rigaRoutine('da', 'Cancella leghe, rose, formazioni, mercato, giornate, punteggi e listone della stagione finita (restano gli admin e l\'archivio)'),
            rigaRoutine('da', `Applica il listone nuovo (${listone.length} giocatori) e il calendario nuovo (${calendario.length} giornate)`)));
        passaggioStagione = { annoGioco: gioco.anno, archiviata: gioco.archiviata === gioco.anno };
        mostraConfermaStagione(true);
        status.textContent = '';
    } catch (e) {
        status.textContent = 'Controllo non riuscito: ' + messaggioErrore(e);
    }
}

async function archiviaLega(anno, lega) {
    const base = `leagues/${lega.id}`;
    const [members, standings] = await Promise.all([db.collection(`${base}/members`).get(), db.collection(`${base}/standings`).get()]);
    if (members.empty) return; // lega senza squadre: niente da ricordare
    const iscritti = members.docs.map(d => ({ uid: d.id, ...d.data(), joinedAt: d.data().joinedAt?.toMillis?.() ?? 0 }));
    const classifica = Object.fromEntries(standings.docs.map(d => [d.id, d.data()]));
    await db.doc(`archivio/${NuovaStagione.idArchivio(anno, lega.id)}`).set({
        ...NuovaStagione.archivioLega({ anno, lega, members: iscritti, standings: classifica }),
        archiviatoAt: firebase.firestore.FieldValue.serverTimestamp(),
        archiviatoBy: auth.currentUser.uid,
    });
}

// Tutti i documenti della stagione finita. Si leggono prima di cancellare: le regole delle offerte guardano
// le scadenze delle giornate, che vanno quindi ancora trovate al loro posto
async function documentiDellaStagione(leghe) {
    const refsDi = async percorso => (await db.collection(percorso).get()).docs.map(d => d.ref);
    const giornate = (await db.collection('matchdays').get()).docs;
    const refs = [];
    for (const lega of leghe) {
        const base = `leagues/${lega.id}`;
        const iscritti = await db.collection(`${base}/members`).get();
        for (const sotto of SOTTORACCOLTE_LEGA) refs.push(...await refsDi(`${base}/${sotto}`));
        for (const g of giornate) refs.push(...await refsDi(`${base}/markets/${g.id}/offers`));
        refs.push(...iscritti.docs.map(m => db.doc(`users/${m.id}/leagues/${lega.id}`)));
        if (lega.code) refs.push(db.doc(`leagueCodes/${lega.code}`));
        refs.push(db.doc(base));
    }
    for (const g of giornate) {
        refs.push(...await refsDi(`matchdays/${g.id}/stats`));
        refs.push(db.doc(`matchdays/${g.id}/correzioni/tabellino`), g.ref);
    }
    refs.push(...await refsDi('players'));
    refs.push(...META_DELLA_STAGIONE.map(id => db.doc(`meta/${id}`)));
    return refs;
}

async function cancellaDocumenti(refs, avanzamento) {
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const ref of refs.slice(i, i + BATCH_SIZE)) batch.delete(ref);
        await batch.commit();
        avanzamento(Math.min(i + BATCH_SIZE, refs.length), refs.length);
    }
}

async function iniziaStagione() {
    if (!passaggioStagione || document.getElementById('stagioneConferma').value.trim() !== Stagione.nome) return;
    const status = document.getElementById('stagioneStatus');
    const applyBtn = document.getElementById('stagioneApplyBtn');
    const conferma = document.getElementById('stagioneConferma');
    const passo = testo => { status.textContent = testo; };
    applyBtn.disabled = true;
    conferma.disabled = true;
    try {
        const { annoGioco } = passaggioStagione;
        const leghe = (await db.collection('leagues').get()).docs.map(d => ({ id: d.id, ...d.data() }));
        if (!passaggioStagione.archiviata) {
            passo('Archivio le classifiche finali…');
            for (const lega of leghe) await archiviaLega(annoGioco, lega);
            await db.doc('meta/stagione').set({ archiviata: annoGioco }, { merge: true });
            passaggioStagione.archiviata = true;
        }
        passo('Raccolgo i dati della stagione finita…');
        const refs = await documentiDellaStagione(leghe);
        await cancellaDocumenti(refs, (fatti, totale) => passo(`Cancello i dati della stagione finita: ${fatti} su ${totale}…`));

        passo('Applico il listone nuovo…');
        if (!await checkListone() || !await applyListone()) throw new Error('listone non applicato (vedi il riquadro Listone)');
        passo('Applico il calendario nuovo…');
        if (!await checkCalendario() || !await applyCalendario()) throw new Error('calendario non applicato (vedi il riquadro Calendario)');

        await db.doc('meta/stagione').set({
            anno: Stagione.ANNO,
            iniziataAt: firebase.firestore.FieldValue.serverTimestamp(),
            iniziataBy: auth.currentUser.uid,
        });
        passaggioStagione = null;
        mostraConfermaStagione(false);
        riempi(document.getElementById('stagioneRiepilogo'));
        await Promise.all([loadNextMatchday(), loadStatistiche()]);
        await loadMyLeagues();
        caricaArchivio();
        mostraStagioneGioco();
        loadGiornateTabellini();
        passo(`Fatto: è cominciata la stagione ${Stagione.nome}. Le classifiche finali sono nell'archivio (scheda Lega); ora i Presidenti possono creare le nuove leghe.`);
    } catch (e) {
        passo(`Passaggio interrotto: ${messaggioErrore(e).replace(/\.$/, '')}. Premi di nuovo "Controlla" e "Inizia la stagione": riprende da dove si è fermato.`);
    } finally {
        conferma.disabled = false;
        aggiornaConfermaStagione();
    }
}
