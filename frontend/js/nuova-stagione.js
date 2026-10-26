// Passaggio alla stagione nuova (pulsante "Inizia la stagione" del pannello Admin): quando si può fare e che cosa
// si archivia. Letture e scritture su Firestore sono in admin-stagione.js.
(function (root) {
    const inNode = typeof module !== 'undefined' && module.exports;
    const Scontri = inNode ? require('./scontri.js') : root.Scontri;
    const Stagione = inNode ? require('./stagione.js') : root.Stagione;
    const MIN_GIOCATORI_PER_SQUADRA = 10; // come il controllo del bot sul listone

    // s: annoGioco (meta/stagione), annoLega (data/stagione.json: la stagione che il bot ha letto dal sito della Lega,
    //    null se manca), squadre di quella stagione, giocatori e giornate nelle proposte del bot (null se manca il file),
    //    daGiocare: giornate nel gioco con la scadenza ancora da passare; daCompletare: meta/stagione dice che il
    //    passaggio si è interrotto dopo la cancellazione (il gioco è già alla stagione nuova, mancano listone e calendario).
    // stato: 'in-corso' (niente da fare), 'da-preparare' (motivi dice cosa manca), 'pronta' o 'da-completare'.
    // Il passaggio si apre solo quando la Lega è a una stagione successiva a quella del gioco. Senza la stagione
    // del gioco non si cancella niente: la segna il pannello alla prima apertura.
    function controllaPassaggio(s) {
        const completa = s.daCompletare === true && s.annoGioco != null && s.annoGioco === s.annoLega;
        if (!completa && (s.annoGioco == null || s.annoLega == null || s.annoLega <= s.annoGioco)) return { stato: 'in-corso', motivi: [] };
        const motivi = [];
        // Ripresa: le giornate nel gioco possono essere già quelle nuove, quindi non contano
        if (!completa && s.daGiocare > 0) motivi.push(`la stagione nel gioco non è finita: ${s.daGiocare === 1 ? 'c\'è ancora 1 giornata' : `ci sono ancora ${s.daGiocare} giornate`} da giocare`);
        if (!(s.squadre >= 2)) {
            motivi.push(`il bot non ha ancora trovato le squadre della stagione ${Stagione.nomeDi(s.annoLega)}`);
        } else {
            if (!(s.giocatori >= s.squadre * MIN_GIOCATORI_PER_SQUADRA)) motivi.push('manca il listone nuovo (la Lega pubblica le rose in estate)');
            if (s.giornate !== Stagione.giornateDi(s.squadre)) motivi.push('manca il calendario nuovo (la Lega lo pubblica in estate)');
        }
        if (motivi.length) return { stato: 'da-preparare', motivi };
        return { stato: completa ? 'da-completare' : 'pronta', motivi };
    }

    // L'anno della stagione di un calendario già nel gioco, dalla prima scadenza: le giornate da luglio a dicembre
    // sono della stagione che comincia quell'anno, quelle da gennaio a giugno di quella cominciata l'anno prima
    function annoDelCalendario(primaScadenza) {
        const d = new Date(primaScadenza);
        if (Number.isNaN(d.getTime())) return null;
        return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    }

    // Classifica finale come la mostra la scheda Lega. members: [{ uid, teamName, joinedAt (millisecondi) }]
    function classificaFinale({ members, standings, mode, presidentUid }) {
        return Scontri.ordinaClassifica(members, standings, mode).map((m, i) => {
            const c = standings[m.uid] || {};
            const riga = { pos: i + 1, squadra: m.teamName, total: c.total ?? 0 };
            if (m.uid === presidentUid) riga.presidente = true;
            if (mode === 'scontri') {
                Object.assign(riga, { points: c.points ?? 0, won: c.won ?? 0, tbWon: c.tbWon ?? 0, tbLost: c.tbLost ?? 0, lost: c.lost ?? 0 });
            }
            return riga;
        });
    }

    const idArchivio = (anno, leagueId) => `${anno}_${leagueId}`;

    // Documento archivio/{anno}_{lega}, senza archiviatoAt e archiviatoBy (li aggiunge chi lo scrive)
    function archivioLega({ anno, lega, members, standings }) {
        const modalita = lega.settings?.mode === 'scontri' ? 'scontri' : 'classifica';
        return {
            anno,
            stagione: Stagione.nomeDi(anno),
            lega: lega.name,
            modalita,
            uids: members.map(m => m.uid),
            classifica: classificaFinale({ members, standings, mode: modalita, presidentUid: lega.presidentUid }),
        };
    }

    const api = { MIN_GIOCATORI_PER_SQUADRA, controllaPassaggio, annoDelCalendario, classificaFinale, idArchivio, archivioLega };
    if (inNode) module.exports = api;
    else root.NuovaStagione = api;
})(this);
