# Bot dei dati sul PC

Il sito della Lega sta dietro Cloudflare, che rifiuta le richieste dai server di GitHub: per questo il bot dei dati non gira su GitHub ma su un PC normale. È un'**attività pianificata di Windows** che ogni giorno alle 20:30 (o appena il PC si accende, se a quell'ora era spento) scarica dal sito della Lega listone, calendario e tabellini e li salva su GitHub.

Non tocca il gioco: i dati entrano solo quando un admin li applica con la routine settimanale, come sempre (guida admin, punto 1).

Il bot è un visitatore educato del sito della Lega: legge il suo `robots.txt` e non scarica le pagine che il sito chiede ai programmi di non leggere (per esempio `/statistiche/`: i tabellini li prende dalle pagine delle partite), si presenta con il nome del progetto e lascia un secondo tra una pagina e l'altra. Se il sito lo blocca si ferma e lo segnala, senza provare ad aggirare il blocco.

## Cosa serve

- Un PC con Windows 10 o 11, acceso ogni tanto: non serve che lo sia tutti i giorni, il bot recupera da solo.
- Un account GitHub con accesso in scrittura alla repo (la proprietaria o un collaboratore).
- Una decina di minuti, una volta sola.

Basta un PC, ed è meglio uno solo: con due, se un giorno uno dei due non riesce, si alternano avvisi diversi.

## Installazione

1. **Programmi.** Installa [Git per Windows](https://git-scm.com/download/win) e [Node.js](https://nodejs.org) (versione LTS, almeno la 20), lasciando le opzioni predefinite. Poi chiudi e riapri PowerShell.
2. **Una copia della repo solo per il bot.** In PowerShell:

   ```powershell
   cd $HOME
   git clone https://github.com/fslilaria-commits/FantaSuperLega-WebApp FantaSuperLega-bot
   cd FantaSuperLega-bot
   ```

   Questa cartella serve solo al bot: ogni sera la riallinea a GitHub e butta via le modifiche in `data/`. L'installazione la segna come cartella del bot solo se è una copia pulita, e il bot non parte in nessun'altra cartella. Non modificarla a mano (il bot si fermerebbe per non perdere le modifiche); per lavorare sul codice usa un'altra copia.
3. **Il tuo indirizzo anonimo di GitHub**, che firmerà i commit dei dati: su GitHub, **Settings → Emails**, con **Keep my email addresses private** attivo. È del tipo `12345678+nome@users.noreply.github.com`; quello di Ilaria è `338878559+fslilaria-commits@users.noreply.github.com`.
4. **Installa**, sempre dalla cartella `FantaSuperLega-bot`:

   ```powershell
   powershell -ExecutionPolicy Bypass -File backend-bot\installa-bot.ps1 -Email 338878559+fslilaria-commits@users.noreply.github.com
   ```

   Lo script:
   - controlla Git e Node.js;
   - fa firmare i commit dei dati a «Bot dati FantaSuperLega» con il tuo indirizzo anonimo;
   - controlla l'accesso a GitHub: **la prima volta si apre il browser**, entra con il tuo account GitHub e autorizza «Git Credential Manager»;
   - fa una prova completa senza salvare niente (circa un minuto);
   - crea l'attività pianificata **FantaSuperLega - aggiorna dati**.

   Per un'altra ora aggiungi per esempio `-Ora 22:00`. Per fare solo i controlli e la prova, senza installare niente, aggiungi `-SoloControlli`.

## La chiave di GitHub

- Git la chiede una volta sola e la tiene la **Gestione credenziali di Windows** (Pannello di controllo → Gestione credenziali → Credenziali di Windows → `git:https://github.com/fslilaria-commits/FantaSuperLega-WebApp`).
- Attenzione: l'accesso dato con il browser vale per **tutto l'account GitHub**, non solo per questa repo. Se l'account ha altre repo importanti, si può usare al suo posto una **chiave a grana fine** solo per questa repo (si fa con l'account proprietario della repo, cioè quello di Ilaria): GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**, *Repository access*: solo `FantaSuperLega-WebApp`, *Permissions → Contents*: **Read and write**, scadenza di un anno. Quando Git la chiede, al posto del browser scegli di incollare la chiave (alla scadenza si rifà e si rilancia `installa-bot.ps1`).
- **Non finisce mai nella repo** né nei file del bot: il bot non la legge e salva su GitHub solo la cartella `data/`.
- Non scriverla mai nell'indirizzo della repo (`https://chiave@github.com/…`): il bot se ne accorge e si ferma.
- Se il PC viene perso o ceduto: su GitHub **Settings → Applications → Authorized OAuth Apps → Git Credential Manager → Revoke**, poi togli la credenziale dalla Gestione credenziali.

