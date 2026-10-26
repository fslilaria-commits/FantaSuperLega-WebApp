# Guida per l'admin e per il Presidente

Questa guida spiega cosa fare ogni settimana per far girare il Fanta SuperLega e come risolvere i problemi più comuni. Non serve saper programmare: quasi tutto si fa dal sito, qualche operazione rara dalla console di Firebase.

- **Sito:** https://fslilaria-commits.github.io/FantaSuperLega-WebApp/frontend/
- **Console Firebase:** https://console.firebase.google.com/project/fanta-superlega-734b1
- **Bot dei dati:** gira ogni giorno su un PC, istruzioni in [`docs/bot-pc.md`](bot-pc.md)

## Chi fa cosa

| Ruolo | Chi è | Cosa fa |
|---|---|---|
| **Admin** | Chi è nella collezione `admins` di Firebase (chi gestisce il progetto) | Ogni settimana applica listone, calendario e punteggi dal **pannello Admin**; in estate fa partire la stagione nuova (punto 9). Vale per tutte le leghe |
| **Presidente** | Chi ha creato una lega | Inserisce le rose dopo l'asta, genera il calendario degli scontri diretti, applica il mercato della sua lega |
| **Partecipante** | Chi è entrato in una lega con il codice | Schiera la formazione, fa offerte e scambi |
| **Visitatore** | Chi non ha fatto l'accesso | Vede solo la pagina di benvenuto |
| **Bot dei dati** | Un'attività pianificata su un PC ([`docs/bot-pc.md`](bot-pc.md)) | Ogni sera scarica dal sito della Lega listone, calendario e tabellini e li salva su GitHub |

## La cosa più importante: l'app non ha un server

Niente succede da solo dentro il gioco. Il bot dei dati, un programma su un PC, scarica ogni sera i dati dal sito della Lega e li salva su GitHub, ma **nel gioco entrano solo quando un admin li applica**. Allo stesso modo, il mercato non si chiude da solo: **il Presidente di ogni lega deve cliccare** per assegnare gli svincolati e per applicare gli scambi.

La scheda **La mia giornata** ricorda ad admin e Presidenti cosa c'è da fare (riquadro **Da fare**).

## La settimana tipo

| Quando | Cosa succede | Chi |
|---|---|---|
| Fine giornata (3 ore dopo l'inizio dell'ultima partita) | Si apre il mercato per la giornata successiva | da solo |
| **Ogni sera** (alle 20:30) | Il bot sul PC scarica dal sito della Lega listone, calendario e tabellini: quelli della domenica arrivano il lunedì sera | da solo |
| **Martedì** | **Routine settimanale**: listone, calendario e punteggi nel gioco | **Admin** |
| Fino a 3 ore prima della scadenza | Offerte segrete per gli svincolati | Partecipanti |
| **Tra la chiusura delle offerte e la scadenza** | **"Assegna gli svincolati"** e **"Applica gli scambi accettati"** | **Presidente** |
| 1 minuto prima della prima partita | Le formazioni si bloccano (scadenza) | da solo |

## 1. Routine settimanale (admin)

Da fare ogni martedì: i tabellini della domenica sono già arrivati il lunedì sera. Ci vogliono un paio di minuti.

1. Apri il sito ed entra con Google: compare la scheda **Admin**.
2. **Admin → Routine settimanale → Controlla tutto**. Compare un elenco:
   - **Listone**: giocatori nuovi, trasferiti, usciti dalla SuperLega;
   - **Calendario**: nuove giornate o orari cambiati;
   - **Punteggi**: giornate con il tabellino pronto e non ancora calcolate.
3. Se è tutto a posto premi **Applica tutto**. La routine applica nell'ordine giusto: prima il listone, poi il calendario, poi le giornate.
4. Alla fine compare "Fatto: routine completata".

**Se la routine si ferma o segnala qualcosa**, indica il riquadro da guardare più in basso nella stessa pagina:

