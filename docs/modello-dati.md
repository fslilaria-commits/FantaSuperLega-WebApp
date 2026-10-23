# Modello dati Firestore

Le regole del gioco seguono la Modalità Leghe del [FantaLVF](https://fantaking.gitbook.io/fantalvf/regolamento-leghe): asta offline, rose esclusive inserite dal **Presidente** della lega, valori dei giocatori fissi.

## Ruoli

| Ruolo | Chi | Cosa può fare |
|---|---|---|
| **Admin** | Chi è nella collezione `admins` (si nomina solo dalla console Firebase) | Dati di gioco: listone, giornate e scadenze, statistiche, punteggi e classifiche. Legge tutte le leghe, comprese rose e formazioni per il calcolo dei punteggi, ma non fa il Presidente e non schiera formazioni altrui. A ogni stagione nuova archivia le classifiche e cancella i dati della stagione finita (pulsante «Inizia la stagione») |
| **Presidente** | Chi ha creato la lega | Impostazioni della lega e rose dopo l'asta, assegnazioni di mercato e scambi |
| **Partecipante** | Chi è entrato con il codice | Il proprio nome squadra e la propria formazione, solo prima della scadenza |
| **Visitatore** | Chi non ha fatto l'accesso | Solo la schermata di benvenuto con l'invito ad accedere |

## Da dove arrivano i dati

Un workflow GitHub settimanale (`.github/workflows/aggiorna-dati.yaml`, martedì mattina o a mano da Actions) scarica dal sito della Lega una **proposta** di listone e calendario e la salva nella repo (`data/players.json`, `data/calendario.json`). Non scrive su Firestore: un admin apre il pannello Admin dell'app, vede le differenze e le applica. Così non serve nessuna chiave di servizio e nessun dato entra nel gioco senza essere stato visto.

Regole del listone, come nei fantasy più diffusi:
- i nuovi giocatori entrano con il ruolo indicato dalla Lega;
- per chi c'è già **il ruolo non cambia mai da solo**: un ruolo diverso sul sito viene solo segnalato;
- durante la stagione nessuno viene cancellato: chi lascia la SuperLega diventa `active: false` e resta nelle rose.

**Stagione.** Anno e numero di squadre stanno in `frontend/js/stagione.js`, che usano sia il sito sia il bot. `data/stagione.json` dice di che stagione sono le proposte in `data/`: quando il codice passa all'anno nuovo il bot (`backend-bot/prepara-stagione.js`, primo passo del workflow, che parte da solo quando nel `main` cambiano la stagione o l'elenco delle squadre) toglie listone, calendario e tabellini della stagione finita e scarica i nuovi. Nel gioco la stagione nuova parte solo quando un admin preme **Inizia la stagione** nel pannello (`frontend/js/admin-stagione.js`): archivia le classifiche finali in `archivio`, cancella tutti i dati di gioco tranne `admins` e `archivio`, applica listone e calendario nuovi e infine segna l'anno in `meta/stagione`. Il pulsante compare solo se il codice è a una stagione successiva a quella di `meta/stagione`, se le giornate nel gioco sono tutte passate e se il bot ha già scaricato listone e calendario della stagione nuova.

## Collezioni

### `admins/{uid}` — admin del gioco
Un documento per admin, con id uguale all'uid di Firebase Authentication. Si crea solo dalla console; dall'app ognuno può leggere solo il proprio documento, per sapere se è admin.

### `meta/listone`
`appliedAt`, `appliedBy`, `changes`: quando e da chi è stato applicato l'ultimo aggiornamento del listone. Scrittura solo admin.

### `meta/stagione`
`anno` (anno di inizio della stagione in corso nel gioco, per esempio `2026` per il 2026/27), `iniziataAt`, `iniziataBy`. Lo crea il pannello Admin alla prima apertura con l'anno del codice; lo aggiorna il pulsante «Inizia la stagione» come ultimo passo. Durante il passaggio `archiviata` (anno) segna che le classifiche sono già state archiviate, così ripremendo dopo un'interruzione non si rifanno.

### `archivio/{anno}_{leagueId}` — stagioni passate
La classifica finale di una lega, salvata dal pulsante «Inizia la stagione» prima di cancellare i dati.

