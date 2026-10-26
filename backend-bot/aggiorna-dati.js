// Aggiornamento dei dati sul PC del bot (docs/bot-pc.md), lanciato ogni sera dall'attività pianificata di Windows.
// Fa quello che faceva il workflow di GitHub, i cui server il sito della Lega blocca:
// 1. allinea la cartella a GitHub: è una copia della repo solo per il bot, quindi gli avanzi di data/ dell'ultima
//    volta si buttano (si riscaricano adesso) e una modifica a mano fuori da data/ lo ferma;
// 2. installa le dipendenze, solo se sono cambiate;
// 3. prepara la stagione e scarica listone, calendario e tabellini; i tre scaricamenti sono indipendenti;
// 4. scrive in data/bot.json se qualcosa non è andato, così gli admin lo vedono nel sito;
// 5. se data/ è cambiata, fa il commit della sola data/ e lo manda su GitHub.
// Il registro è in %LOCALAPPDATA%\FantaSuperLega-bot\aggiorna-dati.log. Con --prova non fa né commit né push.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { haCredenziali, pulisciErrore, statoBot, descriviModifiche } = require('./lib/aggiornamento');

const RADICE = path.join(__dirname, '..');
const BOT = __dirname;
const FILE_STATO = path.join(RADICE, 'data', 'bot.json');
const PROVA = process.argv.includes('--prova');
const CARTELLA_REGISTRO = process.env.FSL_REGISTRO || path.join(process.env.LOCALAPPDATA || os.homedir(), 'FantaSuperLega-bot');
const REGISTRO = path.join(CARTELLA_REGISTRO, 'aggiorna-dati.log');
const MAX_REGISTRO = 1024 * 1024;
const TENTATIVI_RETE = 5;

const aspetta = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function scrivi(testo) {
    const righe = String(testo).replace(/\s+$/, '');
    if (!righe) return;
    console.log(righe);
    const ora = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
    fs.appendFileSync(REGISTRO, righe.split(/\r?\n/).map(r => `${ora}  ${r}`).join('\n') + '\n');
}

// Lancia un programma e ne mette l'uscita nel registro. npm su Windows è uno script e va lanciato con la shell,
// come comando unico (argomenti fissi, scritti qui)
function esegui(comando, argomenti, { cwd = RADICE, silenzioso = false } = {}) {
    const opzioni = { cwd, encoding: 'utf8', windowsHide: true };
    const r = comando === 'npm'
        ? spawnSync(['npm', ...argomenti].join(' '), { ...opzioni, shell: true })
        : spawnSync(comando, argomenti, opzioni);
    const uscita = `${r.stdout || ''}${r.stderr || ''}${r.error ? r.error.message : ''}`;
    if (!silenzioso) scrivi(uscita);
    return { ok: r.status === 0, uscita };
}

const git = (...argomenti) => esegui('git', argomenti, { silenzioso: true });

function ferma(motivo) {
    throw new Error(motivo);
}

// 1. La cartella com'è su GitHub
function allineaAGitHub() {
    const origine = git('remote', 'get-url', 'origin').uscita.trim();
    if (haCredenziali(origine)) ferma('l\'indirizzo della repo contiene una chiave: toglila (git remote set-url origin https://github.com/fslilaria-commits/FantaSuperLega-WebApp) e lasciala alla Gestione credenziali di Windows');
    if (!PROVA && !git('config', 'user.email').uscita.trim()) ferma('manca chi firma i commit: rilancia installa-bot.ps1 con -Email (docs/bot-pc.md)');
    const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').uscita.trim();
    if (ramo !== 'main') ferma(`la cartella del bot è sul ramo ${ramo}, non su main`);
    const aMano = git('status', '--porcelain').uscita.split('\n').filter(r => r.trim() && !r.slice(3).startsWith('data/'));
    if (aMano.length) ferma(`nella cartella del bot ci sono modifiche a mano fuori da data/ (${aMano.map(r => r.slice(3)).join(', ')}): questa cartella serve solo al bot`);
    // Appena acceso, il PC può non avere ancora la rete: si riprova qualche volta prima di arrendersi
    let fetch = git('fetch', '--quiet', 'origin', 'main');
    for (let tentativo = 1; !fetch.ok && tentativo < TENTATIVI_RETE; tentativo++) {
        scrivi(`GitHub non risponde, riprovo tra un minuto (${tentativo}/${TENTATIVI_RETE - 1})…`);
        aspetta(60 * 1000);
        fetch = git('fetch', '--quiet', 'origin', 'main');
    }
    if (!fetch.ok) ferma(`GitHub non risponde: ${pulisciErrore(fetch.uscita)}`);
    // Commit non ancora su GitHub: quelli del bot (solo data/) si buttano e si rifanno adesso, gli altri fermano tutto
    const nonInviati = git('log', 'origin/main..HEAD', '--name-only', '--format=').uscita.split('\n').map(r => r.trim()).filter(Boolean);
    const estranei = [...new Set(nonInviati.filter(f => !f.startsWith('data/')))];
    if (estranei.length) ferma(`nella cartella del bot ci sono commit non inviati che toccano altro oltre data/ (${estranei.join(', ')})`);
    git('reset', '--quiet', '--hard', 'origin/main');
    git('clean', '-fdq', '--', 'data/');
    scrivi(`Cartella allineata a GitHub (${git('log', '-1', '--format=%h %s').uscita.trim()})`);
}

