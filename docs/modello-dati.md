# Modello dati Firestore

Le regole del gioco seguono la Modalità Leghe del [FantaLVF](https://fantaking.gitbook.io/fantalvf/regolamento-leghe): asta offline, rose esclusive inserite dal **Presidente** della lega, valori dei giocatori fissi.

Chi scrive cosa:

| Chi | Cosa scrive |
|---|---|
| **Script** (GitHub Action con service account) | listone, calendario giornate, statistiche, punteggi, classifiche |
| **Presidente** | impostazioni della lega e rose dopo l'asta |
| **Ogni utente** | la propria iscrizione alla lega e la propria formazione, solo prima della scadenza |

Lo script usa l'Admin SDK, che non passa dalle regole: tutto ciò che è "solo script" nelle regole è semplicemente negato ai client.

## Collezioni

### `players/{playerId}` — listone
| Campo | Tipo | Note |
|---|---|---|
| `name` | string | Nome e cognome |
| `team` | string | Squadra di SuperLega |
| `role` | string | `P`, `S`, `C`, `O` o `L` |
| `active` | bool | `false` se lascia la SuperLega |

`playerId` è `cognome-nome-squadra` senza accenti. Lettura pubblica, scrittura solo script.

### `matchdays/{n}` — giornate
| Campo | Tipo | Note |
|---|---|---|
| `number` | number | 1–22 della regular season |
| `lockAt` | timestamp | 1 minuto prima della prima partita della giornata |
| `status` | string | `open`, `locked`, `scored` |

Sottocollezione `matchdays/{n}/stats/{playerId}` con le statistiche del tabellino (Fase 5). Lettura per utenti autenticati, scrittura solo script.

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
Punteggi di giornata e classifica. Lettura per i membri, scrittura solo script.
