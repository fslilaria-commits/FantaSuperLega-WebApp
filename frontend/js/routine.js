// Routine settimanale dell'admin: controlla listone, calendario e tabellini insieme e applica tutto con un clic.
// Usa le funzioni dei singoli riquadri del pannello (admin.js, admin-punteggi.js), nell'ordine giusto:
// prima il listone (i nuovi giocatori servono per abbinare i tabellini), poi il calendario, poi le giornate.
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
    const res = await fetch(`../data/tabellini/index.json?t=${Date.now()}`, { cache: 'no-store' });
    const { giornate } = res.ok ? await res.json() : { giornate: [] };
    await loadNextMatchday();
    const calcolate = new Set(state.matchdays.filter(g => g.status === 'scored').map(g => g.number));
    return giornate.filter(n => !calcolate.has(n)).sort((a, b) => a - b);
}

async function controllaRoutine() {
    const lista = document.getElementById('routineList');
    const applyBtn = document.getElementById('routineApplyBtn');
    const status = document.getElementById('routineStatus');
    applyBtn.hidden = true;
    status.textContent = 'Controllo in corso…';
    const righe = [];
    try {
        await checkListone();
        const modificheListone = listoneDiff ? ListoneDiff.totaleModifiche(listoneDiff) : 0;
        righe.push(rigaRoutine(modificheListone ? 'da' : 'ok', modificheListone ? `Listone: ${modificheListone} modifiche da applicare` : 'Listone aggiornato'));

        await checkCalendario();
        const modificheCalendario = calendarioDiff ? calendarioDiff.scritture.length : 0;
        const bloccate = calendarioDiff ? calendarioDiff.scadenzeBloccate.length : 0;
        righe.push(rigaRoutine(modificheCalendario ? 'da' : 'ok', modificheCalendario ? `Calendario: ${modificheCalendario} giornate da aggiornare` : 'Calendario aggiornato'));
        if (bloccate) righe.push(rigaRoutine('errore', `Calendario: ${bloccate} giornate già bloccate con orari diversi sul sito, da verificare nel riquadro Calendario`));

        const giornate = await giornateDaCalcolare();
        righe.push(rigaRoutine(giornate.length ? 'da' : 'ok', giornate.length ? `Punteggi: giornate da calcolare ${giornate.join(', ')}` : 'Punteggi: tutte le giornate scaricate sono già calcolate'));

        routine = { listone: modificheListone > 0, calendario: modificheCalendario > 0, giornate };
        lista.replaceChildren(...righe);
        const daFare = routine.listone || routine.calendario || giornate.length > 0;
        applyBtn.hidden = !daFare;
        status.textContent = daFare ? 'Controlla le voci e applica.' : 'Tutto aggiornato: niente da fare questa settimana.';
    } catch (e) {
        lista.replaceChildren(...righe, rigaRoutine('errore', 'Controllo non riuscito: ' + e.message));
        status.textContent = '';
    }
}

async function applicaRoutine() {
    if (!routine) return;
    const status = document.getElementById('routineStatus');
    const applyBtn = document.getElementById('routineApplyBtn');
    applyBtn.disabled = true;
    try {
        if (routine.listone) {
            status.textContent = 'Applico il listone…';
            await applyListone();
        }
        if (routine.calendario) {
            status.textContent = 'Applico il calendario…';
            await applyCalendario();
        }
        if (routine.giornate.length) await loadGiornateTabellini(); // la tendina delle giornate deve contenerle tutte
        for (const n of routine.giornate) {
            status.textContent = `Calcolo la giornata ${n}…`;
            document.getElementById('punteggiGiornata').value = String(n);
            await checkPunteggi();
            await applyPunteggi();
        }
        routine = null;
        await controllaRoutine();
        status.textContent = 'Fatto: routine completata. ' + document.getElementById('routineStatus').textContent;
    } catch (e) {
        status.textContent = 'Routine interrotta: ' + e.message;
    } finally {
        applyBtn.disabled = false;
    }
}
