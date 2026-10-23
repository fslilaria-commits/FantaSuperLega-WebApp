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

App Check fa sì che Firebase risponda solo alle richieste che arrivano davvero dall'app. Usa **Google Cloud Fraud Defense** (il vecchio reCAPTCHA Enterprise) con una chiave a punteggio, invisibile per chi gioca. Il reCAPTCHA v3 classico non si può più usare: Firebase non registra più app nuove con quel provider. Funziona con il piano gratuito Spark: 10.000 verifiche al mese senza costi, e con la durata del token a 1 giorno una lega tra amici ne usa poche centinaia.

Stato al 23/10/2026: chiave `FantaSuperLega App Check` creata nel progetto fanta-superlega-734b1 (con l'account personale del proprietario del progetto), registrata in App Check e inserita in `frontend/js/config.js`. Restano i passi 4 e 5.

La console Google Cloud va aperta con l'account personale: con un account di lavoro il progetto non compare.

1. **Crea la chiave** nella [console Google Cloud → Fraud Defense](https://console.cloud.google.com/security/recaptcha?project=fanta-superlega-734b1), progetto **fanta-superlega-734b1**:
   - se lo chiede, **abilita l'API** reCAPTCHA Enterprise;
   - **Crea chiave**: nome `FantaSuperLega App Check`, tipo di applicazione **Web**;
   - dominio `fslilaria-commits.github.io` (senza `https://`; niente `localhost`);
   - la verifica con **casella di controllo resta spenta** (chiave a punteggio);
   - salva e copia l'**ID chiave** (inizia con `6L…`). C'è una sola chiave, ed è pubblica: niente chiave segreta.
2. **Registra l'app in App Check**: Firebase Console → **App Check** → scheda **App** → l'app web → **Fraud Defense (in precedenza reCAPTCHA Enterprise)** → incolla l'ID chiave → durata del token **1 giorno** → soglia di rischio **0,5** → Salva.
3. **Mandami l'ID chiave**: lo inserisco in `appCheckSiteKey` in `frontend/js/config.js`.
4. **Controlla per 2-3 giorni**: Firebase Console → App Check → **API** → Cloud Firestore. Le richieste devono risultare quasi tutte **verificate**.
5. **Attiva l'applicazione obbligatoria** solo quando le richieste sono verificate: App Check → API → Cloud Firestore → **Applica**. Da quel momento le richieste che non arrivano dall'app vengono rifiutate.

Se dopo l'applicazione qualcosa smette di funzionare, si torna indietro da App Check → API → Cloud Firestore → **Non applicare**.

La chiave reCAPTCHA v3 classica creata il 23/10 su google.com/recaptcha (etichetta `FantaSuperLega`) non serve: si può eliminare.

App Check funziona solo sul sito pubblicato: aprendo l'app da `localhost` senza `?emulatori` le richieste non risultano verificate e, con l'applicazione obbligatoria attiva, vengono rifiutate. In locale si usano gli emulatori.

Negli emulatori locali App Check resta spento.

## Rischi che restano (accettati per una lega tra amici)

- **Il codice della lega è l'unico invito**, anche dentro il link di invito per WhatsApp: chi lo conosce può entrare finché la lega accetta iscrizioni (nelle leghe a scontri diretti fino alla generazione del calendario delle sfide). Codice e link vanno condivisi solo nel gruppo degli amici; il codice non si può ancora cambiare.
- **Il limite di squadre per lega lo controlla l'app, non le regole** (Firestore non sa contare i partecipanti): chi entra oltre i posti esce da solo, ma una richiesta costruita a mano o una connessione persa al momento sbagliato possono lasciare una squadra in più. Si vede nella scheda Lega e si toglie dalla console.
- **Chi viene tolto non rientra dall'app** (l'app glielo dice), ma una richiesta costruita a mano può farlo rientrare finché la lega accetta iscrizioni. Nella pratica: togliere i partecipanti solo prima di generare il calendario delle sfide. Per far rientrare qualcuno, l'admin cancella dalla console il documento `users/<uid>/leagues/<id della lega>`.
- **Gli admin possono cancellare tutti i dati di gioco** (leghe, rose, formazioni, mercato, giornate, listone): serve al pulsante «Inizia la stagione», che a ogni estate archivia le classifiche e riparte da zero. Non possono cancellare gli admin né l'archivio. Il pulsante compare solo a stagione finita e chiede di scrivere la stagione per confermare, ma chi rubasse l'account Google di un admin potrebbe cancellare tutto (il piano gratuito non ha backup). Per questo gli admin devono essere pochi e con la verifica in due passaggi attiva sull'account Google.
- **Il Presidente è una persona di fiducia**: può modificare le rose della sua lega in qualsiasi momento e scrive il registro dei movimenti. Tutto resta visibile nella scheda Mercato ("Movimenti della lega"). Il calcolo dei punteggi usa la rosa alla scadenza e ignora i movimenti che non corrispondono a un vero cambio di rosa.
- **Il piano gratuito ha un limite giornaliero di letture e scritture**: chiunque abbia un account Google può leggere listone e calendario e creare leghe. Uno script malevolo potrebbe consumare la quota del giorno (il gioco riparte il giorno dopo). App Check, quando è applicato, blocca gli script fuori dal sito.
- **I codici sono a 6 cifre**: in teoria si possono provare a caso, ma ogni tentativo richiede l'accesso con Google e App Check (quando attivo) blocca gli script automatici.

## Facoltativo: protezione del ramo principale su GitHub

Chi è proprietario della repo su GitHub può impostare in **Settings → Branches → Add rule** per `main`: "Require a pull request before merging" e "Require status checks to pass" con il controllo **Test**. Così nessuno, nemmeno per errore, può modificare il sito senza passare dai test.
