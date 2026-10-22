# Fanta SuperLega 2026/27

Fantavolley sulla SuperLega maschile, per leghe private tra amici. Le regole seguono la Modalità Leghe del [FantaLVF](https://fantaking.gitbook.io/fantalvf): asta offline, rose esclusive inserite dal Presidente della lega, punteggio calcolato dai tabellini ufficiali.

## Struttura

| Cartella | Contenuto |
|---|---|
| `frontend/` | App web statica (HTML, CSS, JS) con Firebase Auth e Firestore |
| `backend-bot/` | Script Node che aggiorna il listone giocatori su Firestore |
| `.github/workflows/` | GitHub Action che esegue lo script del bot |

## Avviare il frontend in locale

L'app è statica: basta servire la cartella `frontend/` con un qualsiasi server web, per esempio:

```bash
npx serve frontend
```

Senza configurazione Firebase l'app parte in **modalità offline** e mostra i giocatori di esempio di `js/players-data.js`.

## Collegare Firebase

1. Creare un progetto su [Firebase Console](https://console.firebase.google.com/).
2. **Authentication → Metodo di accesso**: attivare **Google**. In **Impostazioni → Domini autorizzati** aggiungere il dominio dove è pubblicata l'app (per GitHub Pages `fslilaria-commits.github.io`).
3. **Firestore Database**: crearlo in modalità produzione, regione europea (per esempio `eur3`).
4. **Impostazioni progetto → Le tue app**: aggiungere un'app web e copiare la configurazione in `frontend/js/config.js` al posto dei segnaposto. Questi valori sono pubblici per natura: la sicurezza la fanno le regole.
5. Pubblicare le regole: incollare `firestore.rules` in **Firestore → Regole**, oppure da terminale `npx firebase deploy --only firestore:rules --project <id-progetto>`.

## Dati e regole di sicurezza

Il modello dati è descritto in [`docs/modello-dati.md`](docs/modello-dati.md), le regole sono in `firestore.rules`. Ogni modifica alle regole va accompagnata da un test in `tests/`.

```bash
npm install
npm run test:rules
```

Il comando avvia l'emulatore Firestore, che richiede **Java 11 o superiore**. Gli stessi test girano su GitHub a ogni pull request.

## Bot del listone

Lo script `backend-bot/updater.js` scrive su Firestore con le credenziali di un service account, lette dalla variabile d'ambiente `FIREBASE_SERVICE_ACCOUNT` (il JSON completo della chiave). Su GitHub va salvata come secret del repository con lo stesso nome.

```bash
cd backend-bot
npm install
FIREBASE_SERVICE_ACCOUNT="$(cat chiave.json)" node updater.js
```

**Non committare mai la chiave del service account**: `.gitignore` esclude i nomi più comuni, ma conviene tenerla fuori dalla cartella del progetto.

L'esecuzione settimanale automatica è sospesa: lo scraping di legavolley.it va sostituito con un listone curato a mano.
