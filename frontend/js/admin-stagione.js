// Riquadro "Nuova stagione" del pannello Admin. In estate, quando la Lega ha pubblicato la stagione nuova e il bot
// l'ha scritta in data/stagione.json con listone e calendario nuovi (nessuno cambia il codice), un admin con un clic:
// 1. archivia la classifica finale di ogni lega (archivio/{anno}_{lega}: la vedono i suoi partecipanti nella scheda Lega);
// 2. cancella i dati della stagione finita: leghe con tutto quello che contengono, codici invito, "le mie leghe",
//    giornate con statistiche e correzioni, listone e riepiloghi in meta. Restano gli admin e l'archivio;
// 3. applica listone e calendario nuovi, con le stesse funzioni dei riquadri qui sotto;
// 4. segna la stagione nuova in meta/stagione. È l'ultimo passo: se qualcosa si interrompe basta ripremere,
//    l'archivio non si rifà e la pulizia riprende da quello che è rimasto.
const SOTTORACCOLTE_LEGA = ['members', 'rosters', 'lineups', 'schedule', 'trades', 'transfers', 'scores', 'standings'];
const META_DELLA_STAGIONE = ['statistiche', 'punteggi', 'listone', 'calendario'];

let passaggioStagione = null; // { annoGioco, annoNuovo, nome, archiviata } quando il passaggio è pronto

if (auth) {
    document.getElementById('stagioneCheckBtn').addEventListener('click', controllaStagione);
    document.getElementById('stagioneConferma').addEventListener('input', aggiornaConfermaStagione);
    document.getElementById('stagioneApplyBtn').addEventListener('click', iniziaStagione);
}

// Stagione del gioco in Firestore. La prima volta si segna quella del calendario già nel gioco, se c'è: la Lega
// (data/stagione.json) potrebbe essere già passata alla stagione nuova, e allora il passaggio non si aprirebbe più
async function leggiStagioneGioco() {
    const ref = db.doc('meta/stagione');
    const snap = await ref.get();
    if (snap.exists && Number.isInteger(snap.data().anno)) return snap.data();
    const prima = await db.collection('matchdays').orderBy('number').limit(1).get();
    let anno = prima.empty ? null : NuovaStagione.annoDelCalendario(prima.docs[0].data().lockAt?.toDate?.());
    if (anno == null) anno = (await stagionePronta)?.anno ?? null;
    if (anno == null) throw new Error('manca la stagione della Lega (data/stagione.json)');
    const dati = { anno };
    await ref.set(dati);
    return dati;
}