- **"nomi non trovati nel listone"**: la routine si ferma, perché nel tabellino c'è un nome che non corrisponde a nessun giocatore del listone. Abbinalo a mano (vedi il punto 2) e poi premi **Calcola e applica** nel riquadro **Tabellini e punteggi**.
- **"giornate già bloccate con orari diversi"**: è solo un avviso. La Lega ha spostato l'orario di una giornata già iniziata, ma la scadenza non viene mai spostata dopo il blocco, per non cambiare le regole a gioco in corso: basta prenderne nota.
- **"permessi da admin mancanti (regole aggiornate?)"**, nel riquadro indicato: le regole Firestore non sono aggiornate. Vedi "Pubblicare le regole" nel punto 6.

**Giornate infrasettimanali.** Il bot scarica ogni sera, quindi anche i tabellini di un turno del mercoledì arrivano da soli (la Lega li verifica dalle 19 del giorno dopo l'ultima partita): quando **La mia giornata** li segnala in **Da fare**, fai la routine anche a metà settimana. Per scaricare subito, sul PC del bot vedi «Aggiornare subito» in [`docs/bot-pc.md`](bot-pc.md).

**Correzioni della Lega.** Per due settimane dopo una giornata il tabellino viene riscaricato. Se la Lega corregge qualcosa, la routine propone di nuovo quella giornata: riapplicarla sovrascrive il calcolo precedente e aggiorna le classifiche.

Ogni riquadro si può usare anche da solo (**Controlla proposta → Applica aggiornamento**, **Controlla tabellino → Calcola e applica**): la routine fa le stesse cose tutte insieme.

## 2. Correzioni manuali del tabellino (admin)

Servono quando un nome del tabellino non si abbina al listone, oppure quando un numero è sbagliato e la Lega non l'ha ancora corretto.

1. **Admin → Tabellini e punteggi**: scegli la giornata e premi **Controlla tabellino**.
2. Sotto il riepilogo compare **Correzioni manuali**. Il primo menu elenca le righe del tabellino, squadra per squadra; quelle da sistemare sono segnate **NON TROVATO**.
3. Nel secondo menu scegli il giocatore giusto del listone (prima quelli della squadra), oppure **Nessuno: la riga non conta**. "Abbinamento automatico" lascia fare all'app.
4. Se serve, correggi i numeri: set, battute, ricezioni, attacchi, muri. Accanto ai numeri cambiati compare il valore originale della Lega. Punti, percentuali e totali di squadra si ricalcolano da soli.
5. Premi **Salva correzione**: il controllo si rifà da solo e la riga risulta "corretto".
6. Premi **Calcola e applica** per aggiornare punteggi e classifiche.

Le correzioni restano salvate e valgono anche quando il tabellino viene riscaricato. Se la Lega cambia il nome nel tabellino, la correzione viene segnalata come "non trova più la sua riga": controllala e, se non serve più, premi **Togli correzione**.

Se un giocatore nuovo non è ancora nel listone, prima applica il listone (lo fa la routine), poi correggi.

## 3. Presidente: creare e preparare la lega

1. **Creare la lega**: scheda **Lega → Crea una lega o unisciti con un codice → Crea una lega**. Servono il nome della lega, il nome della tua squadra, i crediti per l'asta (0 = senza crediti) e il tipo di competizione (**Classifica generale** o **Scontri diretti**). La lega parte dalla prima giornata non ancora bloccata.
2. **Invitare gli amici**: nella scheda Lega, sotto il codice, premi **Invita su WhatsApp**: si apre WhatsApp con il messaggio e il link già pronti, scegli il gruppo e invia. Con **Copia link** lo mandi su qualsiasi altra chat. Chi apre il link entra con Google e trova il modulo **Unisciti** già compilato: scrive solo il nome della sua squadra. In alternativa gli amici possono entrare da **Unisciti** con il **codice a 6 cifre**. Link e codice valgono come invito: condividili solo nel gruppo.
   - **Posti**: le rose sono esclusive, quindi in una lega ci stanno al massimo tante squadre quante ne permette il listone (oggi **11**: gli opposti sono 22 e ne servono 2 per rosa). La scheda Lega mostra per esempio "squadre 7/11". Quando la lega è al completo i pulsanti di invito spariscono e chi prova a entrare riceve un messaggio. Il limite lo controlla l'app, non le regole di Firestore: se per un problema di connessione qualcuno resta dentro in più, il Presidente lo vede nella classifica e può farlo togliere (vedi il punto 6).
3. **Asta**: si fa fuori dall'app. Poi **Lega → Rose della lega (Presidente)**: scegli la squadra, aggiungi i giocatori con il prezzo pagato e premi **Salva rosa**. Puoi salvare anche a rosa incompleta. Regole: 14 giocatori (2 palleggiatori, 4 schiacciatori, 4 centrali, 2 opposti, 2 liberi: rispetto ai 12 del FantaLVF un centrale e un libero in più), al massimo 4 dello stesso club, ogni giocatore in una sola squadra. Finché la rosa non è completa, quella squadra non può schierare la formazione. Se dopo l'asta sposti un giocatore da una squadra all'altra, nella formazione già salvata della squadra di prima quel giocatore prende 0 punti finché la formazione non viene cambiata.
4. **Solo per gli scontri diretti: il calendario delle sfide lo genera il Presidente.** Quando sono entrati tutti, prima della giornata di inizio: **Lega → Scontri diretti → Genera il calendario delle sfide**. Dopo la generazione nella lega non può più entrare nessuno. Con un numero dispari di squadre entra la "Squadra media". Se il Presidente se ne dimentica, il calendario lo genera l'admin in automatico al primo calcolo dei punteggi.

## 4. Presidente: il mercato (due clic da non dimenticare)

Il mercato segue il FantaLVF:

- **Svincolati a offerta segreta**: ognuno offre un proprio giocatore dello stesso ruolo più eventuali crediti. Vince l'offerta più alta (valore del giocatore lasciato + crediti); a parità, chi è più in basso in classifica e poi chi ha offerto prima.
- **Scambi tra squadre**: uno propone, l'altro accetta, rifiuta o rilancia.

Senza server le assegnazioni non scattano da sole, quindi ogni giornata il Presidente fa due cose da **Lega → Mercato (Presidente)**:

1. **Assegna gli svincolati**, dopo la chiusura delle offerte (3 ore prima della scadenza). Compare l'anteprima: chi vince, chi no e perché. Premi **Conferma e applica**.
2. **Applica gli scambi accettati**: anche qui c'è un'anteprima (scambi validi e scambi non più validi), poi **Conferma e applica**.

Conviene farlo **tra la chiusura delle offerte e la scadenza della giornata**: così i nuovi giocatori prendono il posto di quelli partiti già nella formazione di quella giornata. Fatto dopo la scadenza, i nuovi giocatori valgono dalla giornata successiva. Un giocatore lasciato da una squadra torna svincolato solo dalla finestra successiva. Le proposte di scambio valgono solo nella loro finestra: dopo risultano "scadute".

Con **Mercato sospeso** il Presidente ferma offerte e scambi della sua lega, per esempio durante una pausa.

## 5. Partecipanti (per spiegarlo agli amici)

- **Formazione**: scheda **Campo**. Scegli i 7 titolari (P, S1, S2, C1, C2, O, L) e il capitano, poi **Salva formazione**. Si blocca 1 minuto prima della prima partita della giornata. **Se non la salvi vale l'ultima salvata.** Titolari al 100%, capitano ×2, panchina al 50%. Per decidere chi schierare, nella lista del ruolo c'è **Statistiche** (la stessa scheda del Mercato, con i punti di ogni giornata); in panchina basta toccare il giocatore.
- **Gare spostate**: se una partita viene giocata lontano dalla sua giornata, i giocatori di quelle squadre prendono la loro media stagionale.
- **Mercato**: scheda **Mercato**. Accanto agli svincolati c'è "Fai un'offerta", accanto ai giocatori delle altre squadre "Proponi scambio".
- **Installare l'app**: su Android menu ⋮ → "Installa app"; su iPhone, in Safari, Condividi → "Aggiungi alla schermata Home".

## 6. Operazioni rare dalla console Firebase

Si fanno da https://console.firebase.google.com/project/fanta-superlega-734b1 con il proprio account Google personale.

- **Nominare un admin**: la persona fa una volta l'accesso al sito. Poi **Authentication → Utenti**: copia il suo **UID**. Poi **Firestore Database → Dati → collezione `admins` → Aggiungi documento**: come ID documento l'UID, un campo qualsiasi (per esempio `nome`). Ricaricando il sito compare la scheda Admin.
- **Pubblicare le regole**: va fatto ogni volta che una modifica tocca il file `firestore.rules` (chi fa la modifica lo segnala). **Firestore Database → Regole**: incolla tutto il contenuto di `firestore.rules` dalla repo e premi **Pubblica**.
- **Togliere un partecipante da una lega**: nell'app non c'è ancora il pulsante. In **Firestore Database → Dati**: `leagues` → la lega → `members` → cancella il documento del partecipante; se serve, cancella anche la sua rosa in `rosters`. Meglio farlo prima di generare il calendario delle sfide. Chi viene tolto non può rientrare dall'app (gli compare un messaggio). Per farlo rientrare: `users` → il suo UID → `leagues` → cancella il documento con l'ID della lega, poi può entrare di nuovo con il codice.
- **Cambiare il ruolo di un giocatore**: il ruolo non cambia mai da solo (il pannello segnala solo quando la Lega indica un ruolo diverso). Se serve davvero: `players` → il giocatore → campo `role` (`P`, `S`, `C`, `O`, `L`). Va fatto prima che il giocatore entri in una rosa.

## 7. Se qualcosa non torna

| Problema | Cosa fare |
|---|---|
| La routine dice "Tutto aggiornato" ma l'ultima giornata manca | La Lega verifica i tabellini dalle 19 del giorno dopo l'ultima partita e il bot passa la sera: aspetta il giorno dopo. Se dopo 3 giorni non c'è ancora, compare l'avviso del tabellino in ritardo |
| «Il bot dei dati ha un problema» (in **La mia giornata** o nella routine) | Il messaggio dice quale. Se dipende dal sito della Lega (pagina cambiata, dati che sembrano sbagliati) il bot si ferma apposta e riprova ogni sera; se dura qualche giorno, avvisa chi sviluppa. Tabella dei messaggi in [`docs/bot-pc.md`](bot-pc.md) |
| «Il tabellino … non è ancora arrivato: controlla che il PC del bot sia acceso» | Il bot non sta girando: PC spento da giorni o problema sul PC. Accendilo, o lancia l'aggiornamento a mano e guarda il registro ([`docs/bot-pc.md`](bot-pc.md)) |
| Su GitHub «Aggiorna dati SuperLega» è rosso | Lanciato a mano da GitHub si ferma quasi sempre, perché il sito della Lega blocca i server di GitHub: non serve, ci pensa il bot sul PC |
| Nomi non trovati nel tabellino | Prima applica il listone; se restano, abbinali a mano (punto 2) |
| Un punteggio è sbagliato | Correggi il numero (punto 2), poi **Calcola e applica**. Il ricalcolo sovrascrive il precedente e aggiorna tutte le classifiche |
| "Permessi da admin mancanti" | Pubblica le regole (punto 6) e ricarica il sito |
| Un amico non riesce a salvare la formazione | La giornata è già bloccata, oppure la sua rosa non è completa (lo dice la scheda Campo) |
| Un amico non riesce a entrare nella lega | Codice sbagliato, lega al completo (vedi i posti nella scheda Lega), oppure (scontri diretti) il calendario delle sfide è già stato generato |
| Il mercato non assegna niente | Le offerte chiudono 3 ore prima della scadenza: prima di allora "Assegna gli svincolati" non trova niente da assegnare |
| Il sito non carica più i dati per nessuno, dopo aver attivato App Check | Firebase → **App Check → API → Cloud Firestore → Non applicare** (vedi `docs/sicurezza.md`) |

## 8. Sicurezza e costi

- Il progetto Firebase è sul **piano gratuito Spark**, senza carta collegata: non possono arrivare addebiti.
- Le regole Firestore decidono chi può fare cosa: le offerte restano segrete fino alla chiusura (anche per il Presidente), le formazioni degli altri si vedono solo dopo la scadenza, i punteggi li scrivono solo gli admin.
- **App Check** controlla che le richieste arrivino davvero dal sito. Le istruzioni, compreso come attivarlo e disattivarlo, sono in [`docs/sicurezza.md`](sicurezza.md).
- Non condividere mai chiavi segrete o password. La configurazione nel codice (`frontend/js/config.js`) è pubblica per natura: non è un problema.

## 9. Nuova stagione (ogni estate)

A ogni stagione il gioco riparte da zero, come nel FantaLVF: nuovo listone, nuove leghe, nuova asta. Si fa in estate, quando la Lega ha pubblicato rose e calendario (di solito tra luglio e settembre). **Nessuno deve cambiare il codice**: la stagione la decide la Lega, e all'admin resta un solo pulsante.

1. **Il bot fa da solo.** A ogni aggiornamento dei dati guarda quale stagione mostra il calendario sul sito della Lega e la scrive in `data/stagione.json`: anno, codice della regular season e squadre, con il loro numero sul sito e il codice nelle statistiche (cambiano tutti a ogni stagione, anche per le squadre che restano). Quando la Lega passa alla stagione nuova, il bot toglie da `data/` listone, calendario e tabellini della stagione finita e scarica quelli nuovi; finché la Lega non ha pubblicato tutto, riprova a ogni aggiornamento. Se la Lega annuncia la stagione nuova ma non ha ancora la regular season o le squadre, il bot resta a quella di prima. Anche il sito prende la stagione da lì: la scritta in alto e quella dell'invito WhatsApp cambiano da sole.
2. **Un admin**, nel **pannello Admin → Nuova stagione**, preme **Controlla** (quando il bot ha trovato la stagione nuova, in cima al riquadro compare «la Lega è già alla …»). Se tutto è pronto compare il riepilogo: per confermare si scrive la stagione nuova (per esempio `2027/28`) e si preme **Inizia la stagione**. In un colpo il pulsante:
   - salva la classifica finale di ogni lega nell'**archivio**: ogni partecipante la ritrova nella scheda **Lega → Stagioni passate**;
   - cancella i dati della stagione finita: leghe con rose, formazioni, mercato e punteggi, codici invito, giornate con statistiche e correzioni, listone. Restano gli admin e l'archivio;
   - applica listone e calendario nuovi.

   Ci vuole circa un minuto: lascia la pagina aperta finché non compare «Fatto». Se si interrompe (connessione persa, pagina chiusa), premi di nuovo **Controlla** e **Inizia la stagione**: riprende da dove si era fermato. Poi i Presidenti creano le nuove leghe e mandano gli inviti (punto 3).

Se **Controlla** non mostra il pulsante, dice il motivo:

| Messaggio | Cosa fare |
|---|---|
| «La stagione … è in corso» | Niente: la Lega non è ancora passata alla stagione nuova, o il bot non l'ha ancora vista |
| «La stagione nel gioco non è finita» | Ci sono giornate con la scadenza ancora da passare: si aspetta la fine del campionato |
| «Il bot non ha ancora trovato le squadre» | La Lega ha la stagione nuova ma non ancora l'elenco delle squadre: il bot riprova da solo |
| «Manca il listone nuovo» o «Manca il calendario nuovo» | La Lega non li ha ancora pubblicati: il bot riprova a ogni aggiornamento |

Se il riepilogo segnala **giornate giocate ma non calcolate**, calcolale prima con la routine settimanale: altrimenti i loro punti non entrano nella classifica archiviata. Meglio ancora, calcola tutte le giornate appena finisce la regular season: quando la Lega passa alla stagione nuova il bot toglie i tabellini di quella finita, e dal pannello non si possono più calcolare.

Se la SuperLega cambia numero di squadre (per esempio 14), il bot lo vede dal calendario e il gioco si adatta da solo (26 giornate). Serve chi sviluppa solo se la Lega cambia il proprio sito: in quel caso il bot si ferma con un messaggio chiaro invece di scaricare dati sbagliati.
