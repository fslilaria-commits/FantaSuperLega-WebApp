// Le parti dell'aggiornamento sul PC del bot (aggiorna-dati.js) che non toccano né git né la rete.

// Un indirizzo della repo con dentro utente o chiave (https://nome:chiave@github.com/...): la chiave finirebbe in
// chiaro nella configurazione e nei messaggi. Deve restare nella Gestione credenziali di Windows
const haCredenziali = url => /^[a-z+]+:\/\/[^/]*@/i.test(String(url).trim());

// Toglie dai messaggi i percorsi del PC (cartella del bot, cartella dell'utente): data/bot.json è pubblico e il nome
// dell'utente di Windows non deve finirci
function senzaPercorsi(testo, percorsi = []) {
    let t = String(testo);
    for (const p of percorsi.filter(Boolean)) {
        // Lo stesso percorso con \ o con /, maiuscole o minuscole
        const schema = p.split(/[\\/]+/).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]+');
        t = t.replace(new RegExp(schema, 'gi'), '…');
    }
    return t.replace(/[a-z]:[\\/]+(users|utenti)[\\/]+[^\\/\s'"]+/gi, '…');
}

// Il messaggio d'errore di un passo (dalla riga con ❌ in poi, o l'ultima riga) su una riga sola, senza le parti che
// cambiano a ogni tentativo (cf-ray) e senza i percorsi del PC
function pulisciErrore(testo, percorsi = []) {
    const righe = String(testo || '').split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    const inizio = righe.findIndex(r => r.startsWith('❌'));
    const messaggio = inizio >= 0 ? righe.slice(inizio).join(' ') : righe.at(-1) || 'errore senza messaggio';
    return senzaPercorsi(messaggio, percorsi).replace(/^❌\s*/, '').replace(/,?\s*cf-ray [^,)]+/g, '').slice(0, 300);
}

// data/bot.json: { esito: 'ok' | 'errore', dal, errori }. dal è da quando vale l'esito: per un errore è il primo
// giorno in cui il bot non è riuscito, anche se il messaggio poi cambia
function statoBot(precedente, errori, adesso = new Date()) {
    const esito = errori.length ? 'errore' : 'ok';
    const stato = { esito, dal: precedente?.esito === esito && precedente.dal ? precedente.dal : adesso.toISOString() };
    if (errori.length) stato.errori = errori;
    return stato;
}

// I file toccati secondo git status --porcelain -z: per spostamenti e copie anche il percorso di partenza
function percorsiDaStatus(uscita) {
    const voci = String(uscita).split('\0').filter(Boolean);
    const percorsi = [];
    for (let i = 0; i < voci.length; i++) {
        const stato = voci[i].slice(0, 2);
        percorsi.push(voci[i].slice(3));
        if (/[RC]/.test(stato[0])) percorsi.push(voci[++i]);
    }
    return percorsi.filter(Boolean);
}

// Che cosa è cambiato in data/, per il messaggio del commit. percorsi: quelli del commit
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

module.exports = { haCredenziali, senzaPercorsi, pulisciErrore, statoBot, percorsiDaStatus, descriviModifiche };
