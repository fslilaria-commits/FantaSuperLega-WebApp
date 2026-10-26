# Punteggio dei giocatori

Il punteggio segue le regole del [FantaLVF](https://fantaking.gitbook.io/fantalvf/regolamento-fantasy/punteggio-giocatrici), applicate ai tabellini ufficiali della Lega maschile. Il codice è in `frontend/js/punteggi.js`, con i test in `tests/unit/punteggi.test.js`.

## Da dove arrivano i dati

La pagina di ogni partita sul sito della Lega (`legavolley.it/match/…`), con il tabellino di tutte e due le squadre (`backend-bot/genera-tabellini.js`). Le pagine statistiche della Lega hanno gli stessi numeri, ma il `robots.txt` del sito chiede ai programmi di non leggerle. I dati sono verificati dalla Lega dalle 19 del giorno dopo l'ultima partita; il bot li salva in `data/tabellini/<giornata>.json` e un admin li applica dal pannello Admin.

Per ogni giocatore: set giocati (quelli con la posizione di partenza o l'asterisco di chi è entrato), punti, battute (totali, ace, errori), ricezioni (totali, errori, % positive, % perfette), attacchi (totali, errori, murati, vincenti), muri punto. Per ogni squadra la riga dei totali. Dalle percentuali tornano i conteggi: perfette = totali × % perfette; le **negative** sono le ricezioni né sbagliate né positive (totali − errori − positive), come la colonna «Neg.» delle pagine statistiche. Efficienze e percentuali si calcolano come le arrotonda la Lega. Sulla 1ª giornata 2026/27 i tabellini rifatti dalle pagine partita sono identici a quelli presi dalle pagine statistiche, giocatore per giocatore.

### Correzioni manuali

Se un nome del tabellino non si abbina al listone o un numero è sbagliato, un admin lo corregge dal **pannello Admin → Tabellini e punteggi → Controlla tabellino → Correzioni manuali** (`frontend/js/correzioni.js`). Per ogni riga del tabellino (squadra + nome) si può:

- abbinarla a mano a un giocatore del listone, oppure dire che **non conta**;
- correggere i numeri (set, battute, ricezioni, attacchi, muri). Punti, percentuali ed efficienze si ricalcolano come fa la Lega (punti = attacchi vincenti + ace + muri; efficienza attacco = (vincenti − errori) / totali) e i totali di squadra si aggiornano della differenza; punti e set della squadra restano quelli della Lega.

Le correzioni restano salvate in `matchdays/{n}/correzioni/tabellino` e si riapplicano a ogni calcolo, anche quando il tabellino viene riscaricato; quelle la cui riga non c'è più vengono segnalate. Dopo una correzione serve "Calcola e applica". I punti calcolati da una riga corretta hanno `corretto: true`.

## Voci per ruolo

"Per set" significa diviso i set giocati dal giocatore.

| Voce | Schiacciatore | Centrale | Opposto | Palleggiatore | Libero |
|---|---|---|---|---|---|
| Attacco | vincenti/set × 4 + vincenti/set × eff. att. × 4 | vincenti/set × 4 | vincenti + vincenti × eff. att. × 1,5 | vincenti × 2 | — |
| Punto | — | — | — | — | punti × 1 |
| Muro | muri × 2,5 | muri/set × 12 | muri × 1,5 | muri × 3 | — |
| Ace | × 3 | × 3 | × 2 | × 2 | — |
| Ricezione | vedi sotto | — | — | — | vedi sotto |
| Abilità attacco | — | % vincenti / 3 (÷2 se meno del 10% degli attacchi di squadra) | % vincenti / 4 (/8 se meno del 25%) | — | — |
| Regia | — | — | — | % attacco di squadra / 1,5 × quota | — |
| Difesa | — | — | — | — | % attacchi avversari non a punto / 5 |
| Coinvolgimento | attacchi/set | attacchi/set | attacchi/set / 1,5 | — | — |
| Errore ricezione | −1,5 | −1 | −1 | −1 | −2 |
| Errore attacco | −1 | −1,5 | −1 | −1 | — |
| Errore battuta | −1,5 | −1,5 | −1 | −1 | — |

**Ricezione** (schiacciatore / libero): se le ricezioni per set sono almeno 2 e la positività è almeno il 65%, perfette/set × 4 (libero × 6), altrimenti × 2 (libero × 4); in entrambi i casi più perfette/set × positività × 6 (libero × 5).

**Regia**: la quota vale 100% se il palleggiatore ha fatto almeno il 10% delle battute di squadra, 30% tra 5% e 10%, 10% sotto il 5%.

**Vittoria / sconfitta**: +2% / −2% del punteggio, ±1% se la partita finisce al tie-break.

**Moltiplicatori di coinvolgimento**
- Centrali e schiacciatori: ×1 con almeno 8 battute o 6 attacchi; ×0,5 con almeno 4 battute o 3 attacchi; altrimenti ×0,25.
- Libero: ×1 con almeno 7 ricezioni; ×0,5 con almeno 5; altrimenti ×0,25.

Chi non entra in campo prende 0.

## Scelte di interpretazione

Il regolamento FantaLVF usa alcuni termini che i tabellini della Lega maschile non riportano allo stesso modo. Le scelte fatte:

| Termine FantaLVF | Cosa usiamo |
|---|---|
| Efficienza attacco ("Eff. Attacco", "%Eff att") | Efficienza della Lega: (vincenti − errori) / totali |
| % positività attacco | % attacchi vincenti |
| Ricezioni perfette | Ricezioni "Exc." della Lega |
| Efficienza ricezione ("Eff. Ric", soglia 65%) | **Positività**: ricezioni positive e perfette (+ e #) / ricezioni, la «Pos%» del tabellino della Lega. Non la colonna «Effic.» delle pagine statistiche, (perfette − errori) / ricezioni: con quella la soglia del 65% non la supera quasi nessuno, nemmeno tra le migliori libere della Serie A1 femminile (al massimo circa il 40%) |
| % attacco di squadra | % attacchi vincenti della squadra |

## Fanta-squadra

- Titolari al 100%, capitano ×2, panchina (gli altri 7 della rosa da 14) al 50%.
- Il totale è la somma delle righe arrotondate al centesimo.
- Senza formazione salvata per la giornata vale l'ultima formazione precedente.
- **Gare spostate** (più di 4 giorni prima o 3 dopo la data della giornata): i giocatori di quelle squadre prendono la loro **media stagionale** e, se capitani, non raddoppiano.

## Taratura da verificare

Sulla 1ª giornata (124 giocatori in campo) le medie per ruolo sono: palleggiatori 26,3, opposti 24,1, centrali 19,7, schiacciatori 14,7, liberi 9,6. Le formule FantaLVF sono pensate per il campionato femminile, dove le ricezioni positive sono molto più frequenti: nel maschile schiacciatori e liberi superano raramente la soglia del 65% e finiscono sotto gli altri ruoli. Dopo qualche giornata conviene decidere se tenere le formule così o tarare soglie e pesi della ricezione.