| Campo | Tipo | Note |
|---|---|---|
| `anno`, `stagione` | number, string | Es. `2026`, `2026/27` |
| `lega`, `modalita` | string | Nome della lega, `classifica` o `scontri` |
| `uids` | list | Partecipanti: solo loro (e gli admin) leggono il documento |
| `classifica` | list | `{ pos, squadra, total, presidente? }`, negli scontri diretti anche `points, won, tbWon, tbLost, lost` |
| `archiviatoAt`, `archiviatoBy` | | Data del server e admin che l'ha salvato |

Lo scrivono solo gli admin, nessuno lo cancella dall'app.

### `players/{playerId}` — listone
| Campo | Tipo | Note |
|---|---|---|
| `name` | string | Nome e cognome |
| `team` | string | Squadra di SuperLega |
| `teamId` | number | Id della squadra su legavolley.it |
| `role` | string | `P`, `S`, `C`, `O` o `L` |
| `number` | number | Numero di maglia |
| `birthYear` | number | |
| `nationality` | string | Nazionalità sportiva (es. `ITA`) |
| `photo` | string | Foto ufficiale della Lega |
| `active` | bool | `false` se lascia la SuperLega |
| `updatedAt` | timestamp | |

`playerId` è il **codice ufficiale della Lega** (es. `GIA-SIM-96`): resta lo stesso se il giocatore cambia squadra. Lettura per chi ha fatto l'accesso; scrittura solo admin, nel formato sopra; nessuna cancellazione.

### `matchdays/{n}` — giornate
| Campo | Tipo | Note |
|---|---|---|
| `number` | number | 1–22 della regular season (andata 1–11, ritorno 12–22) |
| `label` | string | Es. `1ª Andata` |
| `legaId` | number | Codice della giornata sul sito della Lega (lo stesso delle statistiche) |
| `lockAt` | timestamp | 1 minuto prima della prima gara della giornata |
| `provisional` | bool | `true` se qualche gara non ha ancora l'orario ufficiale |
| `matches` | list | Gare: squadre, id Lega, orario, `moved` |
| `status` | string | `open`, poi `scored` dopo il calcolo. Il blocco delle formazioni lo decide solo `lockAt` |

Una gara giocata più di 4 giorni prima o 3 giorni dopo la data della sua giornata è **spostata** (`moved: true`): non conta per la scadenza e, come nel FantaLVF, i suoi giocatori prenderanno il punteggio medio. La scadenza di una giornata già bloccata non viene mai spostata dagli aggiornamenti.

Sottocollezione `matchdays/{n}/stats/{playerId}` con le statistiche del tabellino (Fase 5). Lettura per utenti autenticati, scrittura solo admin. Dopo il calcolo contiene i fanta-punti di ogni giocatore (`fp`, voci, moltiplicatore, `media` per le gare spostate, `corretto` se viene da una correzione manuale).

Documento `matchdays/{n}/correzioni/tabellino` con le correzioni manuali del tabellino: `righe` (`"<teamId>|<nome nel tabellino>" → { id?, stats? }`: `id` giocatore abbinato a mano, `null` se la riga non conta; `stats` i numeri corretti), `updatedAt` (data del server), `updatedBy`. Solo gli admin lo leggono e lo scrivono. Dettagli in `docs/punteggio.md`.

### `users/{uid}/leagues/{leagueId}` — le mie leghe
Un documento (`joinedAt`, data del server) per ogni lega in cui l'utente è entrato, per ritrovarle all'accesso. Lo scrive l'utente stesso, solo insieme alla propria iscrizione alla lega; nessuno legge quelle degli altri.

### `leagueCodes/{code}` — codici invito
| Campo | Tipo |
|---|---|
| `leagueId` | string |

Il codice a 6 cifre è l'id del documento. Si legge un codice alla volta (niente elenco, così i codici non si possono scorrere). Lo crea il Presidente insieme alla lega.

### `leagues/{leagueId}` — lega
| Campo | Tipo | Note |
|---|---|---|
| `name` | string | |
| `code` | string | Codice invito a 6 cifre |
| `presidentUid` | string | Chi ha creato la lega |
| `settings.budget` | number | Crediti per l'asta |
| `settings.mode` | string | `classifica` o `scontri` |
| `settings.startMatchday` | number | Prima giornata valida |
| `settings.marketSuspended` | bool | Mercato sospeso dal Presidente (facoltativo) |
| `createdAt` | timestamp | Data del server |

