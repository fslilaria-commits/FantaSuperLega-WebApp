// La stagione di SuperLega: l'unico punto da cambiare ogni estate (il resto è nella lista "Nuova stagione"
// di docs/guida-admin.md). La usano il sito (titolo, intestazione, invito, scontri diretti) e il bot dei dati
// (indirizzi del calendario e delle statistiche della Lega, controlli sul numero di gare).
(function (root) {
    const ANNO = 2026;  // anno di inizio: 2026 = stagione 2026/27
    const SQUADRE = 12; // squadre di SuperLega: andata e ritorno, tutte contro tutte

    const dueCifre = n => String(n).slice(-2);
    const api = {
        ANNO,
        SQUADRE,
        GIORNATE: 2 * (SQUADRE - 1),                      // regular season: 22 con 12 squadre
        breve: `${dueCifre(ANNO)}/${dueCifre(ANNO + 1)}`, // "26/27"
        nome: `${ANNO}/${dueCifre(ANNO + 1)}`,            // "2026/27"
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Stagione = api;
})(this);
