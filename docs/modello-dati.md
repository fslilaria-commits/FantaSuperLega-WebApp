# Modello dati Firestore

Le regole del gioco seguono la Modalità Leghe del [FantaLVF](https://fantaking.gitbook.io/fantalvf/regolamento-leghe): asta offline, rose esclusive inserite dal **Presidente** della lega, valori dei giocatori fissi.

## Ruoli

| Ruolo | Chi | Cosa può fare |
|---|---|---|
| **Admin** | Chi è nella collezione `admins` (si nomina solo dalla console Firebase) | Dati di gioco: listone, giornate e scadenze, statistiche, punteggi e classifiche. Legge tutte le leghe, ma non fa il Presidente e non schiera formazioni altrui |
| **Presidente** | Chi ha creato la lega | Impostazioni della lega e rose dopo l'asta, rimozione dei partecipanti |
| **Partecipante** | Chi è entrato con il codice | Il proprio nome squadra e la propria formazione, solo prima della scadenza |
| **Visitatore** | Chi non ha fatto l'accesso | Solo il listone |

## Da dove arrivano i dati

Un workflow GitHub settimanale (`.github/workflows/aggiorna-dati.yaml`, martedì mattina o a mano da Actions) scarica dal sito della Lega una **proposta** e la salva nella repo (`data/players.json`). Non scrive su Firestore: un admin apre il pannello Admin dell'app, vede le differenze e le applica. Così non serve nessuna chiave di servizio e nessun dato entra nel gioco senza essere stato visto.

Regole del listone, come nei fantasy più diffusi:
- i nuovi giocatori entrano con il ruolo indicato dalla Lega;
- per chi c'è già **il ruolo non cambia mai da solo**: un ruolo diverso sul sito viene solo segnalato;
- nessuno viene cancellato: chi lascia la SuperLega diventa `active: false` e resta nelle rose.

## Collezioni

### `admins/{uid}` — admin del gioco
Un documento per admin, con id uguale all'uid di Firebase Authentication. Si crea solo dalla console; dall'app ognuno può leggere solo il proprio documento, per sapere se è admin.

### `meta/listone`
`appliedAt`, `appliedBy`, `changes`: quando e da chi è stato applicato l'ultimo aggiornamento del listone. Scrittura solo admin.

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

`playerId` è il **codice ufficiale della Lega** (es. `GIA-SIM-96`): resta lo stesso se il giocatore cambia squadra. Lettura pubblica; scrittura solo admin, nel formato sopra; nessuna cancellazione.

### `matchdays/{n}` — giornate
| Campo | Tipo | Note |
|---|---|---|
| `number` | number | 1–22 della regular season |
| `lockAt` | timestamp | 1 minuto prima della prima partita della giornata |
| `status` | string | `open`, `locked`, `scored` |

Sottocollezione `matchdays/{n}/stats/{playerId}` con le statistiche del tabellino (Fase 5). Lettura per utenti autenticati, scrittura solo admin.

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
| `createdAt` | timestamp | |

Leggibile dai membri, modificabile solo dal Presidente (che non può cedere la presidenza).

### `leagues/{leagueId}/members/{uid}` — partecipanti
| Campo | Tipo | Note |
|---|---|---|
| `teamName` | string | Nome della fanta-squadra |
| `code` | string | Il codice usato per entrare: deve coincidere con quello della lega |
| `joinedAt` | timestamp | |

Ognuno crea e modifica solo il proprio documento. Il Presidente può rimuovere un partecipante.

### `leagues/{leagueId}/rosters/{uid}` — rose
| Campo | Tipo | Note |
|---|---|---|
| `P`, `S`, `C`, `O`, `L` | list | Id dei giocatori per ruolo: 2, 4, 3, 2, 1 |
| `all` | list | Tutti e 12, senza ripetizioni |
| `prices` | map | `playerId → crediti pagati all'asta` |
| `creditsLeft` | number | Crediti avanzati per il mercato |

Scrive solo il Presidente. Le regole controllano numero di giocatori per ruolo e assenza di doppioni; l'esclusività tra squadre e il massimo di 4 per club li controlla il pannello del Presidente (le regole non possono confrontare tutte le rose).

### `leagues/{leagueId}/lineups/{matchday}_{uid}` — formazioni
| Campo | Tipo | Note |
|---|---|---|
| `uid` | string | Proprietario |
| `matchday` | number | |
| `starters` | map | `P, S1, S2, C1, C2, O, L` → playerId |
| `bench` | list | 5 playerId |
| `captain` | string | Uno dei titolari |

Ognuno scrive solo la propria, e solo prima di `lockAt`. I giocatori devono essere della propria rosa, nel ruolo giusto, senza doppioni. Le formazioni degli altri si vedono solo dopo la scadenza.

### `leagues/{leagueId}/scores/{matchday}_{uid}` e `leagues/{leagueId}/standings/{uid}`
Punteggi di giornata e classifica. Lettura per i membri e gli admin, scrittura solo admin (calcolati dai tabellini ufficiali).
