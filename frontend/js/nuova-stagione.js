// Passaggio alla stagione nuova (pulsante "Inizia la stagione" del pannello Admin): quando si può fare e che cosa
// si archivia. Letture e scritture su Firestore sono in admin-stagione.js.
(function (root) {
    const inNode = typeof module !== 'undefined' && module.exports;
    const Scontri = inNode ? require('./scontri.js') : root.Scontri;
    const Stagione = inNode ? require('./stagione.js') : root.Stagione;
    const MIN_GIOCATORI_PER_SQUADRA = 10; // come il controllo del bot sul listone

    // s: annoGioco (meta/stagione), annoCodice (stagione.js), annoDati (data/stagione.json, null se manca),
    //    giocatori e giornate nelle proposte del bot (null se manca il file), squadre e giornateAttese della stagione,
    //    daGiocare: giornate nel gioco con la scadenza ancora da passare.
    // stato: 'in-corso' (niente da fare), 'da-preparare' (motivi dice cosa manca) o 'pronta'.
    // Senza la stagione del gioco non si cancella niente: la segna il pannello alla prima apertura.
    function controllaPassaggio(s) {
        if (s.annoGioco == null || s.annoCodice <= s.annoGioco) return { stato: 'in-corso', motivi: [] };
        const motivi = [];
        if (s.daGiocare > 0) motivi.push(`la stagione nel gioco non è finita: ${s.daGiocare === 1 ? 'c\'è ancora 1 giornata' : `ci sono ancora ${s.daGiocare} giornate`} da giocare`);
        if (s.annoDati !== s.annoCodice) {
            motivi.push(`il bot non ha ancora preparato i dati della stagione ${Stagione.nomeDi(s.annoCodice)}`);
        } else {
            if (!(s.giocatori >= s.squadre * MIN_GIOCATORI_PER_SQUADRA)) motivi.push('manca il listone nuovo (la Lega pubblica le rose in estate)');
            if (s.giornate !== s.giornateAttese) motivi.push('manca il calendario nuovo (la Lega lo pubblica in estate)');
        }
        return { stato: motivi.length ? 'da-preparare' : 'pronta', motivi };
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

    const api = { MIN_GIOCATORI_PER_SQUADRA, controllaPassaggio, classificaFinale, idArchivio, archivioLega };
    if (inNode) module.exports = api;
    else root.NuovaStagione = api;
})(this);
