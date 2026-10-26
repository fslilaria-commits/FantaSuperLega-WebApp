// Scaricamento delle pagine del sito della Lega, uguale per stagione, listone, calendario e tabellini.
// Il bot si comporta come un visitatore educato:
// - legge il robots.txt del sito e non scarica le pagine che il sito chiede ai programmi di non leggere
//   (per esempio /statistiche/ di legavolley.it);
// - si presenta per quello che è (nome e indirizzo del progetto);
// - lascia un secondo tra una pagina e l'altra.
// Se il sito rifiuta una pagina (per esempio Cloudflare), l'errore dice chi l'ha bloccata e il bot si ferma:
// non prova ad aggirare il blocco.
const NOME_BOT = 'FantaSuperLega-bot';
const INTESTAZIONI = {
    'User-Agent': `${NOME_BOT}/1.0 (+https://github.com/fslilaria-commits/FantaSuperLega-WebApp)`,
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
        ? ' Cloudflare ha rifiutato la richiesta: il sito non accetta programmi automatici da questa rete. Il bot si ferma e non prova ad aggirare il blocco.'
        : '';
    return `HTTP ${res.status} per ${url}${dettagli.length ? ` (${dettagli.join(', ')})` : ''}.${spiegazione}`;
}

// --- robots.txt (RFC 9309) ---

// Le regole che valgono per il bot: quelle del gruppo con il suo nome, se c'è, altrimenti quelle di "*"
function regoleRobots(testo, nome = NOME_BOT) {
    const gruppi = [];
    let gruppo = null;
    let ultimoEraAgente = false;
    for (const grezza of String(testo || '').split(/\r?\n/)) {
        const m = grezza.replace(/#.*/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const campo = m[1].toLowerCase();
        const valore = m[2].trim();
        if (campo === 'user-agent') {
            if (!ultimoEraAgente) gruppi.push(gruppo = { agenti: [], regole: [] });
            gruppo.agenti.push(valore.toLowerCase());
            ultimoEraAgente = true;
            continue;
        }
        ultimoEraAgente = false;
        if (gruppo && (campo === 'allow' || campo === 'disallow')) gruppo.regole.push({ permesso: campo === 'allow', schema: valore });
    }
    const nostri = gruppi.filter(g => g.agenti.includes(nome.toLowerCase()));
    return (nostri.length ? nostri : gruppi.filter(g => g.agenti.includes('*'))).flatMap(g => g.regole);
}

// Uno schema del robots.txt (con * e $ finale) corrisponde all'inizio del percorso?
function corrisponde(schema, percorso) {
    const fine = schema.endsWith('$');
    const parti = (fine ? schema.slice(0, -1) : schema).split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^${parti.join('.*')}${fine ? '$' : ''}`).test(percorso);
}

// Percorso (con la query) permesso? Vince la regola più lunga che corrisponde; a parità vince Allow
function permesso(regole, percorso) {
    let vince = null;
    for (const r of regole) {
        if (!r.schema || !corrisponde(r.schema, percorso)) continue; // "Disallow:" vuoto non vieta niente
        if (!vince || r.schema.length > vince.schema.length || (r.schema.length === vince.schema.length && r.permesso)) vince = r;
    }
    return !vince || vince.permesso;
}

let ultimaRichiesta = 0;
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const robotsPerSito = new Map(); // origine -> Promise delle regole, una lettura per sito a ogni giro

async function richiesta(url) {
    const attesa = ultimaRichiesta + PAUSA_MS - Date.now();
    if (attesa > 0) await aspetta(attesa);
    ultimaRichiesta = Date.now();
    return fetch(url, { headers: INTESTAZIONI });
}

// Senza robots.txt (4xx) è tutto permesso; se il sito non lo dà per altri motivi non si scarica niente
async function leggiRobots(origine) {
    let res;
    try {
        res = await richiesta(`${origine}/robots.txt`);
    } catch (e) {
        throw new Error(`robots.txt di ${origine} non raggiungibile (${e.message}): per rispetto il bot non scarica niente`);
    }
    if (res.ok) return regoleRobots(await res.text());
    if (res.status >= 400 && res.status < 500) return [];
    throw new Error(`${descriviErrore(`${origine}/robots.txt`, res, await res.text())} Senza robots.txt il bot non scarica niente.`);
}

async function scaricaPagina(url) {
    const indirizzo = new URL(url);
    if (!robotsPerSito.has(indirizzo.origin)) robotsPerSito.set(indirizzo.origin, leggiRobots(indirizzo.origin));
    const regole = await robotsPerSito.get(indirizzo.origin);
    if (!permesso(regole, indirizzo.pathname + indirizzo.search)) {
        throw new Error(`il robots.txt di ${indirizzo.host} chiede ai programmi di non leggere ${indirizzo.pathname}: il bot non scarica questa pagina`);
    }
    const res = await richiesta(url);
    const testo = await res.text();
    if (!res.ok) throw new Error(descriviErrore(url, res, testo));
    return testo;
}

module.exports = { INTESTAZIONI, PAUSA_MS, descriviErrore, regoleRobots, permesso, scaricaPagina };
