// Riepilogo stagionale dei fanta-punti di ogni giocatore, salvato in un unico documento (meta/statistiche):
// così ogni utente lo legge con una sola lettura invece che una per giocatore e giornata.
(function (root) {
    const r2 = x => Math.round(x * 100) / 100;

    // Contano solo le partite giocate davvero: il punteggio medio delle gare spostate non entra nella media
    const giocata = s => s && s.inCampo && !s.media;

    // Media, presenze e ultima giornata a partire dai punti per giornata (g)
    function completa(players) {
        for (const [id, p] of Object.entries(players)) {
            const voti = Object.entries(p.g).map(([n, fp]) => ({ n: Number(n), fp }));
            if (!voti.length) {
                delete players[id];
                continue;
            }
            p.presenze = voti.length;
            p.media = r2(voti.reduce((a, v) => a + v.fp, 0) / voti.length);
            const ultima = voti.sort((a, b) => b.n - a.n)[0];
            p.ultima = { matchday: ultima.n, fp: ultima.fp };
        }
        return players;
    }

    // Da zero, da tutte le giornate calcolate: giornate = [{ number, stats: { playerId: { fp, inCampo, media } } }]
    function costruisciRiepilogo(giornate) {
        const players = {};
        for (const g of giornate) {
            for (const [id, s] of Object.entries(g.stats)) {
                if (!giocata(s)) continue;
                (players[id] = players[id] || { g: {} }).g[String(g.number)] = s.fp;
            }
        }
        return completa(players);
    }

    // Aggiorna il riepilogo con una giornata (nuova o ricalcolata) senza rileggere le altre
    function aggiornaRiepilogo(riepilogo, numero, punti) {
        const players = {};
        for (const [id, p] of Object.entries(riepilogo || {})) {
            const g = { ...p.g };
            delete g[String(numero)];
            players[id] = { g };
        }
        for (const [id, s] of Object.entries(punti)) {
            if (!giocata(s)) continue;
            (players[id] = players[id] || { g: {} }).g[String(numero)] = s.fp;
        }
        return completa(players);
    }

    // Media di un giocatore nelle giornate prima di una certa (serve per le gare spostate)
    function mediaPrima(riepilogo, id, numero) {
        const voti = Object.entries(riepilogo?.[id]?.g || {}).filter(([n]) => Number(n) < numero).map(([, fp]) => fp);
        return voti.length ? r2(voti.reduce((a, b) => a + b, 0) / voti.length) : 0;
    }

    const api = { costruisciRiepilogo, aggiornaRiepilogo, mediaPrima };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Statistiche = api;
})(this);
