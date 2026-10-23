// Riepilogo stagionale dei fanta-punti di ogni giocatore, salvato in un unico documento (meta/statistiche):
// così ogni utente lo legge con una sola lettura invece che una per giocatore e giornata.
(function (root) {
    const r2 = x => Math.round(x * 100) / 100;

    // giornate: [{ number, stats: { playerId: { fp, inCampo, media } } }]
    function costruisciRiepilogo(giornate) {
        const players = {};
        for (const g of giornate.slice().sort((a, b) => a.number - b.number)) {
            for (const [id, s] of Object.entries(g.stats)) {
                // Contano solo le partite giocate davvero: il punteggio medio delle gare spostate non entra nella media
                if (!s.inCampo || s.media) continue;
                const p = players[id] = players[id] || { g: {} };
                p.g[String(g.number)] = s.fp;
            }
        }
        for (const p of Object.values(players)) {
            const voti = Object.entries(p.g).map(([n, fp]) => ({ n: Number(n), fp }));
            p.presenze = voti.length;
            p.media = r2(voti.reduce((a, v) => a + v.fp, 0) / voti.length);
            const ultima = voti.sort((a, b) => b.n - a.n)[0];
            p.ultima = { matchday: ultima.n, fp: ultima.fp };
        }
        return players;
    }

    const api = { costruisciRiepilogo };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Statistiche = api;
})(this);
