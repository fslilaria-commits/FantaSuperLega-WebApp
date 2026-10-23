const { test } = require('node:test');
const assert = require('node:assert/strict');
const { INTESTAZIONI, descriviErrore } = require('../lib/rete');

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

test('le richieste si presentano come un browser in italiano', () => {
    assert.match(INTESTAZIONI['User-Agent'], /Chrome\/\d+/);
    assert.match(INTESTAZIONI['Accept-Language'], /^it-IT/);
    assert.ok(INTESTAZIONI.Accept.startsWith('text/html'));
});
