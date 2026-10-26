# Bot dei dati sul PC

Il sito della Lega sta dietro Cloudflare, che rifiuta le richieste dai server di GitHub: per questo il bot dei dati non gira più su GitHub ma su un PC normale, collegato a una rete di casa. È un'**attività pianificata di Windows** che ogni giorno alle 20:30 (o appena il PC si accende, se a quell'ora era spento) scarica dal sito della Lega listone, calendario e tabellini e li salva su GitHub.

Non tocca il gioco: i dati entrano solo quando un admin li applica con la routine settimanale, come sempre (guida admin, punto 1).

## Cosa serve

- Un PC con Windows 10 o 11, acceso ogni tanto: non serve che lo sia tutti i giorni, il bot recupera da solo. Meglio su una rete di casa (le reti aziendali e le VPN possono essere bloccate).
- Un account GitHub con accesso in scrittura alla repo (la proprietaria o un collaboratore).
- Una decina di minuti, una volta sola.

Basta un PC. Due PC non fanno danni (il secondo trova i dati già salvati), ma non servono.

## Installazione

1. **Programmi.** Installa [Git per Windows](https://git-scm.com/download/win) e [Node.js](https://nodejs.org) (versione LTS, almeno la 20), lasciando le opzioni predefinite. Poi chiudi e riapri PowerShell.
2. **Una copia della repo solo per il bot.** In PowerShell:

   ```powershell
   cd $HOME
   git clone https://github.com/fslilaria-commits/FantaSuperLega-WebApp FantaSuperLega-bot
   cd FantaSuperLega-bot
   ```

   Questa cartella serve solo al bot: non modificarla a mano, perché il bot si fermerebbe per non perdere le modifiche. Per lavorare sul codice usa un'altra copia.
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

- Git la chiede una volta sola e la tiene la **Gestione credenziali di Windows** (Pannello di controllo → Gestione credenziali → Credenziali di Windows → `git:https://github.com/fslilaria-commits/FantaSuperLega-WebApp`). Vale solo per questa repo.
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
| «Cloudflare ha rifiutato la richiesta» | Il sito della Lega blocca anche questa rete (succede con alcune reti aziendali o VPN): usa un PC su una rete di casa |
| «la pagina potrebbe essere cambiata», «proposta scartata», «calendario scartato» | Il sito della Lega è cambiato o i dati sembrano sbagliati: il bot si ferma apposta e riprova ogni giorno. Se dura, avvisa chi sviluppa |
| «serve Node.js 20 o più recente» | Aggiorna Node.js |

## Codice nuovo

Non serve fare niente: a ogni giro il bot prende da GitHub l'ultima versione del codice e, se sono cambiate, installa le dipendenze nuove.

## Togliere il bot

```powershell
powershell -ExecutionPolicy Bypass -File backend-bot\installa-bot.ps1 -Rimuovi
```

Poi cancella la cartella `FantaSuperLega-bot` e, se il PC non serve più per il gioco, la credenziale (vedi sopra).