Leggibile dai membri, modificabile solo dal Presidente (che non può cedere la presidenza). Giornata di inizio e tipo di lega si cambiano solo prima della scadenza della giornata di inizio e prima che esista il calendario delle sfide.

### `leagues/{leagueId}/members/{uid}` — partecipanti
| Campo | Tipo | Note |
|---|---|---|
| `teamName` | string | Nome della fanta-squadra |
| `code` | string | Il codice usato per entrare: deve coincidere con quello della lega |
| `joinedAt` | timestamp | Data del server: a parità in classifica vince chi si è iscritto prima |

Ognuno crea e modifica solo il proprio documento. Posti: le rose sono esclusive, quindi una lega ha al massimo le squadre che il listone permette (`RoseCheck.maxSquadre`: il ruolo con meno giocatori attivi rispetto a quanti ne servono per rosa, oggi gli opposti, 11 squadre; 0, cioè nessun limite, se il listone non basta per una rosa intera). Le regole non sanno contare i partecipanti: lo controlla l'app, e chi entra oltre i posti (in ordine di `joinedAt`) esce subito da solo. Si entra anche da un link di invito (`?invito=<codice>`), che compila il modulo "Unisciti" dopo l'accesso. Le regole permettono al Presidente di togliere un partecipante e a ognuno di uscire, ma l'app non ha ancora il pulsante: per ora si fa dalla console Firebase, cancellando il documento del partecipante e la sua rosa. Chi è stato tolto non può rientrare dall'app, perché il suo `users/{uid}/leagues/{leagueId}` esiste ancora: per farlo rientrare l'admin lo cancella dalla console (vedi `docs/sicurezza.md`).

### `leagues/{leagueId}/rosters/{uid}` — rose
| Campo | Tipo | Note |
|---|---|---|
| `P`, `S`, `C`, `O`, `L` | list | Id dei giocatori per ruolo: 2, 4, 4, 2, 2 (rosa da 14: il FantaLVF ne ha 12, qui un centrale e un libero in più) |
| `all` | list | Tutti e 14, senza ripetizioni |
| `prices` | map | `playerId → crediti pagati all'asta` |
| `creditsLeft` | number | Crediti avanzati per il mercato |

Scrive solo il Presidente. Durante l'asta la rosa si può salvare anche incompleta: le regole controllano i massimi per ruolo (2, 4, 4, 2, 2), l'assenza di doppioni e la coerenza dei prezzi. Esclusività tra squadre, massimo 4 per club e budget li controlla il pannello del Presidente (`frontend/js/rose-check.js`), perché le regole non possono confrontare tutte le rose.

### `leagues/{leagueId}/lineups/{matchday}_{uid}` — formazioni
| Campo | Tipo | Note |
|---|---|---|
| `uid` | string | Proprietario |
| `matchday` | number | |
| `starters` | map | `P, S1, S2, C1, C2, O, L` → playerId |
| `bench` | list | 7 playerId |
| `captain` | string | Uno dei titolari |
| `savedAt` | timestamp | Data del server del salvataggio |

Ognuno scrive solo la propria, e solo prima di `lockAt`. I trasferimenti di mercato registrati dopo `savedAt` e prima della scadenza sostituiscono nella formazione i giocatori partiti. I giocatori devono essere della propria rosa (completa), nel ruolo giusto, senza doppioni; la panchina sono gli altri 7. Le formazioni degli altri si vedono solo dopo la scadenza. Per una nuova giornata l'app riparte dalla formazione precedente.

### `leagues/{leagueId}/schedule/main` — calendario degli scontri diretti
| Campo | Tipo | Note |
|---|---|---|
| `teams` | list | Uid delle squadre al momento della generazione |
| `rounds` | map | `giornata → [{ a, b }]` (Firestore non accetta liste dentro liste); `MEDIA` è la Squadra media |
| `createdAt`, `createdBy` | | |

