const { test } = require('node:test');
const assert = require('node:assert/strict');
const { INTESTAZIONI, descriviErrore, regoleRobots, permesso } = require('../lib/rete');

const risposta = (status, headers) => ({ status, headers: new Headers(headers) });

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
