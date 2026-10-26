const { test } = require('node:test');
const assert = require('node:assert/strict');
const { haCredenziali, pulisciErrore, statoBot, percorsiDaStatus, descriviModifiche } = require('../lib/aggiornamento');

test('un indirizzo della repo con dentro utente o chiave viene riconosciuto', () => {
    assert.equal(haCredenziali('https://github.com/fslilaria-commits/FantaSuperLega-WebApp'), false);
    assert.equal(haCredenziali('https://ghp_abc123@github.com/fslilaria-commits/FantaSuperLega-WebApp'), true);
    assert.equal(haCredenziali('https://utente:chiave@github.com/x/y.git'), true);
    assert.equal(haCredenziali('git@github.com:fslilaria-commits/FantaSuperLega-WebApp.git'), false, 'ssh: la chiave è un file a parte');
});

test('dell\'errore di un passo resta il messaggio, su una riga e senza cf-ray', () => {
    const uscita = 'Allianz Milano   14 giocatori\n❌ proposta scartata, niente è stato scritto:\n- Itas Trentino: solo 3 giocatori\n';
    assert.equal(pulisciErrore(uscita), 'proposta scartata, niente è stato scritto: - Itas Trentino: solo 3 giocatori');
    const cloudflare = '❌ calendario fase 1: HTTP 403 per https://www.legavolley.it/calendario/ (server cloudflare, cf-mitigated challenge, cf-ray 8f1e-FRA, pagina «Just a moment...»).';
    assert.equal(pulisciErrore(cloudflare), 'calendario fase 1: HTTP 403 per https://www.legavolley.it/calendario/ (server cloudflare, cf-mitigated challenge, pagina «Just a moment...»).');
    assert.equal(pulisciErrore('fatal: unable to access\n'), 'fatal: unable to access');
    assert.equal(pulisciErrore(''), 'errore senza messaggio');
});

test('lo stato del bot cambia solo quando cambia la situazione', () => {
    const lunedi = new Date('2026-10-26T19:30:00Z');
    const martedi = new Date('2026-10-27T19:30:00Z');
    const ok = statoBot(null, [], lunedi);
    assert.deepEqual(ok, { esito: 'ok', dal: '2026-10-26T19:30:00.000Z' });
    assert.deepEqual(statoBot(ok, [], martedi), ok, 'un altro giorno senza problemi non cambia niente');
    const errore = statoBot(ok, ['listone: HTTP 500'], martedi);
    assert.deepEqual(errore, { esito: 'errore', dal: '2026-10-27T19:30:00.000Z', errori: ['listone: HTTP 500'] });
    assert.deepEqual(statoBot(errore, ['listone: HTTP 500'], new Date('2026-10-28T19:30:00Z')), errore, 'lo stesso errore il giorno dopo');
    const altro = statoBot(errore, ['calendario: HTTP 500'], new Date('2026-10-29T19:30:00Z'));
    assert.equal(altro.dal, errore.dal, 'un errore diverso: il bot non riesce sempre dal primo giorno');
    assert.deepEqual(altro.errori, ['calendario: HTTP 500']);
    assert.deepEqual(statoBot(errore, [], martedi), { esito: 'ok', dal: martedi.toISOString() });
});

test('nei messaggi pubblici non finiscono i percorsi del PC né il nome dell\'utente', () => {
    const errore = "❌ EPERM: operation not permitted, open 'C:\\Users\\mario.rossi\\FantaSuperLega-bot\\data\\players.json'";
    assert.equal(pulisciErrore(errore, ['C:\\Users\\mario.rossi\\FantaSuperLega-bot']), "EPERM: operation not permitted, open '…\\data\\players.json'");
    assert.equal(pulisciErrore("❌ errore in c:/users/MARIO.ROSSI/FantaSuperLega-bot/x", ['C:\\Users\\mario.rossi\\FantaSuperLega-bot']), 'errore in …/x');
    assert.equal(pulisciErrore("❌ non trovo C:\\Users\\anna\\Desktop\\file.txt"), 'non trovo …\\Desktop\\file.txt', 'anche senza sapere la cartella');
});

test('i file toccati da git status -z, spostamenti compresi', () => {
    const uscita = ' M data/players.json\0?? data/tabellini/2.json\0R  src/a.js\0data/a.js\0';
    assert.deepEqual(percorsiDaStatus(uscita), ['data/players.json', 'data/tabellini/2.json', 'src/a.js', 'data/a.js']);
    assert.deepEqual(percorsiDaStatus(''), []);
});

test('il messaggio del commit dice che cosa è cambiato', () => {
    assert.equal(descriviModifiche(['data/tabellini/2.json', 'data/tabellini/index.json', 'data/calendario.json']),
        'Dati aggiornati dal sito della Lega (calendario, tabellini 2)');
    assert.equal(descriviModifiche(['data/players.json', 'data/tabellini/11.json', 'data/tabellini/3.json', 'data/bot.json']),
        'Dati aggiornati dal sito della Lega (listone, stato del bot, tabellini 3, 11)');
    assert.equal(descriviModifiche(['data/stagione.json', 'data/tabellini/1.json']), 'Dati aggiornati dal sito della Lega (stagione, tabellini 1)');
    assert.equal(descriviModifiche([]), 'Dati aggiornati dal sito della Lega');
});