## Tutti i giorni

- Alle 20:30 il bot lavora per circa un minuto: può comparire per un attimo una finestra. Se il PC era spento, parte appena lo accendi ed entri.
- Lascia un secondo tra una pagina e l'altra del sito della Lega e si presenta con il nome del progetto: per il sito è come una persona che naviga.
- Se ci sono novità le salva su GitHub e il sito le riceve in un paio di minuti; se non ce ne sono, non salva niente.
- Se qualcosa non va lo scrive in `data/bot.json`, e gli admin lo vedono nella scheda **La mia giornata** (riquadro **Da fare**) e nella **routine settimanale**. Se un tabellino non arriva entro 3 giorni dall'ultima partita compare un avviso anche quando il bot non può scrivere niente, per esempio con il PC spento da giorni.

## Aggiornare subito

Per esempio la sera di un turno infrasettimanale, dopo le 19 del giorno dopo l'ultima partita:

```powershell
Start-ScheduledTask -TaskName 'FantaSuperLega - aggiorna dati'
```

oppure **Utilità di pianificazione → FantaSuperLega - aggiorna dati → Esegui**. Per vedere tutto mentre lavora, dalla cartella del bot: `node backend-bot\aggiorna-dati.js`.

## Registro e problemi

Il registro di ogni esecuzione è in `%LOCALAPPDATA%\FantaSuperLega-bot\aggiorna-dati.log` (Win+R, incolla il percorso e Invio).

| Messaggio | Cosa fare |
|---|---|
| «modifiche a mano fuori da data/» | Qualcuno ha cambiato dei file nella cartella del bot: `git status` li mostra, `git checkout -- .` li butta |
| «GitHub non risponde» | Niente rete: il bot riprova per qualche minuto, poi di nuovo il giorno dopo |
| «GitHub non ha accettato i dati» | Accesso scaduto o revocato: rilancia `installa-bot.ps1`, che riapre il browser per entrare |
| «sono cambiati gli stessi dati» | Qualcun altro ha salvato dati nello stesso momento: il bot riprova da solo il giorno dopo |
| «Cloudflare ha rifiutato la richiesta» | Il sito della Lega non accetta programmi da questa rete: il bot si ferma e riprova il giorno dopo. Se dura, avvisa chi sviluppa (non serve cambiare rete) |
| «il robots.txt … chiede ai programmi di non leggere» | Il sito della Lega ha vietato una pagina che il bot usa (anche se ci si arriva da un reindirizzamento): quel passo si ferma apposta e gli altri continuano. Avvisa chi sviluppa |
| «le colonne della pagina partita non sono quelle attese», «i giocatori non tornano con i totali» | La Lega ha cambiato la pagina delle partite: il bot scarta quella giornata invece di scrivere numeri sbagliati. Avvisa chi sviluppa |
| «commit non inviati fatti da altri» | Qualcuno ha fatto un commit nella cartella del bot: il bot non lo butta. Mandalo su GitHub o toglilo, poi il bot riparte |
| «questa non è la cartella del bot» | Il bot è stato lanciato in un'altra copia della repo: lancialo solo nella cartella installata con `installa-bot.ps1` |
| «un altro aggiornamento è già in corso» | È partito mentre ne girava già uno (per esempio a mano): aspetta che finisca |
| «Trovato un blocco di git rimasto» | Un aggiornamento era stato interrotto (PC spento a metà): il bot lo sistema da solo, non serve fare niente. Lo toglie solo se ha più di 10 minuti, così non disturba un git ancora al lavoro |
| «non ha finito in tempo» | Un comando è rimasto appeso (rete lentissima): il bot si ferma e riprova al prossimo giro |
| «la pagina potrebbe essere cambiata», «proposta scartata», «calendario scartato» | Il sito della Lega è cambiato o i dati sembrano sbagliati: il bot si ferma apposta e riprova ogni giorno. Se dura, avvisa chi sviluppa |
| «serve Node.js 20 o più recente» | Aggiorna Node.js |

## Codice nuovo

Non serve fare niente: a ogni giro il bot prende da GitHub l'ultima versione del codice e, se sono cambiate, installa le dipendenze nuove.

## Togliere il bot

```powershell
powershell -ExecutionPolicy Bypass -File backend-bot\installa-bot.ps1 -Rimuovi
```

Poi cancella la cartella `FantaSuperLega-bot` e, se il PC non serve più per il gioco, la credenziale (vedi sopra).
