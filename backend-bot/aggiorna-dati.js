// Aggiornamento dei dati sul PC del bot (docs/bot-pc.md), lanciato ogni sera dall'attività pianificata di Windows.
// Fa quello che faceva il workflow di GitHub, i cui server il sito della Lega blocca:
// 1. allinea la cartella a GitHub: è una copia della repo solo per il bot (installa-bot.ps1 la segna con
//    fsl.cartellaBot, e senza quel segno il bot non parte), quindi gli avanzi di data/ dell'ultima volta si buttano
//    (si riscaricano adesso) e una modifica a mano fuori da data/ lo ferma;
// 2. installa le dipendenze, solo se sono cambiate e senza lanciarne gli script;
// 3. prepara la stagione e scarica listone, calendario e tabellini; i tre scaricamenti sono indipendenti;
// 4. scrive in data/bot.json se qualcosa non è andato, così gli admin lo vedono nel sito;
// 5. se data/ è cambiata, fa il commit della sola data/ e lo manda su GitHub.
// Il registro è in %LOCALAPPDATA%\FantaSuperLega-bot\aggiorna-dati.log. Con --prova non fa né commit né push e
// alla fine rimette data/ com'era.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { haCredenziali, pulisciErrore, statoBot, percorsiDaStatus, descriviModifiche } = require('./lib/aggiornamento');

const RADICE = path.join(__dirname, '..');
const BOT = __dirname;
const FILE_STATO = path.join(RADICE, 'data', 'bot.json');
const BLOCCO_GIT = path.join(RADICE, '.git', 'index.lock');
const PROVA = process.argv.includes('--prova');
const CARTELLA_REGISTRO = process.env.FSL_REGISTRO || path.join(process.env.LOCALAPPDATA || os.homedir(), 'FantaSuperLega-bot');
const REGISTRO = path.join(CARTELLA_REGISTRO, 'aggiorna-dati.log');
const IN_CORSO = path.join(CARTELLA_REGISTRO, 'aggiorna-dati.lock');
const MAX_REGISTRO = 1024 * 1024;
const TENTATIVI_RETE = 5;
const MINUTO = 60 * 1000;
// Tempi massimi: un comando che resta appeso non deve tenere fermo il bot fino al limite dell'attività pianificata
const TEMPO = { git: 5 * MINUTO, npm: 10 * MINUTO, passo: 15 * MINUTO };
// Git non deve mai chiedere niente: senza nessuno davanti al PC resterebbe in attesa
const AMBIENTE_GIT = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
const PERCORSI_DEL_PC = [RADICE, os.homedir()];

const aspetta = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const errore = testo => pulisciErrore(testo, PERCORSI_DEL_PC);

function scrivi(testo) {
    const righe = String(testo).replace(/\s+$/, '');
    if (!righe) return;
    console.log(righe);
    const ora = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
    fs.appendFileSync(REGISTRO, righe.split(/\r?\n/).map(r => `${ora}  ${r}`).join('\n') + '\n');
}

// Lancia un programma e ne mette l'uscita nel registro. npm su Windows è uno script e va lanciato con la shell,
// come comando unico (argomenti fissi, scritti qui)
function esegui(comando, argomenti, { cwd = RADICE, silenzioso = false, tempo = TEMPO.passo, env = process.env } = {}) {
    const opzioni = { cwd, encoding: 'utf8', windowsHide: true, timeout: tempo, env, maxBuffer: 64 * 1024 * 1024 };
    const r = comando === 'npm'
        ? spawnSync(['npm', ...argomenti].join(' '), { ...opzioni, shell: true })
        : spawnSync(comando, argomenti, opzioni);
    const scaduto = r.error?.code === 'ETIMEDOUT' ? `\nfermato dopo ${Math.round(tempo / MINUTO)} minuti senza risposta` : '';
    const uscita = `${r.stdout || ''}${r.stderr || ''}${r.error && !scaduto ? r.error.message : ''}${scaduto}`;
    if (!silenzioso) scrivi(uscita);
    return { ok: r.status === 0, uscita };
}

const git = (...argomenti) => esegui('git', argomenti, { silenzioso: true, tempo: TEMPO.git, env: AMBIENTE_GIT });

function ferma(motivo) {
    throw new Error(motivo);
}

