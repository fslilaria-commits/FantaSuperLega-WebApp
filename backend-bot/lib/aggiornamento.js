// Le parti dell'aggiornamento sul PC del bot (aggiorna-dati.js) che non toccano né git né la rete.

// Un indirizzo della repo con dentro utente o chiave (https://nome:chiave@github.com/...): la chiave finirebbe in
// chiaro nella configurazione e nei messaggi. Deve restare nella Gestione credenziali di Windows
const haCredenziali = url => /^[a-z+]+:\/\/[^/]*@/i.test(String(url).trim());

// Il messaggio d'errore di un passo (dalla riga con ❌ in poi, o l'ultima riga) su una riga sola, senza le parti che
// cambiano a ogni tentativo (cf-ray): così un errore che si ripete uguale ogni sera non diventa un commit ogni sera
function pulisciErrore(testo) {
    const righe = String(testo || '').split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    const inizio = righe.findIndex(r => r.startsWith('❌'));
    const messaggio = inizio >= 0 ? righe.slice(inizio).join(' ') : righe.at(-1) || 'errore senza messaggio';
    return messaggio.replace(/^❌\s*/, '').replace(/,?\s*cf-ray [^,)]+/g, '').slice(0, 300);
}

// data/bot.json: { esito: 'ok' | 'errore', dal, errori }. dal resta quello della prima volta finché l'esito e gli
// errori non cambiano, così il file (e il sito) cambia solo quando cambia la situazione
function statoBot(precedente, errori, adesso = new Date()) {
    const esito = errori.length ? 'errore' : 'ok';
    const uguale = precedente?.esito === esito && JSON.stringify(precedente.errori || []) === JSON.stringify(errori);
    const stato = { esito, dal: uguale && precedente.dal ? precedente.dal : adesso.toISOString() };
    if (errori.length) stato.errori = errori;
    return stato;
}

// Che cosa è cambiato in data/, per il messaggio del commit. percorsi: come li dà git status --porcelain
function descriviModifiche(percorsi) {
    const voci = [];
    const giornate = new Set();
    for (const p of percorsi.map(x => x.replace(/\\/g, '/'))) {
        const tabellino = p.match(/^data\/tabellini\/(\d+)\.json$/);
        if (tabellino) giornate.add(Number(tabellino[1]));
        else if (p === 'data/players.json') voci.push('listone');
        else if (p === 'data/calendario.json') voci.push('calendario');
        else if (p === 'data/stagione.json') voci.push('stagione');
        else if (p === 'data/bot.json') voci.push('stato del bot');
        else if (p.startsWith('data/tabellini')) giornate.add(null);
    }
    const numeri = [...giornate].filter(n => n != null).sort((a, b) => a - b);
    if (giornate.size) voci.push(numeri.length ? `tabellini ${numeri.join(', ')}` : 'tabellini');
    return `Dati aggiornati dal sito della Lega${voci.length ? ` (${[...new Set(voci)].join(', ')})` : ''}`;
}

module.exports = { haCredenziali, pulisciErrore, statoBot, descriviModifiche };
