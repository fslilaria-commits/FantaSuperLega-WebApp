// Routine settimanale dell'admin: controlla listone, calendario e tabellini insieme e applica tutto con un clic.
// Usa le funzioni dei singoli riquadri del pannello (admin.js, admin-punteggi.js), nell'ordine giusto:
// prima il listone (i nuovi giocatori servono per abbinare i tabellini), poi il calendario, poi le giornate.
// Si ferma al primo errore, e non applica una giornata con nomi non trovati nel listone: va controllata a mano.
let routine = null; // { listone, calendario, giornate: [n] }

if (auth) {
    document.getElementById('routineCheckBtn').addEventListener('click', controllaRoutine);
    document.getElementById('routineApplyBtn').addEventListener('click', applicaRoutine);
}

function rigaRoutine(stato, testo) {
    const icone = { ok: 'fa-circle-check', da: 'fa-circle-exclamation', errore: 'fa-circle-xmark' };
    return el('li', { class: `routine-${stato}` }, el('i', { class: `fas ${icone[stato]}` }), ` ${testo}`);
}

async function giornateDaCalcolare() {
    const giornate = await giornateConTabellino();
    await loadNextMatchday();
    const calcolate = giornateCalcolate();
    return giornate.filter(n => !calcolate.has(n)).sort((a, b) => a - b);
}

async function controllaRoutine() {
    const lista = document.getElementById('routineList');
    const applyBtn = document.getElementById('routineApplyBtn');
    const status = document.getElementById('routineStatus');
    applyBtn.hidden = true;
    routine = null;
    status.textContent = 'Controllo in corso…';
    const righe = [];
    try {
        const nuova = await stagioneNuovaInAttesa();
        if (nuova) {
            riempi(lista, rigaRoutine('errore', messaggioStagioneNuova(nuova)));
            status.textContent = '';
            return;
        }
        if (!await checkListone()) throw new Error('controllo del listone non riuscito (vedi il riquadro Listone)');
        const modificheListone = listoneDiff ? ListoneDiff.totaleModifiche(listoneDiff) : 0;
        righe.push(rigaRoutine(modificheListone ? 'da' : 'ok', modificheListone ? `Listone: ${modificheListone} modifiche da applicare` : 'Listone aggiornato'));

        if (!await checkCalendario()) throw new Error('controllo del calendario non riuscito (vedi il riquadro Calendario)');
        const modificheCalendario = calendarioDiff ? calendarioDiff.scritture.length : 0;
        const bloccate = calendarioDiff ? calendarioDiff.scadenzeBloccate.length : 0;
        righe.push(rigaRoutine(modificheCalendario ? 'da' : 'ok', modificheCalendario ? `Calendario: ${modificheCalendario} giornate da aggiornare` : 'Calendario aggiornato'));
        if (bloccate) righe.push(rigaRoutine('errore', `Calendario: ${bloccate} giornate già bloccate con orari diversi sul sito, da verificare nel riquadro Calendario`));

        const giornate = await giornateDaCalcolare();
        righe.push(rigaRoutine(giornate.length ? 'da' : 'ok', giornate.length ? `Punteggi: giornate da calcolare ${giornate.join(', ')}` : 'Punteggi: tutte le giornate scaricate sono già calcolate'));
        // Se il bot dei dati si è fermato, "tutto aggiornato" vorrebbe dire solo che non è arrivato niente
        const avvisiBot = await avvisiBotDati().catch(() => []);
        for (const avviso of avvisiBot) righe.push(rigaRoutine('errore', `Bot dei dati: ${avviso}`));

        routine = { listone: modificheListone > 0, calendario: modificheCalendario > 0, giornate };
        riempi(lista, righe);
        const daFare = routine.listone || routine.calendario || giornate.length > 0;
        applyBtn.hidden = !daFare;
        status.textContent = daFare ? 'Controlla le voci e applica.'
            : avvisiBot.length ? 'Niente da applicare, ma i dati della Lega potrebbero non essere aggiornati: vedi il bot dei dati qui sopra.'
                : 'Tutto aggiornato: niente da fare questa settimana.';
    } catch (e) {
        riempi(lista, righe, rigaRoutine('errore', e.message));
        status.textContent = '';
    }
}

async function applicaRoutine() {
    if (!routine) return;
    const status = document.getElementById('routineStatus');
    const applyBtn = document.getElementById('routineApplyBtn');
    applyBtn.disabled = true;
    const ferma = motivo => { throw new Error(motivo); };
    try {
        if (routine.listone) {
            status.textContent = 'Applico il listone…';
            if (!await applyListone()) ferma('listone non applicato (vedi il riquadro Listone)');
        }
        if (routine.calendario) {
            status.textContent = 'Applico il calendario…';
            if (!await applyCalendario()) ferma('calendario non applicato (vedi il riquadro Calendario)');
        }
        if (routine.giornate.length) await loadGiornateTabellini(); // la tendina delle giornate deve contenerle tutte
        for (const n of routine.giornate) {
            status.textContent = `Calcolo la giornata ${n}…`;
            document.getElementById('punteggiGiornata').value = String(n);
            const controllo = await checkPunteggi();
            if (!controllo.ok) ferma(`giornata ${n}: calcolo non riuscito (vedi il riquadro Tabellini e punteggi)`);
            if (controllo.nonTrovati) ferma(`giornata ${n}: ${controllo.nonTrovati} nomi non trovati nel listone, controlla e applica a mano dal riquadro Tabellini e punteggi`);
            if (!await applyPunteggi()) ferma(`giornata ${n}: non applicata (vedi il riquadro Tabellini e punteggi)`);
        }
        await controllaRoutine();
        status.textContent = 'Fatto: routine completata. ' + document.getElementById('routineStatus').textContent;
    } catch (e) {
        status.textContent = 'Routine interrotta: ' + e.message;
    } finally {
        applyBtn.disabled = false;
    }
}