// 2. Dipendenze, solo se il package-lock è cambiato dall'ultima installazione
function installaDipendenze() {
    const lock = fs.readFileSync(path.join(BOT, 'package-lock.json'));
    const impronta = crypto.createHash('sha256').update(lock).digest('hex');
    const segno = path.join(BOT, 'node_modules', '.fsl-installato');
    if (fs.existsSync(segno) && fs.readFileSync(segno, 'utf8') === impronta) return;
    scrivi('Installo le dipendenze del bot…');
    if (!esegui('npm', ['ci', '--no-audit', '--no-fund'], { cwd: BOT }).ok) ferma('installazione delle dipendenze non riuscita (npm ci)');
    fs.writeFileSync(segno, impronta);
}

// 3. I passi del bot, come nel workflow: senza stagione non si scarica niente
function scaricaDati() {
    const errori = [];
    const passo = (nome, script) => {
        scrivi(`— ${nome}`);
        const r = esegui(process.execPath, [script], { cwd: BOT });
        if (!r.ok) errori.push(`${nome}: ${pulisciErrore(r.uscita)}`);
        return r.ok;
    };
    if (passo('stagione', 'prepara-stagione.js')) {
        passo('listone', 'genera-listone.js');
        passo('calendario', 'genera-calendario.js');
        passo('tabellini', 'genera-tabellini.js');
    }
    return errori;
}

// 4. Lo stato del bot per il sito: cambia solo quando cambiano esito o errori
function aggiornaStato(errori) {
    let precedente = null;
    try { precedente = JSON.parse(fs.readFileSync(FILE_STATO, 'utf8')); } catch { /* prima volta */ }
    const testo = JSON.stringify(statoBot(precedente, errori), null, 2) + '\n';
    if (!precedente || JSON.stringify(precedente, null, 2) + '\n' !== testo) fs.writeFileSync(FILE_STATO, testo);
}

// 5. Commit della sola data/ e invio a GitHub; se nel frattempo è arrivato altro, si rimette in coda e si riprova
function salvaSuGitHub() {
    // Si guarda che cosa entrerebbe davvero nel commit: con gli a capo di Windows git status può segnare come
    // cambiati file che hanno lo stesso contenuto
    git('add', '--', 'data/');
    const cambiati = git('diff', '--cached', '--name-only', '--', 'data/').uscita.split('\n').map(r => r.trim()).filter(Boolean);
    if (!cambiati.length) return scrivi('Nessuna novità nei dati della Lega.');
    const messaggio = descriviModifiche(cambiati);
    if (PROVA) {
        git('reset', '--quiet');
        return scrivi(`Prova: ${cambiati.length} file cambiati in data/, non salvo su GitHub («${messaggio}»)`);
    }
    if (!git('commit', '--quiet', '-m', messaggio).ok) ferma('commit dei dati non riuscito');
    let invio = git('push', '--quiet', 'origin', 'HEAD:main');
    if (!invio.ok && git('pull', '--quiet', '--rebase', 'origin', 'main').ok) invio = git('push', '--quiet', 'origin', 'HEAD:main');
    if (!invio.ok) {
        git('rebase', '--abort');
        ferma(`GitHub non ha accettato i dati: ${pulisciErrore(invio.uscita)} (si riprova al prossimo giro)`);
    }
    scrivi(`Salvato su GitHub: ${messaggio}`);
}

function main() {
    fs.mkdirSync(CARTELLA_REGISTRO, { recursive: true });
    if (fs.existsSync(REGISTRO) && fs.statSync(REGISTRO).size > MAX_REGISTRO) fs.renameSync(REGISTRO, `${REGISTRO}.vecchio`);
    scrivi(`=== Aggiornamento dei dati${PROVA ? ' (prova: niente commit né push)' : ''}`);
    try {
        if (Number(process.versions.node.split('.')[0]) < 20) ferma(`serve Node.js 20 o più recente (c'è il ${process.version})`);
        allineaAGitHub();
        installaDipendenze();
        const errori = scaricaDati();
        aggiornaStato(errori);
        salvaSuGitHub();
        scrivi(errori.length ? `❌ Finito con ${errori.length} problemi:\n- ${errori.join('\n- ')}` : '✅ Finito, tutto a posto.');
        process.exitCode = errori.length ? 1 : 0;
    } catch (e) {
        scrivi(`❌ Fermato: ${e.message}`);
        process.exitCode = 1;
    }
}

main();
