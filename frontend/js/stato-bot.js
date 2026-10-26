// Il bot dei dati gira su un PC (docs/bot-pc.md): se si ferma, nel gioco non arriva più niente e nessuno se ne
// accorge. Qui i due segnali per gli admin, nella scheda La mia giornata e nella routine settimanale:
// - il problema che il bot stesso ha scritto in data/bot.json;
// - i tabellini che dovevano già essere arrivati, per esempio perché il PC è spento da giorni.
(function (root) {
    const GIORNO = 24 * 3600 * 1000;
    // Il tabellino è valido dalle 19 del giorno dopo l'ultima partita e il bot passa ogni sera: dopo 3 giorni è in ritardo
    const RITARDO = 3 * GIORNO;

    const comeData = d => (d?.toDate ? d.toDate() : new Date(d));

    // giornate: quelle del gioco, [{ number, matches: [{ start, moved }] }]; conTabellino: i numeri scaricati dal bot
    function tabelliniInRitardo(giornate, conTabellino, adesso = new Date()) {
        const arrivati = new Set(conTabellino);
        return giornate.filter(g => {
            if (arrivati.has(g.number)) return false;
            const inGiornata = (g.matches || []).filter(m => !m.moved);
            if (!inGiornata.length || inGiornata.some(m => !m.start)) return false;
            const ultima = Math.max(...inGiornata.map(m => comeData(m.start).getTime()));
            return adesso - ultima > RITARDO;
        }).map(g => g.number);
    }

    // data/bot.json ({ esito, dal, errori }): { dal, errori } se il bot ha un problema, altrimenti null
    function problemaBot(stato) {
        if (stato?.esito !== 'errore') return null;
        return { dal: stato.dal ? new Date(stato.dal) : null, errori: Array.isArray(stato.errori) ? stato.errori : [] };
    }

    // Le frasi per gli admin, vuote se va tutto bene. stagioneNuova: il nome della stagione nuova della Lega quando
    // il gioco è ancora a quella finita. In quei giorni il bot ha già tolto i tabellini vecchi e aspetta rose e
    // calendario nuovi: i suoi errori sono normali e i tabellini "mancanti" non sono un ritardo
    function avvisiBot({ giornate, conTabellino, stato, stagioneNuova = null, adesso = new Date(), formatoData = d => d.toLocaleDateString('it-IT') }) {
        const avvisi = [];
        const problema = problemaBot(stato);
        if (stagioneNuova) {
            avvisi.push(`sul sito della Lega è cominciata la stagione ${stagioneNuova}: quando listone e calendario sono pronti, premi «Inizia la stagione» (Admin → Nuova stagione; guida admin, punto 9)`);
            if (problema?.errori.length) avvisi.push(`intanto il bot aspetta i dati della stagione nuova: ${problema.errori.join('; ')} (guida admin, punto 9)`);
            return avvisi;
        }
        if (problema) {
            const dal = problema.dal && !Number.isNaN(problema.dal.getTime()) ? ` dal ${formatoData(problema.dal)}` : '';
            avvisi.push(`il bot dei dati ha un problema${dal}: ${problema.errori.join('; ') || 'vedi il registro sul PC del bot'} (guida admin, punto 7)`);
        }
        const ritardo = tabelliniInRitardo(giornate, conTabellino, adesso);
        if (ritardo.length) {
            avvisi.push(`${ritardo.length === 1 ? `il tabellino della giornata ${ritardo[0]} non è ancora arrivato` : `i tabellini delle giornate ${ritardo.join(', ')} non sono ancora arrivati`}: controlla che il PC del bot sia acceso (guida admin, punto 7)`);
        }
        return avvisi;
    }

    const api = { RITARDO, tabelliniInRitardo, problemaBot, avvisiBot };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.StatoBot = api;
})(this);