Solo per le leghe `scontri`. Lo genera il Presidente una sola volta prima della giornata di inizio, oppure un admin al primo calcolo se manca; dopo lo può cambiare solo un admin. Girone all'italiana ripetuto a ciclo fino all'ultima giornata; con squadre dispari entra la Squadra media, che prende la media dei punti della giornata. Una volta generato, nella lega non entra più nessuno (come nel FantaLVF).

## Mercato (Modalità Leghe FantaLVF)

La logica è in `frontend/js/mercato.js`. **Senza server le assegnazioni non scattano da sole: le applica il Presidente con un clic** dalla scheda Lega ("Assegna gli svincolati", "Applica gli scambi accettati").

**Finestra** per la giornata *n*: apre a fine giornata *n−1* (3 ore dopo l'inizio dell'ultima partita), offerte per gli svincolati fino a 3 ore prima della scadenza di *n*, scambi fino alla scadenza. Le regole controllano che si sia dopo l'inizio della giornata *n−1* e prima delle chiusure; il Presidente può sospendere il mercato. Un giocatore lasciato in un'assegnazione torna svincolato dalla finestra successiva. Una proposta di scambio vale solo nella sua finestra: dopo risulta "scaduta" e non si può più accettare.

### `leagues/{leagueId}/markets/{n}/offers/{uid}_{playerIn}` — offerte segrete
| Campo | Tipo | Note |
|---|---|---|
| `uid` | string | Chi offre |
| `playerIn` | string | Svincolato richiesto |
| `playerOut` | string | Giocatore della propria rosa, stesso ruolo, che si lascia |
| `role` | string | |
| `extra` | number | Crediti in aggiunta (≥ 0) |
| `status` | string | `active`, `withdrawn`, `won`, `lost` (+ `motivo` se persa) |

L'offerta vale il valore del giocatore lasciato più i crediti. Nessuno legge le offerte degli altri prima della chiusura, nemmeno il Presidente. Vince la più alta; a parità chi è più in basso in classifica. Il nuovo arrivato prende posto e valore del giocatore lasciato più i crediti; il giocatore lasciato torna svincolato dalla finestra successiva.

### `leagues/{leagueId}/trades/{tradeId}` — scambi tra squadre
`from` offre `give` (più `extra` crediti) per `take` di `to`, stesso ruolo. Stati: `proposed` → `accepted` / `refused` / `countered` (rilancio con una controproposta) / `withdrawn`; il Presidente porta gli accettati a `executed` (o `void` se non più validi). Chi arriva prende il valore di chi parte, più i crediti per chi li paga. Li leggono solo le due squadre, il Presidente e gli admin.

### `leagues/{leagueId}/transfers/{id}` — registro dei movimenti
`tipo` (`svincolato` o `scambio`), `uid`, `playerIn`, `playerOut`, `valore`, `extra`, `matchday`, `at` (ora del server). Lo scrive il Presidente quando applica il mercato, lo legge tutta la lega. Serve anche alle formazioni: chi arriva prima della scadenza di una giornata prende il posto di chi parte, nella formazione e nel calcolo dei punteggi. Il calcolo parte dalla rosa di oggi e torna indietro nel tempo: usa la rosa alla scadenza della giornata e ignora i movimenti che non corrispondono a un vero cambio di rosa. Chi alla scadenza non era più in rosa resta nella formazione salvata, ma prende 0 punti.

### `leagues/{leagueId}/scores/{matchday}_{uid}` e `leagues/{leagueId}/standings/{uid}`
Punteggi di giornata e classifica. Lettura per i membri e gli admin, scrittura solo admin (calcolati dai tabellini ufficiali).

`standings` contiene `total` (fanta-punti), `giornate`, `ultima`; nelle leghe a scontri diretti anche `points`, `won`, `lost`, `tbWon`, `tbLost`, `for`, `against`. Regole come nel FantaLVF: vittoria 3 punti; a parità di fanta-punti tie-break (più fanta-punti in classifica generale, poi iscrizione più vecchia) con 2 punti al vincitore e 1 al perdente. Ordine: scontri diretti per punti, poi fanta-punti, poi iscrizione; classifica generale per fanta-punti, poi iscrizione. La logica è in `frontend/js/scontri.js`.
