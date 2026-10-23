// Punteggi di giornata con le regole del FantaLVF (https://fantaking.gitbook.io/fantalvf/regolamento-fantasy/punteggio-giocatrici)
// applicate ai tabellini della Lega maschile. Le scelte di interpretazione sono spiegate in docs/punteggio.md.
(function (root) {
    const r2 = x => Math.round(x * 100) / 100;

    // Positività della ricezione: ricezioni senza errore e non negative, sul totale (0..1)
    function positivitaRicezione(rec) {
        return rec.tot > 0 ? (rec.tot - rec.err - rec.neg) / rec.tot : 0;
    }

    function bonusRicezione(s, ruolo) {
        const perSet = s.rec.tot / s.set;
        const perf = s.rec.perf / s.set;
        const pos = positivitaRicezione(s.rec);
        const buona = perSet >= 2 && pos >= 0.65;
        if (ruolo === 'L') return (buona ? perf * 6 : perf * 4) + perf * pos * 5;
        return (buona ? perf * 4 : perf * 2) + perf * pos * 6;
    }

    // Moltiplicatore per centrali e schiacciatori: chi è poco coinvolto vale meno
    function moltiplicatoreSC(s) {
        if (s.serve.tot >= 8 || s.att.tot >= 6) return 1;
        if (s.serve.tot >= 4 || s.att.tot >= 3) return 0.5;
        return 0.25;
    }

    function moltiplicatoreLibero(s) {
        if (s.rec.tot >= 7) return 1;
        if (s.rec.tot >= 5) return 0.5;
        return 0.25;
    }

    // Quota della regia del palleggiatore, in base a quante battute ha fatto rispetto alla squadra
    function quotaRegia(s, squadra) {
        const quota = squadra.serve.tot > 0 ? s.serve.tot / squadra.serve.tot : 0;
        if (quota >= 0.10) return 1;
        if (quota > 0.05) return 0.3;
        return 0.1;
    }

    // s: statistiche del giocatore; ctx: { squadra, avversari } (totali delle due squadre), esito: { vinta, tiebreak }
    function calcolaPunteggio(ruolo, s, ctx) {
        if (!s || s.set <= 0) return { fp: 0, voci: {}, inCampo: false };
        const perSet = x => x / s.set;
        const kills = s.att.kills;
        const quotaAttacchi = ctx.squadra.att.tot > 0 ? s.att.tot / ctx.squadra.att.tot : 0;
        let voci;
        let molt = 1;

        switch (ruolo) {
        case 'S':
            voci = {
                attacco: perSet(kills) * 4 + perSet(kills) * s.att.eff * 4,
                muro: 2.5 * s.block.pts,
                ace: 3 * s.serve.ace,
                ricezione: bonusRicezione(s, 'S'),
                coinvolgimento: perSet(s.att.tot),
                errori: -1.5 * s.rec.err - 1 * s.att.err - 1.5 * s.serve.err,
            };
            molt = moltiplicatoreSC(s);
            break;
        case 'C':
            voci = {
                attacco: perSet(kills) * 4,
                muro: perSet(s.block.pts) * 12,
                ace: 3 * s.serve.ace,
                abilitaAttacco: quotaAttacchi >= 0.10 ? s.att.killPct / 3 : s.att.killPct / 3 / 2,
                coinvolgimento: perSet(s.att.tot),
                errori: -1 * s.rec.err - 1.5 * s.att.err - 1.5 * s.serve.err,
            };
            molt = moltiplicatoreSC(s);
            break;
        case 'O':
            voci = {
                attacco: kills + kills * s.att.eff * 1.5,
                muro: 1.5 * s.block.pts,
                ace: 2 * s.serve.ace,
                abilitaAttacco: quotaAttacchi >= 0.25 ? s.att.killPct / 4 : s.att.killPct / 8,
                coinvolgimento: perSet(s.att.tot) / 1.5,
                errori: -1 * s.rec.err - 1 * s.att.err - 1 * s.serve.err,
            };
            break;
        case 'P':
            voci = {
                attacco: 2 * kills,
                muro: 3 * s.block.pts,
                ace: 2 * s.serve.ace,
                regia: (ctx.squadra.att.killPct / 1.5) * quotaRegia(s, ctx.squadra),
                errori: -1 * s.rec.err - 1 * s.att.err - 1 * s.serve.err,
            };
            break;
        case 'L': {
            const avv = ctx.avversari.att;
            voci = {
                punti: 1 * s.points,
                ricezione: bonusRicezione(s, 'L'),
                difesa: avv.tot > 0 ? ((avv.tot - avv.kills) / avv.tot) * 100 / 5 : 0,
                errori: -2 * s.rec.err,
            };
            molt = moltiplicatoreLibero(s);
            break;
        }
        default:
            return { fp: 0, voci: {}, inCampo: true };
        }

        const base = Object.values(voci).reduce((a, b) => a + b, 0);
        const esito = ctx.esito ? (ctx.esito.vinta ? 1 : -1) * (ctx.esito.tiebreak ? 0.01 : 0.02) : 0;
        const fp = r2(base * (1 + esito) * molt);
        return { fp, voci: Object.fromEntries(Object.entries(voci).map(([k, v]) => [k, r2(v)])), molt, esito, inCampo: true };
    }

    // --- Abbinamento dei nomi del tabellino ("Cognome Nome") ai giocatori del listone ---

    function chiaveNome(nome) {
        return String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
    }

    // statsPlayers: [{ name }]; listone: [{ id, name, teamId }]. Prima cerca nella squadra, poi in tutto il listone.
    // forzati: { nome: playerId | null } scelti a mano da un admin (null = la riga non conta)
    function abbinaGiocatori(statsPlayers, teamId, listone, forzati = {}) {
        const abbinati = {};
        const nonTrovati = [];
        const daSquadra = listone.filter(p => p.teamId === teamId);
        for (const s of statsPlayers) {
            if (Object.prototype.hasOwnProperty.call(forzati, s.name)) {
                const scelto = forzati[s.name] && listone.find(p => p.id === forzati[s.name]);
                if (scelto) abbinati[s.name] = { id: scelto.id, altraSquadra: scelto.teamId !== teamId, manuale: true };
                else if (forzati[s.name] !== null) nonTrovati.push(s.name);
                continue;
            }
            const k = chiaveNome(s.name);
            const cerca = elenco => {
                const esatti = elenco.filter(p => chiaveNome(p.name) === k);
                if (esatti.length === 1) return esatti[0];
                const parole = new Set(k.split(' '));
                const simili = elenco.filter(p => {
                    const pk = chiaveNome(p.name).split(' ');
                    const comuni = pk.filter(w => parole.has(w)).length;
                    return comuni >= 2 || (comuni === 1 && (pk.length === 1 || parole.size === 1));
                });
                return simili.length === 1 ? simili[0] : null;
            };
            const trovato = cerca(daSquadra) || cerca(listone);
            if (trovato) abbinati[s.name] = { id: trovato.id, altraSquadra: trovato.teamId !== teamId };
            else nonTrovati.push(s.name);
        }
        return { abbinati, nonTrovati };
    }

    // --- Punteggi di tutti i giocatori di una giornata ---

    // tabellino: data/tabellini/<n>.json; listone: [{ id, name, teamId, role }]; medie: { playerId: media } per le gare spostate;
    // forzati: { teamId: { nome: playerId | null } } abbinamenti scelti a mano (vedi correzioni.js)
    function punteggiGiornata(tabellino, listone, medie = {}, forzati = {}) {
        const perId = Object.fromEntries(listone.map(p => [p.id, p]));
        const punti = {};
        const nonTrovati = [];

        for (const m of tabellino.matches) {
            if (m.moved) continue;
            for (const [teamId, avvId, propri, altri] of [[m.homeId, m.awayId, 'home', 'away'], [m.awayId, m.homeId, 'away', 'home']]) {
                const squadra = tabellino.teams[teamId];
                const avversari = tabellino.teams[avvId];
                if (!squadra || !avversari || !m.result) continue;
                const esito = { vinta: m.result[propri] > m.result[altri], tiebreak: m.result.home + m.result.away === 5 };
                const { abbinati, nonTrovati: nt } = abbinaGiocatori(squadra.players, teamId, listone, forzati[teamId]);
                nonTrovati.push(...nt.map(n => `${n} (${squadra.team})`));
                for (const s of squadra.players) {
                    const a = abbinati[s.name];
                    if (!a) continue;
                    const ruolo = perId[a.id].role;
                    const r = calcolaPunteggio(ruolo, s, { squadra: squadra.totals, avversari: avversari.totals, esito });
                    punti[a.id] = { ...r, ruolo, team: squadra.team, set: s.set, nomeTabellino: s.name, altraSquadra: a.altraSquadra, corretto: !!(s.corretto || a.manuale) };
                }
            }
        }

        // Giocatori delle squadre con la gara spostata: punteggio medio (come nel FantaLVF)
        const squadreSpostate = new Set(tabellino.matches.filter(m => m.moved).flatMap(m => [m.homeId, m.awayId]));
        for (const p of listone) {
            if (squadreSpostate.has(p.teamId) && !punti[p.id]) {
                punti[p.id] = { fp: r2(medie[p.id] || 0), voci: {}, inCampo: false, media: true, ruolo: p.role };
            }
        }
        return { punti, nonTrovati };
    }

    // --- Punteggio di una fanta-squadra: titolari al 100% (capitano x2), panchina al 50% ---

    // rosa (facoltativa): i giocatori in rosa alla scadenza. Chi nel frattempo è passato a un'altra squadra
    // (per esempio con una correzione della rosa) resta in formazione ma prende 0, così non conta per due squadre
    function punteggioSquadra(lineup, punti, rosa = null) {
        const dettaglio = [];
        const fuori = id => !!rosa && !rosa.has(id);
        const voce = id => (fuori(id) ? { fp: 0 } : punti[id] || { fp: 0 });
        for (const [slot, id] of Object.entries(lineup.starters)) {
            const p = voce(id);
            // Il capitano non raddoppia se prende il punteggio medio (gara spostata), come per le squadre a riposo
            const fattore = id === lineup.captain && !p.media ? 2 : 1;
            dettaglio.push({ id, slot, fp: p.fp, fattore, punti: r2(p.fp * fattore), media: !!p.media, fuoriRosa: fuori(id) });
        }
        for (const id of lineup.bench) {
            const p = voce(id);
            dettaglio.push({ id, slot: 'panchina', fp: p.fp, fattore: 0.5, punti: r2(p.fp * 0.5), media: !!p.media, fuoriRosa: fuori(id) });
        }
        // Il totale è la somma delle righe già arrotondate, così torna al centesimo con quello che si vede
        return { totale: r2(dettaglio.reduce((a, d) => a + d.punti, 0)), dettaglio };
    }

    // La formazione valida per una giornata: quella salvata, altrimenti l'ultima precedente
    function formazionePer(giornata, formazioni) {
        return formazioni
            .filter(f => f.matchday <= giornata)
            .sort((a, b) => b.matchday - a.matchday)[0] || null;
    }

    const api = { calcolaPunteggio, abbinaGiocatori, punteggiGiornata, punteggioSquadra, formazionePer };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Punteggi = api;
})(this);
