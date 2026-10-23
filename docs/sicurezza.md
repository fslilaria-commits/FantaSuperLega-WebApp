# Sicurezza

## Cosa protegge già l'app

- **Regole Firestore** (`firestore.rules`, con i test in `tests/`): ognuno legge e scrive solo ciò che gli spetta. Le offerte di mercato sono segrete fino alla chiusura anche per il Presidente, le formazioni degli altri si vedono solo dopo la scadenza, gli admin si nominano solo dalla console, i punteggi li scrivono solo gli admin.
- **Date dal server**: iscrizioni, creazione delle leghe, salvataggio delle formazioni, offerte e scambi usano l'orologio di Firebase, non quello del telefono. Chi sposta l'ora del proprio dispositivo non guadagna parità in classifica né ordine nelle offerte.
- **Nessun dato esterno diventa HTML**: tutto ciò che arriva da Firestore o dal sito della Lega viene inserito nella pagina come testo. Le foto dei giocatori si accettano solo dal sito della Lega.
- **Librerie esterne verificate**: Firebase e le icone si caricano con il controllo di integrità (SRI); se il file sul CDN cambiasse, il browser non lo eseguirebbe. Aggiornando la versione di Firebase vanno aggiornati anche gli hash in `frontend/index.html`.
- **Nessuna chiave segreta nella repo**: la configurazione web di Firebase (`frontend/js/config.js`) è pubblica per natura, come la chiave reCAPTCHA del sito. Le chiavi segrete (service account, chiave segreta reCAPTCHA) non servono all'app e non vanno mai committate.
- **Piano gratuito Spark**: senza metodo di pagamento collegato non possono arrivare addebiti.

Le due misure qui sotto limitano l'uso della configurazione pubblica da parte di altri siti o script.

## 1. Limitare la chiave web al sito

La chiave `apiKey` è pubblica, ma si può limitare ai siti autorizzati.

1. Apri [console.cloud.google.com](https://console.cloud.google.com/) con l'account del progetto, progetto **fanta-superlega-734b1**.
2. **API e servizi → Credenziali**: apri la chiave "Browser key (auto created by Firebase)".
3. **Restrizioni delle applicazioni → Siti web** e aggiungi:
   - `https://fslilaria-commits.github.io/*`
   - `https://fanta-superlega-734b1.firebaseapp.com/*` (serve all'accesso con Google)
4. **Salva**. Le modifiche possono richiedere qualche minuto.
5. Prova subito: apri il sito, esci e rientra con Google. Se l'accesso non funziona, ricontrolla i due indirizzi.

Restrizioni sulle API (elenco delle API consentite) non sono necessarie: la restrizione sui siti è quella che conta.

## 2. App Check

App Check fa sì che Firebase risponda solo alle richieste che arrivano davvero dall'app. Usa reCAPTCHA v3, invisibile per chi gioca.

Stato al 23/10/2026: chiave creata (etichetta `FantaSuperLega`, proprietario andre.mariani90@gmail.com) e chiave del sito già in `frontend/js/config.js`. Restano i passi 4 e 5.

1. **Crea la chiave reCAPTCHA v3** su [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin):
   - Tipo: **reCAPTCHA v3** (basato sul punteggio)
   - Domini: `fslilaria-commits.github.io`
   - Ottieni due chiavi: la **chiave del sito** (pubblica) e la **chiave segreta**.
   - Conviene aggiungere un secondo proprietario (Ilaria) e spuntare "Invia avvisi ai proprietari".
2. **Registra l'app in App Check**: Firebase Console → **App Check** → scheda **App** → l'app web → **reCAPTCHA** (non "Fraud Defense") → incolla la **chiave segreta** → durata del token **1 giorno** → Salva.
3. **Mandami la chiave del sito** (quella pubblica): la inserisco in `appCheckSiteKey` in `frontend/js/config.js`. La chiave segreta non va condivisa né messa nel codice.
4. **Controlla per 2-3 giorni**: Firebase Console → App Check → **API** → Cloud Firestore. Le richieste devono risultare quasi tutte **verificate**.
5. **Attiva l'applicazione obbligatoria** solo quando le richieste sono verificate: App Check → API → Cloud Firestore → **Applica**. Da quel momento le richieste che non arrivano dall'app vengono rifiutate.

Se dopo l'applicazione qualcosa smette di funzionare, si torna indietro da App Check → API → Cloud Firestore → **Non applicare**.

La console Firebase segnala che reCAPTCHA Classic è deprecato e propone Google Cloud Fraud Defense (il vecchio reCAPTCHA Enterprise). Per ora la v3 funziona e si configura tutta dalla console Firebase, senza attivare altre API su Google Cloud. Se Google annuncia lo spegnimento (arriva una mail ai proprietari della chiave), prima si toglie l'applicazione obbligatoria con **Non applicare**, poi si passa a Fraud Defense: nuova chiave nella console Cloud e, nel codice, il provider Enterprise al posto della v3.

App Check funziona solo sul sito pubblicato: aprendo l'app da `localhost` senza `?emulatori` le richieste non risultano verificate e, con l'applicazione obbligatoria attiva, vengono rifiutate. In locale si usano gli emulatori.

Negli emulatori locali App Check resta spento.

## Rischi che restano (accettati per una lega tra amici)

- **Il codice della lega è l'unico invito**: chi lo conosce può entrare finché la lega accetta iscrizioni (nelle leghe a scontri diretti fino alla generazione del calendario delle sfide). Il codice va condiviso solo nel gruppo degli amici; non si può ancora cambiare.
- **Chi viene tolto può rientrare** con lo stesso codice, per lo stesso motivo. Nella pratica: togliere i partecipanti solo prima di generare il calendario delle sfide, o chiedere all'admin.
- **I codici sono a 6 cifre**: in teoria si possono provare a caso, ma ogni tentativo richiede l'accesso con Google e App Check (quando attivo) blocca gli script automatici.

## Facoltativo: protezione del ramo principale su GitHub

Ilaria, come proprietaria della repo, può impostare in **Settings → Branches → Add rule** per `main`: "Require a pull request before merging" e "Require status checks to pass" con il controllo **Test**. Così nessuno, nemmeno per errore, può modificare il sito senza passare dai test.
