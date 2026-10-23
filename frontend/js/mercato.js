// Mercato della Modalità Leghe FantaLVF (regolamento-leghe/mercato e scambio-di-giocatrici):
// - svincolati a offerta segreta: si lascia un proprio giocatore dello stesso ruolo e si aggiungono crediti;
//   l'offerta vale (valore del giocatore lasciato + crediti); vince la più alta, a parità chi è più in basso
//   in classifica; il nuovo arrivato prende il posto e il valore del giocatore lasciato più i crediti
// - scambi tra squadre: stesse regole, eseguiti quando l'altra squadra accetta
// Senza server le assegnazioni le applica il Presidente con un clic: questo modulo calcola cosa succede.
(function (root) {
    // Il limite per club è lo stesso delle rose: un'unica fonte in rose-check.js
    const RoseCheck = typeof module !== 'undefined' && module.exports ? require('./rose-check.js') : root.RoseCheck;
    const ORA = 3600 * 1000;
    const DURATA_PARTITA = 3 * ORA; // la giornata finisce 3 ore dopo l'inizio dell'ultima partita
    const ANTICIPO_OFFERTE = 3 * ORA; // le offerte chiudono 3 ore prima della scadenza (come nelle regole Firestore)

    // matchdays: [{ number, label, lockAt: Date, matches: [{ start, moved }] }]
    function finestraMercato(matchdays, now) {
        const ordinate = matchdays.slice().sort((a, b) => a.number - b.number);
        const prossima = ordinate.find(g => g.lockAt > now);
        if (!prossima) return { aperto: false, offerteAperte: false, matchday: null };
        const precedente = ordinate.find(g => g.number === prossima.number - 1);
        const apre = precedente ? fineGiornata(precedente) : new Date(0);
        const offerteFino = new Date(prossima.lockAt.getTime() - ANTICIPO_OFFERTE);
        const aperto = now >= apre && now < prossima.lockAt;
        return {
            matchday: prossima.number,
            label: prossima.label,
            apre,
            offerteFino,
            chiude: prossima.lockAt,
            aperto,
            offerteAperte: aperto && now < offerteFino,
        };
    }

    function fineGiornata(g) {
        const inizi = (g.matches || []).filter(m => !m.moved && m.start).map(m => new Date(m.start).getTime());
        if (!inizi.length) return new Date(g.lockAt.getTime() + 24 * ORA);
        return new Date(Math.max(...inizi) + DURATA_PARTITA);
    }

    function copia(rosters) {
        return JSON.parse(JSON.stringify(rosters));
    }

    // Sostituisce un giocatore con un altro nella stessa posizione della rosa
    function sostituisci(roster, ruolo, fuori, dentro, valore) {
        roster[ruolo] = roster[ruolo].map(id => (id === fuori ? dentro : id));
        roster.all = roster.all.map(id => (id === fuori ? dentro : id));
        delete roster.prices[fuori];
        roster.prices[dentro] = valore;
    }

    function troppiDelClub(roster, playersById) {
        return RoseCheck.clubOltreIlLimite(roster.all, playersById).length > 0;
    }

    function valoreOfferta(offerta, rosters) {
        return (rosters[offerta.uid]?.prices?.[offerta.playerOut] ?? 0) + (offerta.extra || 0);
    }

    // offers: offerte attive [{ id, uid, playerIn, playerOut, role, extra, createdAt }];
    // posizione: { uid: posizione in classifica, 0 = primo }
    function risolviOfferte({ offers, rosters, posizione, playersById }) {
        const lavoro = copia(rosters);
        const posseduti = new Set(Object.values(lavoro).flatMap(r => r.all || []));
        const assegnati = new Set();
        const vinte = [];
        const perse = [];
        const movimenti = [];

        const ordinate = offers
            .map(o => ({ ...o, valore: valoreOfferta(o, rosters) }))
            .sort((a, b) => b.valore - a.valore
                || (posizione[b.uid] ?? 0) - (posizione[a.uid] ?? 0) // a parità vince chi è più in basso
                || (a.createdAt ?? 0) - (b.createdAt ?? 0));

        for (const o of ordinate) {
            const rosa = lavoro[o.uid];
            let motivo = null;
            if (assegnati.has(o.playerIn)) motivo = "assegnato a un'offerta più alta";
            else if (posseduti.has(o.playerIn)) motivo = 'non è più svincolato';
            else if (!rosa || !(rosa[o.role] || []).includes(o.playerOut)) motivo = 'il giocatore da lasciare non è più nella rosa';
            else if (playersById[o.playerIn] && playersById[o.playerIn].role !== o.role) motivo = 'ruolo diverso';
            else if ((rosa.creditsLeft ?? 0) < (o.extra || 0)) motivo = 'crediti insufficienti';
            if (!motivo) {
                const prova = copia({ r: rosa }).r;
                sostituisci(prova, o.role, o.playerOut, o.playerIn, o.valore);
                if (troppiDelClub(prova, playersById)) motivo = 'più di 4 giocatori dello stesso club';
            }
            if (motivo) {
                perse.push({ ...o, motivo });
                continue;
            }
            sostituisci(rosa, o.role, o.playerOut, o.playerIn, o.valore);
            rosa.creditsLeft = (rosa.creditsLeft ?? 0) - (o.extra || 0);
            posseduti.delete(o.playerOut);
            posseduti.add(o.playerIn);
            assegnati.add(o.playerIn);
            vinte.push(o);
            movimenti.push({ tipo: 'svincolato', uid: o.uid, playerIn: o.playerIn, playerOut: o.playerOut, valore: o.valore, extra: o.extra || 0 });
        }
        return { vinte, perse, rosters: lavoro, movimenti };
    }

    // trade: { from, to, give (di from), take (di to), role, extra (crediti da from a to) }
    function eseguiScambio(rosters, trade, playersById) {
        const lavoro = copia(rosters);
        const da = lavoro[trade.from];
        const a = lavoro[trade.to];
        const extra = trade.extra || 0;
        let motivo = null;
        if (!da || !(da[trade.role] || []).includes(trade.give)) motivo = 'chi propone non ha più il giocatore offerto';
        else if (!a || !(a[trade.role] || []).includes(trade.take)) motivo = "l'altra squadra non ha più il giocatore richiesto";
        else if ((da.creditsLeft ?? 0) < extra) motivo = 'crediti insufficienti';
        if (motivo) return { ok: false, motivo, rosters };

        const valoreGive = da.prices[trade.give] ?? 0;
        const valoreTake = a.prices[trade.take] ?? 0;
        sostituisci(da, trade.role, trade.give, trade.take, valoreGive + extra);
        sostituisci(a, trade.role, trade.take, trade.give, valoreTake);
        da.creditsLeft = (da.creditsLeft ?? 0) - extra;
        a.creditsLeft = (a.creditsLeft ?? 0) + extra;
        if (troppiDelClub(da, playersById) || troppiDelClub(a, playersById)) {
            return { ok: false, motivo: 'più di 4 giocatori dello stesso club', rosters };
        }
        return {
            ok: true,
            rosters: lavoro,
            movimenti: [
                { tipo: 'scambio', uid: trade.from, playerIn: trade.take, playerOut: trade.give, valore: valoreGive + extra, extra },
                { tipo: 'scambio', uid: trade.to, playerIn: trade.give, playerOut: trade.take, valore: valoreTake, extra: -extra },
            ],
        };
    }

    // Una formazione dopo i trasferimenti avvenuti tra il suo salvataggio (savedAt, ms) e un certo momento:
    // chi arriva prende il posto di chi parte. I trasferimenti precedenti al salvataggio li ha già visti chi l'ha salvata.
    function applicaSostituzioni(lineup, movimenti, primaDi) {
        if (!lineup) return lineup;
        const l = { ...lineup, starters: { ...lineup.starters }, bench: lineup.bench.slice() };
        const salvataIl = lineup.savedAt ?? 0;
        const validi = movimenti.filter(m => m.at > salvataIl && m.at < primaDi).sort((a, b) => a.at - b.at);
        for (const m of validi) {
            for (const slot of Object.keys(l.starters)) if (l.starters[slot] === m.playerOut) l.starters[slot] = m.playerIn;
            l.bench = l.bench.map(id => (id === m.playerOut ? m.playerIn : id));
            if (l.captain === m.playerOut) l.captain = m.playerIn;
        }
        return l;
    }

    // Crediti già impegnati nelle offerte attive di una squadra
    function creditiImpegnati(offerte, uid, tranneId) {
        return offerte
            .filter(o => o.uid === uid && o.status === 'active' && o.id !== tranneId)
            .reduce((tot, o) => tot + (o.extra || 0), 0);
    }

    const api = { ANTICIPO_OFFERTE, finestraMercato, risolviOfferte, eseguiScambio, applicaSostituzioni, creditiImpegnati };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Mercato = api;
})(this);
