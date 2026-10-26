// Scaricamento delle pagine del sito della Lega, uguale per stagione, listone, calendario e tabellini.
// Il bot si comporta come un visitatore educato:
// - legge il robots.txt del sito e non scarica le pagine che il sito chiede ai programmi di non leggere
//   (per esempio /statistiche/ di legavolley.it), nemmeno quando ci arriverebbe da un reindirizzamento;
// - si presenta per quello che è (nome e indirizzo del progetto);
// - lascia almeno un secondo tra la fine di una pagina e l'inizio della successiva.
// Se il sito rifiuta una pagina (per esempio Cloudflare), l'errore dice chi l'ha bloccata e il bot si ferma:
// non prova ad aggirare il blocco.
const NOME_BOT = 'FantaSuperLega-bot';
const INTESTAZIONI = {
    'User-Agent': `${NOME_BOT}/1.0 (+https://github.com/fslilaria-commits/FantaSuperLega-WebApp)`,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
};
const PAUSA_MS = 1000;
const TEMPO_MASSIMO_MS = 60 * 1000; // una pagina che non arriva in un minuto è un errore, non un'attesa infinita
const MAX_REINDIRIZZAMENTI = 5;

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
    const spiegazione = bloccataDaCloudflare(res) && [403, 429, 503].includes(res.status)
        ? ' Cloudflare ha rifiutato la richiesta: il sito non accetta programmi automatici da questa rete. Il bot si ferma e non prova ad aggirare il blocco.'
        : '';
    return `HTTP ${res.status} per ${url}${dettagli.length ? ` (${dettagli.join(', ')})` : ''}.${spiegazione}`;
}

const bloccataDaCloudflare = res => /cloudflare/i.test(res.headers.get('server') || '') || res.headers.get('cf-mitigated') != null;

// --- robots.txt (RFC 9309) ---

// Le regole che valgono per il bot: quelle dei gruppi con il suo nome, se ci sono, altrimenti quelle di "*".
// Un gruppo sono una o più righe User-agent seguite dalle sue regole; le altre righe (Crawl-delay, Sitemap…) non
// lo interrompono. Del nome conta solo la parte prima di "/" (FantaSuperLega-bot/1.0 = FantaSuperLega-bot)
function regoleRobots(testo, nome = NOME_BOT) {
    const gruppi = [];
    let gruppo = null;
    for (const grezza of String(testo || '').split(/\r\n|\r|\n/)) {
        const m = grezza.replace(/#.*/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const campo = m[1].toLowerCase();
        const valore = m[2].trim();
        if (campo === 'user-agent') {
            if (!gruppo || gruppo.regole.length) gruppi.push(gruppo = { agenti: [], regole: [] });
            gruppo.agenti.push(valore.split('/')[0].trim().toLowerCase());
        } else if (gruppo && (campo === 'allow' || campo === 'disallow')) {
            gruppo.regole.push({ permesso: campo === 'allow', schema: valore });
        }
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

// --- Richieste ---

const impostazioni = { pausa: PAUSA_MS };
let ultimaRisposta = Date.now(); // anche la prima pagina di ogni passo aspetta: i passi del bot partono uno dopo l'altro
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const robotsPerSito = new Map(); // origine -> Promise delle regole, una lettura per sito a ogni passo

// Una richiesta senza seguire i reindirizzamenti (li controlla scaricaPagina), con pausa e tempo massimo
async function richiesta(url) {
    const attesa = ultimaRisposta + impostazioni.pausa - Date.now();
    if (attesa > 0) await aspetta(attesa);
    try {
        const res = await fetch(url, { headers: INTESTAZIONI, redirect: 'manual', signal: AbortSignal.timeout(TEMPO_MASSIMO_MS) });
        const testo = await res.text();
        return { res, testo };
    } catch (e) {
        throw new Error(e.name === 'TimeoutError' ? `${url} non ha risposto entro ${TEMPO_MASSIMO_MS / 1000} secondi` : `${url} non raggiungibile (${e.message})`);
    } finally {
        ultimaRisposta = Date.now();
    }
}

// Le regole del robots.txt di un sito. Senza robots.txt (404, 410 e simili) è tutto permesso; se il sito lo rifiuta
// (401, 403, 429, Cloudflare), non risponde o dà un errore, il bot non scarica niente da quel sito
// (i reindirizzamenti del robots.txt si seguono, come dice la RFC)
async function leggiRobots(origine) {
    let url = `${origine}/robots.txt`;
    for (let passo = 0; passo <= MAX_REINDIRIZZAMENTI; passo++) {
        const { res, testo } = await richiesta(url).catch(e => { throw new Error(`${e.message}: senza robots.txt il bot non scarica niente da ${origine}`); });
        const verso = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && verso) {
            url = new URL(verso, url).href;
            continue;
        }
        if (res.ok) return regoleRobots(testo);
        const rifiutato = [401, 403, 429].includes(res.status) || res.headers.get('cf-mitigated') != null || res.status < 400 || res.status >= 500;
        if (!rifiutato) return [];
        throw new Error(`${descriviErrore(url, res, testo)} Senza robots.txt il bot non scarica niente da ${origine}.`);
    }
    throw new Error(`robots.txt di ${origine}: troppi reindirizzamenti, il bot non scarica niente da questo sito`);
}

async function controllaRobots(indirizzo) {
    if (!robotsPerSito.has(indirizzo.origin)) robotsPerSito.set(indirizzo.origin, leggiRobots(indirizzo.origin));
    const regole = await robotsPerSito.get(indirizzo.origin);
    if (!permesso(regole, indirizzo.pathname + indirizzo.search)) {
        throw new Error(`il robots.txt di ${indirizzo.host} chiede ai programmi di non leggere ${indirizzo.pathname}: il bot non scarica questa pagina`);
    }
}

async function scaricaPagina(url) {
    let indirizzo = new URL(url);
    for (let passo = 0; passo <= MAX_REINDIRIZZAMENTI; passo++) {
        await controllaRobots(indirizzo); // anche per ogni pagina a cui porta un reindirizzamento
        const { res, testo } = await richiesta(indirizzo.href);
        const verso = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && verso) {
            indirizzo = new URL(verso, indirizzo);
            continue;
        }
        if (!res.ok) throw new Error(descriviErrore(indirizzo.href, res, testo));
        return testo;
    }
    throw new Error(`${url}: più di ${MAX_REINDIRIZZAMENTI} reindirizzamenti`);
}

// Solo per i test: pausa più corta e robots.txt da rileggere
function configura({ pausa = PAUSA_MS } = {}) {
    impostazioni.pausa = pausa;
    robotsPerSito.clear();
}

module.exports = { INTESTAZIONI, PAUSA_MS, descriviErrore, regoleRobots, permesso, scaricaPagina, configura };
