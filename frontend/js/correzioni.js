// Correzioni manuali del tabellino di una giornata, fatte da un admin quando i dati della Lega sono sbagliati
// o un nome non si abbina al listone. Restano salvate (matchdays/{n}/correzioni/tabellino) e si riapplicano
// a ogni calcolo, anche quando il tabellino viene riscaricato.
// Una riga si riconosce da squadra e nome del tabellino: righe = { "<teamId>|<nome>": { id?, stats? } }
//   id assente = abbinamento automatico, id null = la riga non conta, id = giocatore del listone
//   stats = i numeri corretti (i valori derivati e i totali di squadra si ricalcolano da soli)
(function (root) {
    const r1 = x => Math.round(x * 10) / 10;
    const r2 = x => Math.round(x * 100) / 100;

    // I numeri che si correggono a mano; punti, percentuali ed efficienze si ricalcolano come fa la Lega
    const CAMPI = [
        ['set', 'Set giocati'],
        ['serve.tot', 'Battute'], ['serve.ace', 'Ace'], ['serve.err', 'Errori in battuta'],
        ['rec.tot', 'Ricezioni'], ['rec.perf', 'Ricezioni perfette'], ['rec.neg', 'Ricezioni negative'], ['rec.err', 'Errori in ricezione'],
        ['att.tot', 'Attacchi'], ['att.kills', 'Attacchi vinti'], ['att.err', 'Errori in attacco'], ['att.blocked', 'Attacchi murati'],
        ['block.pts', 'Muri vincenti'],
    ];

    const leggi = (s, campo) => campo.split('.').reduce((o, k) => (o == null ? undefined : o[k]), s);

    function chiaveRiga(teamId, nome) {
        return `${teamId}|${nome}`;
    }

    // Riga completa del tabellino a partire dai soli numeri: { set, serve: {...}, rec: {...}, att: {...}, block: {...} }
    function completaStatistiche(n) {
        const v = campo => Number(leggi(n, campo)) || 0;
        const rec = { tot: v('rec.tot'), err: v('rec.err'), neg: v('rec.neg'), perf: v('rec.perf') };
        const att = { tot: v('att.tot'), err: v('att.err'), blocked: v('att.blocked'), kills: v('att.kills') };
        return {
            set: v('set'),
            points: att.kills + v('serve.ace') + v('block.pts'),
            serve: { tot: v('serve.tot'), ace: v('serve.ace'), err: v('serve.err') },
            rec: { ...rec, perfPct: rec.tot ? r1(rec.perf / rec.tot * 100) : 0, eff: rec.tot ? r2((rec.perf - rec.err) / rec.tot) : 0 },
            att: { ...att, killPct: att.tot ? r1(att.kills / att.tot * 100) : 0, eff: att.tot ? r2((att.kills - att.err) / att.tot) : 0 },
            block: { pts: v('block.pts') },
        };
    }

    // Solo i numeri correggibili di una riga, per l'editor e per salvarli
    function numeri(s) {
        const out = {};
        for (const [campo] of CAMPI) {
            const [a, b] = campo.split('.');
            if (b) (out[a] = out[a] || {})[b] = Number(leggi(s, campo)) || 0;
            else out[a] = Number(leggi(s, campo)) || 0;
        }
        return out;
    }

    function stessiNumeri(a, b) {
        return CAMPI.every(([campo]) => (Number(leggi(a, campo)) || 0) === (Number(leggi(b, campo)) || 0));
    }

    // Errori di una correzione: numeri interi non negativi e coerenti tra loro
    function validaStatistiche(n) {
        const errori = [];
        for (const [campo, nome] of CAMPI) {
            const x = leggi(n, campo);
            if (!Number.isInteger(x) || x < 0) errori.push(`${nome}: serve un numero intero, 0 o più`);
        }
        if (errori.length) return errori;
        if (n.set > 5) errori.push('Set giocati: al massimo 5');
        if (n.serve.ace + n.serve.err > n.serve.tot) errori.push('Ace più errori in battuta superano le battute');
        if (n.rec.perf + n.rec.neg + n.rec.err > n.rec.tot) errori.push('Ricezioni perfette, negative ed errori superano le ricezioni');
        if (n.att.kills + n.att.err + n.att.blocked > n.att.tot) errori.push('Attacchi vinti, errori e murati superano gli attacchi');
        return errori;
    }

    // Totali di squadra dopo la correzione di un giocatore: si aggiunge la differenza dei numeri
    function aggiornaTotali(totali, prima, dopo) {
        const t = completaStatistiche(totali);
        for (const [campo] of CAMPI) {
            if (campo === 'set') continue;
            const [a, b] = campo.split('.');
            t[a][b] += (leggi(dopo, campo) || 0) - (leggi(prima, campo) || 0);
        }
        // punti e set della squadra restano quelli della Lega (contano anche gli errori avversari)
        return { ...completaStatistiche(t), name: totali.name, set: totali.set, points: totali.points };
    }

    // Tabellino corretto, abbinamenti forzati per squadra e correzioni che non trovano più la loro riga
    function applicaCorrezioni(tabellino, righe = {}) {
        const copia = JSON.parse(JSON.stringify(tabellino));
        const forzati = {};
        const usate = new Set();
        for (const [teamId, squadra] of Object.entries(copia.teams || {})) {
            squadra.players = squadra.players.map(s => {
                const chiave = chiaveRiga(teamId, s.name);
                const c = righe[chiave];
                if (!c) return s;
                usate.add(chiave);
                if ('id' in c) (forzati[teamId] = forzati[teamId] || {})[s.name] = c.id;
                if (!c.stats) return s;
                const corretta = { ...completaStatistiche(c.stats), name: s.name, corretto: true };
                squadra.totals = aggiornaTotali(squadra.totals, s, corretta);
                return corretta;
            });
        }
        return { tabellino: copia, forzati, inutilizzate: Object.keys(righe).filter(k => !usate.has(k)) };
    }

    const api = { CAMPI, chiaveRiga, completaStatistiche, numeri, stessiNumeri, validaStatistiche, aggiornaTotali, applicaCorrezioni };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Correzioni = api;
})(this);
