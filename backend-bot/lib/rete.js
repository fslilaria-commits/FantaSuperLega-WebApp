// Scaricamento delle pagine del sito della Lega, uguale per listone, calendario e tabellini.
// Il sito sta dietro Cloudflare, che può rifiutare le richieste dai server di GitHub: si presentano le
// intestazioni di un browser normale e, se la pagina viene rifiutata, l'errore dice chi l'ha bloccata e perché.
const INTESTAZIONI = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
    Referer: 'https://www.legavolley.it/',
};

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

async function scaricaPagina(url) {
    const res = await fetch(url, { headers: INTESTAZIONI });
    const testo = await res.text();
    if (!res.ok) throw new Error(descriviErrore(url, res, testo));
    return testo;
}

module.exports = { INTESTAZIONI, descriviErrore, scaricaPagina };
