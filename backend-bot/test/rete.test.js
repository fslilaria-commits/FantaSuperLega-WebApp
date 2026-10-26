const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { INTESTAZIONI, descriviErrore, regoleRobots, permesso, scaricaPagina, configura } = require('../lib/rete');

const risposta = (status, headers) => ({ status, headers: new Headers(headers) });

// Un sito finto in locale: pagine = { percorso: [stato, intestazioni, testo] }; richieste: i percorsi chiesti
function sitoFinto(pagine) {
    const richieste = [];
    const server = http.createServer((req, res) => {
        richieste.push(req.url);
        const [stato, intestazioni, testo] = pagine[req.url] || [404, {}, 'non trovata'];
        res.writeHead(stato, intestazioni);
        res.end(testo);
    });
    return new Promise(pronto => server.listen(0, '127.0.0.1', () => {
        configura({ pausa: 0 });
        pronto({ base: `http://127.0.0.1:${server.address().port}`, richieste, chiudi: () => server.close() });
    }));
}
const ROBOTS = [200, { 'Content-Type': 'text/plain' }, 'User-agent: *\nDisallow: /statistiche/\n'];

test('una pagina vietata dal robots.txt non viene nemmeno chiesta', async () => {
    const sito = await sitoFinto({ '/robots.txt': ROBOTS, '/match/1': [200, {}, 'partita'] });
    try {
        assert.equal(await scaricaPagina(`${sito.base}/match/1`), 'partita');
        await assert.rejects(scaricaPagina(`${sito.base}/statistiche/?TipoStat=1.1`), /robots\.txt .* non leggere \/statistiche\//);
        assert.deepEqual(sito.richieste, ['/robots.txt', '/match/1'], 'robots.txt letto una volta, statistiche mai');
    } finally { sito.chiudi(); }
});

test('un reindirizzamento verso una pagina vietata viene fermato prima di seguirlo', async () => {
    const sito = await sitoFinto({
        '/robots.txt': ROBOTS,
        '/match/1': [302, { Location: '/statistiche/segreta' }, ''],
        '/match/2': [301, { Location: '/match/3' }, ''],
        '/match/3': [200, {}, 'partita 3'],
    });
    try {
        await assert.rejects(scaricaPagina(`${sito.base}/match/1`), /non leggere \/statistiche\//);
        assert.equal(await scaricaPagina(`${sito.base}/match/2`), 'partita 3', 'un reindirizzamento permesso si segue');
        assert.ok(!sito.richieste.includes('/statistiche/segreta'));
    } finally { sito.chiudi(); }
});

test('robots.txt rifiutato o in errore: il bot non scarica niente; assente: tutto permesso', async () => {
    for (const stato of [401, 403, 429, 500, 503]) {
        const sito = await sitoFinto({ '/robots.txt': [stato, {}, 'no'], '/match/1': [200, {}, 'partita'] });
        try {
            await assert.rejects(scaricaPagina(`${sito.base}/match/1`), /Senza robots\.txt il bot non scarica niente/, `robots.txt con HTTP ${stato}`);
            assert.deepEqual(sito.richieste, ['/robots.txt']);
        } finally { sito.chiudi(); }
    }
    const verifica = await sitoFinto({ '/robots.txt': [404, { 'cf-mitigated': 'challenge' }, 'Just a moment...'], '/match/1': [200, {}, 'partita'] });
    try {
        await assert.rejects(scaricaPagina(`${verifica.base}/match/1`), /Senza robots\.txt/, 'verifica di Cloudflare sul robots.txt');
    } finally { verifica.chiudi(); }
    const senza = await sitoFinto({ '/match/1': [200, {}, 'partita'] });
    try {
        assert.equal(await scaricaPagina(`${senza.base}/match/1`), 'partita');
    } finally { senza.chiudi(); }
});

test('robots.txt: a capo con il solo CR, altre righe dentro un gruppo, nome con la versione', () => {
    assert.equal(permesso(regoleRobots('User-agent: *\rDisallow: /statistiche/\r'), '/statistiche/x'), false);
    const conCrawlDelay = regoleRobots('User-agent: FantaSuperLega-bot\nCrawl-delay: 5\nUser-agent: *\nDisallow: /statistiche/\n');
    assert.equal(permesso(conCrawlDelay, '/statistiche/x'), false, 'Crawl-delay non spezza il gruppo');
    assert.equal(permesso(regoleRobots('User-agent: FantaSuperLega-bot/1.0\nDisallow: /team/\n'), '/team/1'), false);
});

test('una pagina bloccata da Cloudflare lo dice nel messaggio', () => {
    const msg = descriviErrore('https://www.legavolley.it/team/6863',
        risposta(403, { server: 'cloudflare', 'cf-mitigated': 'challenge', 'cf-ray': 'abc-FRA' }),
        '<html><head><title>Just a\n moment...</title></head></html>');
    assert.match(msg, /^HTTP 403 per https:\/\/www\.legavolley\.it\/team\/6863/);
    assert.match(msg, /cf-mitigated challenge/);
    assert.match(msg, /cf-ray abc-FRA/);
    assert.match(msg, /pagina «Just a moment\.\.\.»/);
    assert.match(msg, /Cloudflare ha rifiutato la richiesta/);
});

test('un errore del sito senza Cloudflare resta un errore normale', () => {
    const msg = descriviErrore('https://www.legavolley.it/x', risposta(500, { server: 'Microsoft-IIS/10.0' }), '');
    assert.equal(msg, 'HTTP 500 per https://www.legavolley.it/x (server Microsoft-IIS/10.0).');
    assert.equal(descriviErrore('u', risposta(404, {}), 'niente titolo'), 'HTTP 404 per u.');
});

// Il robots.txt di legavolley.it com'era il 26/10/2026
const ROBOTS_LEGA = `User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /statistiche/
Disallow: /rendimento/
Disallow: /pillole/
Disallow: /confronti/
Disallow: /matchdaily
`;

test('robots.txt della Lega: niente statistiche, sì rose, calendario e partite', () => {
    const regole = regoleRobots(ROBOTS_LEGA);
    assert.equal(permesso(regole, '/statistiche/?TipoStat=1.1&Serie=1&AnnoInizio=2026'), false);
    assert.equal(permesso(regole, '/matchdaily'), false);
    assert.equal(permesso(regole, '/wp-admin/opzioni'), false);
    assert.equal(permesso(regole, '/wp-admin/admin-ajax.php'), true, 'Allow più lungo vince');
    assert.equal(permesso(regole, '/team/6862'), true);
    assert.equal(permesso(regole, '/calendario/?Anno=2026&IdCampionato=999&IdFase=1&IdSquadra=0'), true);
    assert.equal(permesso(regole, '/match/40285'), true, '/matchdaily non vieta /match/');
});

test('robots.txt: un gruppo con il nome del bot vale al posto di quello generale; * e $', () => {
    const regole = regoleRobots('User-agent: *\nDisallow:\n\nUser-agent: Altro\nUser-agent: FantaSuperLega-bot\nDisallow: /team/\nDisallow: /*.pdf$\n');
    assert.equal(permesso(regole, '/team/1'), false);
    assert.equal(permesso(regole, '/doc/regole.pdf'), false);
    assert.equal(permesso(regole, '/doc/regole.pdf?x=1'), true, '$ vuol dire fine del percorso');
    assert.equal(permesso(regole, '/calendario/'), true);
    assert.deepEqual(regoleRobots('User-agent: *\nDisallow:\n'), [{ permesso: false, schema: '' }]);
    assert.equal(permesso(regoleRobots('User-agent: *\nDisallow:\n'), '/qualsiasi'), true, 'Disallow vuoto non vieta niente');
    assert.equal(permesso(regoleRobots(''), '/qualsiasi'), true);
});

test('il bot si presenta per quello che è, in italiano', () => {
    assert.match(INTESTAZIONI['User-Agent'], /^FantaSuperLega-bot\/\d/);
    assert.match(INTESTAZIONI['User-Agent'], /github\.com\/fslilaria-commits\/FantaSuperLega-WebApp/);
    assert.doesNotMatch(INTESTAZIONI['User-Agent'], /Chrome|Mozilla/);
    assert.match(INTESTAZIONI['Accept-Language'], /^it-IT/);
    assert.ok(INTESTAZIONI.Accept.startsWith('text/html'));
});