// Un comando git che deve riuscire. Se lo blocca un index.lock rimasto da un'esecuzione interrotta (PC spento a
// metà, attività fermata), lo toglie e riprova: nessun altro aggiornamento è in corso, lo garantisce IN_CORSO
function gitObbligatorio(...argomenti) {
    let r = git(...argomenti);
    if (!r.ok && fs.existsSync(BLOCCO_GIT)) {
        scrivi('Trovato un blocco di git rimasto da un\'esecuzione interrotta (.git/index.lock): lo tolgo e riprovo.');
        fs.rmSync(BLOCCO_GIT, { force: true });
        r = git(...argomenti);
    }
    if (!r.ok) ferma(`git ${argomenti[0]} non riuscito: ${errore(r.uscita)}`);
    return r;
}

// Un solo aggiornamento alla volta, anche quando uno parte a mano mentre gira quello pianificato
function prendiTurno() {
    try {
        fs.writeFileSync(IN_CORSO, JSON.stringify({ pid: process.pid, dal: new Date().toISOString() }), { flag: 'wx' });
        return;
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
    let altro = null;
    try { altro = JSON.parse(fs.readFileSync(IN_CORSO, 'utf8')); } catch { /* file rovinato: si riprende il turno */ }
    let vivo = false;
    try { vivo = !!altro?.pid && process.kill(altro.pid, 0); } catch { /* processo finito */ }
    if (vivo && Date.now() - new Date(altro.dal).getTime() < 2 * 60 * MINUTO) {
        ferma(`un altro aggiornamento è già in corso (processo ${altro.pid}, dal ${new Date(altro.dal).toLocaleString('it-IT')}): riprova quando ha finito`);
    }
    fs.writeFileSync(IN_CORSO, JSON.stringify({ pid: process.pid, dal: new Date().toISOString() }));
}

let cartellaDelBot = false; // solo nella cartella segnata da installa-bot.ps1 si tocca data/

// 1. La cartella com'è su GitHub
function allineaAGitHub() {
    if (git('config', '--get', 'fsl.cartellaBot').uscita.trim() !== 'true') {
        ferma('questa non è la cartella del bot: il bot butta via le modifiche in data/, quindi gira solo in una copia della repo preparata da installa-bot.ps1 (docs/bot-pc.md)');
    }
    cartellaDelBot = true;
    const origine = git('remote', 'get-url', 'origin').uscita.trim();
    if (haCredenziali(origine)) ferma('l\'indirizzo della repo contiene una chiave: toglila (git remote set-url origin https://github.com/fslilaria-commits/FantaSuperLega-WebApp) e lasciala alla Gestione credenziali di Windows');
    if (!PROVA && !git('config', 'user.email').uscita.trim()) ferma('manca chi firma i commit: rilancia installa-bot.ps1 con -Email (docs/bot-pc.md)');
    const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').uscita.trim();
    if (ramo !== 'main') ferma(`la cartella del bot è sul ramo ${ramo}, non su main`);
    const aMano = percorsiDaStatus(gitObbligatorio('status', '--porcelain', '-z').uscita).filter(f => !f.startsWith('data/'));
    if (aMano.length) ferma(`nella cartella del bot ci sono modifiche a mano fuori da data/ (${aMano.join(', ')}): questa cartella serve solo al bot`);
    // Appena acceso, il PC può non avere ancora la rete: si riprova qualche volta prima di arrendersi
    let fetch = git('fetch', '--quiet', 'origin', 'main');
    for (let tentativo = 1; !fetch.ok && tentativo < TENTATIVI_RETE; tentativo++) {
        scrivi(`GitHub non risponde, riprovo tra un minuto (${tentativo}/${TENTATIVI_RETE - 1})…`);
        aspetta(MINUTO);
        fetch = git('fetch', '--quiet', 'origin', 'main');
    }
    if (!fetch.ok) ferma(`GitHub non risponde: ${errore(fetch.uscita)}`);
    // Commit non ancora su GitHub: quelli del bot (solo data/) si buttano e si rifanno adesso, gli altri fermano tutto
    const nonInviati = git('log', 'origin/main..HEAD', '--name-only', '--format=').uscita.split('\n').map(r => r.trim()).filter(Boolean);
    const estranei = [...new Set(nonInviati.filter(f => !f.startsWith('data/')))];
    if (estranei.length) ferma(`nella cartella del bot ci sono commit non inviati che toccano altro oltre data/ (${estranei.join(', ')})`);
    gitObbligatorio('reset', '--quiet', '--hard', 'origin/main');
    gitObbligatorio('clean', '-fdq', '--', 'data/');
    scrivi(`Cartella allineata a GitHub (${git('log', '-1', '--format=%h %s').uscita.trim()})`);
}

// 2. Dipendenze, solo se il package-lock è cambiato dall'ultima installazione. Senza gli script delle dipendenze:
// il bot non ne ha bisogno, e così una dipendenza compromessa non esegue niente sul PC
function installaDipendenze() {
    const lock = fs.readFileSync(path.join(BOT, 'package-lock.json'));
    const impronta = crypto.createHash('sha256').update(lock).digest('hex');
    const segno = path.join(BOT, 'node_modules', '.fsl-installato');
    if (fs.existsSync(segno) && fs.readFileSync(segno, 'utf8') === impronta) return;
    scrivi('Installo le dipendenze del bot…');
    if (!esegui('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: BOT, tempo: TEMPO.npm }).ok) ferma('installazione delle dipendenze non riuscita (npm ci)');
    fs.writeFileSync(segno, impronta);
}

// 3. I passi del bot, come nel workflow: senza stagione non si scarica niente
function scaricaDati() {
    const errori = [];
    const passo = (nome, script) => {
        scrivi(`— ${nome}`);
        const r = esegui(process.execPath, [script], { cwd: BOT });
        if (!r.ok) errori.push(`${nome}: ${errore(r.uscita)}`);
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
    gitObbligatorio('add', '--', 'data/');
    const cambiati = gitObbligatorio('diff', '--cached', '--name-only', '--', 'data/').uscita.split('\n').map(r => r.trim()).filter(Boolean);
    if (!cambiati.length) return scrivi('Nessuna novità nei dati della Lega.');
    const messaggio = descriviModifiche(cambiati);
    if (PROVA) {
        gitObbligatorio('reset', '--quiet');
        return scrivi(`Prova: ${cambiati.length} file cambiati in data/, non salvo su GitHub («${messaggio}»)`);
    }
    gitObbligatorio('commit', '--quiet', '-m', messaggio);
    let invio = git('push', '--quiet', 'origin', 'HEAD:main');
    if (!invio.ok) {
        // Di solito vuol dire che su GitHub è arrivato altro nel frattempo: si mette in coda e si riprova una volta
        if (!git('pull', '--quiet', '--rebase', 'origin', 'main').ok) {
            git('rebase', '--abort');
            ferma('nel frattempo su GitHub sono cambiati gli stessi dati: si riprova al prossimo giro');
        }
        invio = git('push', '--quiet', 'origin', 'HEAD:main');
    }
    if (!invio.ok) ferma(`GitHub non ha accettato i dati: ${errore(invio.uscita)}. Se dice che serve l'accesso, rilancia installa-bot.ps1`);
    scrivi(`Salvato su GitHub: ${messaggio}`);
}

function main() {
    fs.mkdirSync(CARTELLA_REGISTRO, { recursive: true });
    if (fs.existsSync(REGISTRO) && fs.statSync(REGISTRO).size > MAX_REGISTRO) fs.renameSync(REGISTRO, `${REGISTRO}.vecchio`);
    scrivi(`=== Aggiornamento dei dati${PROVA ? ' (prova: niente commit né push)' : ''}`);
    let turno = false;
    try {
        if (Number(process.versions.node.split('.')[0]) < 20) ferma(`serve Node.js 20 o più recente (c'è il ${process.version})`);
        prendiTurno();
        turno = true;
        allineaAGitHub();
        installaDipendenze();
        const errori = scaricaDati();
        aggiornaStato(errori);
        salvaSuGitHub();
        scrivi(errori.length ? `❌ Finito con ${errori.length === 1 ? '1 problema' : `${errori.length} problemi`}:\n- ${errori.join('\n- ')}` : '✅ Finito, tutto a posto.');
        process.exitCode = errori.length ? 1 : 0;
    } catch (e) {
        scrivi(`❌ Fermato: ${e.message}`);
        process.exitCode = 1;
    } finally {
        // La prova non lascia niente: data/ torna com'è su GitHub
        if (PROVA && cartellaDelBot) {
            git('checkout', '--', 'data/');
            git('clean', '-fdq', '--', 'data/');
        }
        if (turno) fs.rmSync(IN_CORSO, { force: true });
    }
}

main();
