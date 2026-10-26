// La stagione di SuperLega non si cambia a mano: la decide la Lega. Il bot la legge dal sito della Lega e la scrive in
// data/stagione.json ({ anno, campionato, squadre }); da lì la prendono il sito (titolo, intestazione, invito), il
// pannello Admin (passaggio alla stagione nuova) e gli scaricamenti del bot. Qui ci sono solo i nomi e i conti che ne
// derivano, uguali per il sito e per il bot.
(function (root) {
    const dueCifre = n => String(n).slice(-2);
    const nomeDi = anno => `${anno}/${dueCifre(anno + 1)}`;              // 2026 -> "2026/27", anche per le stagioni archiviate
    const breveDi = anno => `${dueCifre(anno)}/${dueCifre(anno + 1)}`;   // 2026 -> "26/27"
    const giornateDi = squadre => 2 * (squadre - 1);                     // andata e ritorno, tutte contro tutte: 22 con 12 squadre

    // Il contenuto di data/stagione.json con i nomi pronti; null se non è valido
    function descrivi(dati) {
        if (!Number.isInteger(dati?.anno)) return null;
        const squadre = Array.isArray(dati.squadre) ? dati.squadre.length : 0;
        return {
            anno: dati.anno,
            nome: nomeDi(dati.anno),
            breve: breveDi(dati.anno),
            squadre,
            giornate: squadre ? giornateDi(squadre) : null,
        };
    }

    const api = { nomeDi, breveDi, giornateDi, descrivi };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Stagione = api;
})(this);
