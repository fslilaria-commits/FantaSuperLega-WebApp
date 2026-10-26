// Scaricamento delle pagine del sito della Lega, uguale per stagione, listone, calendario e tabellini.
// Il bot si presenta per quello che è (nome e indirizzo del progetto) e lascia una pausa tra una pagina e l'altra,
// come una persona che naviga. Il sito sta dietro Cloudflare, che rifiuta le richieste dai server di GitHub: per
// questo il bot gira su un PC (docs/bot-pc.md). Se una pagina viene rifiutata, l'errore dice chi l'ha bloccata e perché.
const INTESTAZIONI = {
    'User-Agent': 'FantaSuperLega-bot/1.0 (+https://github.com/fslilaria-commits/FantaSuperLega-WebApp)',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
};
const PAUSA_MS = 1000;

// Messaggio per una risposta non riuscita: stato, chi ha risposto e titolo della pagina d'errore
function descriviErrore(url, res, testo) {
    const h = nome => res.headers.get(nome);
    const titolo = /<title[^>]*>([^<]*)<\/title>/i.exec(testo || '')?.[1]?.replace(/\s+/g, ' ').trim();
    const dettagli = [
        h('server') && `server ${h('server')}`,
        h('cf-mitigated') && `cf-mitigated ${h('cf-mitigated')}`,
        h('cf-ray') && `cf-ray ${h('cf-ray')}`,
        titolo && `pagina «${titolo}»`,
    ].filter(Boolean);
    const cloudflare = /cloudflare/i.test(h('server') || '') || h('cf-mitigated') != null;
    const spiegazione = cloudflare && [403, 429, 503].includes(res.status)
        ? ' Cloudflare ha rifiutato la richiesta: probabilmente blocca i server da cui parte il bot (per esempio quelli di GitHub).'
        : '';
    return `HTTP ${res.status} per ${url}${dettagli.length ? ` (${dettagli.join(', ')})` : ''}.${spiegazione}`;
}

let ultimaRichiesta = 0;
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function scaricaPagina(url) {
    const attesa = ultimaRichiesta + PAUSA_MS - Date.now();
    if (attesa > 0) await aspetta(attesa);
    ultimaRichiesta = Date.now();
    const res = await fetch(url, { headers: INTESTAZIONI });
    const testo = await res.text();
    if (!res.ok) throw new Error(descriviErrore(url, res, testo));
    return testo;
}

module.exports = { INTESTAZIONI, PAUSA_MS, descriviErrore, scaricaPagina };
