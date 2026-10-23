# Fanta SuperLega 2026/27

Fantavolley sulla SuperLega maschile, per leghe private tra amici. Le regole seguono la Modalità Leghe del [FantaLVF](https://fantaking.gitbook.io/fantalvf): asta offline, rose esclusive inserite dal Presidente della lega, punteggio calcolato dai tabellini ufficiali.

## Struttura

| Cartella | Contenuto |
|---|---|
| `frontend/` | App web statica (HTML, CSS, JS) con Firebase Auth e Firestore |
| `backend-bot/` | Script Node che aggiorna il listone giocatori su Firestore |
| `.github/workflows/` | GitHub Action che esegue lo script del bot |

## Avviare il frontend in locale

L'app è statica: basta servire la **cartella principale della repo** con un qualsiasi server web e aprire `/frontend/` (il pannello Admin legge la proposta di listone da `data/`):

```bash
npx serve .
```

Se il listone su Firestore è vuoto l'app mostra i giocatori di esempio di `js/players-data.js`.

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

Il comando avvia l'emulatore Firestore, che richiede **Java 11 o superiore**. `npm run test:unit` lancia i test della logica del pannello Admin. Tutti i test girano su GitHub a ogni pull request.

## Ruoli e pannello Admin

I ruoli (Admin, Presidente, Partecipante, Visitatore) sono descritti in [`docs/modello-dati.md`](docs/modello-dati.md#ruoli).

**Nominare un admin** (solo dalla console Firebase, mai dall'app):
1. La persona fa una volta l'accesso con Google sul sito.
2. Firebase Console → **Authentication → Utenti**: copiare il suo **UID**.
3. Firebase Console → **Firestore Database → Dati → Avvia raccolta** (la prima volta) `admins`, ID documento = l'UID copiato, un campo qualsiasi (per esempio `nome` = `Andrea`).
4. Ricaricando il sito compare la scheda **Admin**.

## Aggiornamento del listone

Il workflow **Aggiorna dati SuperLega** (`.github/workflows/aggiorna-dati.yaml`) gira ogni martedì mattina, o a mano da **Actions → Aggiorna dati SuperLega → Run workflow**:
1. legge le rose delle 12 squadre dal sito della Lega (`backend-bot/genera-listone.js`);
2. si ferma senza scrivere niente se i dati sembrano sbagliati (squadre con meno di 10 giocatori, più di un quarto dei giocatori spariti, doppioni);
3. se ci sono novità, salva la proposta in `data/players.json` con un commit.

Nel gioco non cambia niente finché un admin non apre il **pannello Admin → Controlla proposta → Applica aggiornamento**. Il ruolo dei giocatori già presenti non cambia mai da solo e nessuno viene cancellato: chi esce dalla SuperLega diventa non attivo.

Per lanciare il generatore in locale:

```bash
cd backend-bot
npm install
npm run genera-listone
npm test
```