async function mostraStagioneGioco() {
    const info = document.getElementById('stagioneInfo');
    try {
        const [{ anno }, lega] = await Promise.all([leggiStagioneGioco(), stagionePronta]);
        info.textContent = `Stagione in corso nel gioco: ${Stagione.nomeDi(anno)}`;
        if (lega && lega.anno > anno) info.textContent += ` · la Lega è già alla ${lega.nome}: premi «Controlla» per il passaggio`;
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
    document.getElementById('stagioneApplyBtn').disabled = !passaggioStagione || scritto !== passaggioStagione.nome;
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
        const [datiLega, listone, calendario] = await Promise.all([
            propostaFacoltativa(STAGIONE_URL), propostaFacoltativa(LISTONE_URL), propostaFacoltativa(CALENDARIO_URL), loadNextMatchday()]);
        const lega = Stagione.descrivi(datiLega);
        const adesso = new Date();
        const nonCalcolate = state.matchdays.filter(g => g.lockAt <= adesso && g.status !== 'scored').map(g => g.number);
        const esito = NuovaStagione.controllaPassaggio({
            daGiocare: state.matchdays.filter(g => g.lockAt > adesso).length,
            daCompletare: gioco.daCompletare === true,
            annoGioco: gioco.anno,
            annoLega: lega?.anno ?? null,
            squadre: lega?.squadre ?? 0,
            giocatori: Array.isArray(listone) ? listone.length : null,
            giornate: Array.isArray(calendario) ? calendario.length : null,
        });
        if (esito.stato === 'in-corso') {
            status.textContent = `La stagione ${Stagione.nomeDi(gioco.anno)} è in corso: niente da fare. Il passaggio si fa in estate, quando la Lega pubblica la stagione nuova e il bot la scarica.`;
            return;
        }
        if (esito.stato === 'da-preparare') {
            status.textContent = `La stagione ${lega.nome} non è ancora pronta: ${esito.motivi.join('; ')}. Il bot riprova a ogni aggiornamento dei dati: ricontrolla tra qualche giorno.`;
            return;
        }
        const applica = rigaRoutine('da', `Applica il listone nuovo (${listone.length} giocatori) e il calendario nuovo (${calendario.length} giornate)`);
        if (esito.stato === 'da-completare') {
            // Archivio e cancellazione sono già fatti: resta solo da applicare listone e calendario
            riempi(riepilogo, el('ul', { class: 'routine-list' },
                rigaRoutine('ok', 'Classifiche finali archiviate e dati della stagione finita cancellati'), applica));
            passaggioStagione = { annoNuovo: lega.anno, nome: lega.nome, soloApplica: true };
        } else {
            // Le leghe per nome: una creata in estate prima del passaggio verrebbe archiviata e cancellata
            const leghe = (await db.collection('leagues').get()).docs.map(d => d.data().name || d.id);
            riempi(riepilogo, el('ul', { class: 'routine-list' },
                nonCalcolate.length ? rigaRoutine('errore', `Giornate giocate ma non calcolate: ${nonCalcolate.join(', ')}. La classifica archiviata non le conterrà: se servono, calcolale prima con la routine settimanale`) : null,
                rigaRoutine('da', leghe.length
                    ? `Archivia la classifica finale ${leghe.length === 1 ? 'della lega' : `delle ${leghe.length} leghe`} della stagione ${Stagione.nomeDi(gioco.anno)}: ${leghe.join(', ')}`
                    : `Nessuna lega da archiviare per la stagione ${Stagione.nomeDi(gioco.anno)}`),
                rigaRoutine('da', 'Cancella leghe, rose, formazioni, mercato, giornate, punteggi e listone della stagione finita (restano gli admin e l\'archivio)'),
                applica));
            passaggioStagione = { annoGioco: gioco.anno, annoNuovo: lega.anno, nome: lega.nome, archiviata: gioco.archiviata === gioco.anno };
        }
        document.getElementById('stagioneNuovaNome').textContent = lega.nome;
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
    if (!passaggioStagione || document.getElementById('stagioneConferma').value.trim() !== passaggioStagione.nome) return;
    const status = document.getElementById('stagioneStatus');
    const applyBtn = document.getElementById('stagioneApplyBtn');
    const conferma = document.getElementById('stagioneConferma');
    const passo = testo => { status.textContent = testo; };
    applyBtn.disabled = true;
    conferma.disabled = true;
    try {
        const { annoGioco, annoNuovo, nome } = passaggioStagione;
        if (!passaggioStagione.soloApplica) {
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
            // Da qui il gioco è già alla stagione nuova: se si interrompe, "Controlla" propone di completare il
            // passaggio (solo listone e calendario) invece di fermarsi sulle giornate nuove "ancora da giocare"
            await db.doc('meta/stagione').set({ anno: annoNuovo, daCompletare: true, archiviata: annoGioco });
            passaggioStagione.soloApplica = true;
        }

        passo('Applico il listone nuovo…');
        if (!await checkListone() || !await applyListone()) throw new Error('listone non applicato (vedi il riquadro Listone)');
        passo('Applico il calendario nuovo…');
        if (!await checkCalendario() || !await applyCalendario()) throw new Error('calendario non applicato (vedi il riquadro Calendario)');

        await db.doc('meta/stagione').set({
            anno: annoNuovo,
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
        passo(`Fatto: è cominciata la stagione ${nome}. Le classifiche finali sono nell'archivio (scheda Lega); ora i Presidenti possono creare le nuove leghe.`);
    } catch (e) {
        passo(`Passaggio interrotto: ${messaggioErrore(e).replace(/\.$/, '')}. Premi di nuovo "Controlla" e "Inizia la stagione": riprende da dove si è fermato.`);
    } finally {
        conferma.disabled = false;
        aggiornaConfermaStagione();
    }
}
