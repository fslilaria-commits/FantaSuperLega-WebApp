// Controlli sulle rose inserite dal Presidente dopo l'asta (Modalità Leghe FantaLVF).
// Alcuni controlli le regole Firestore non li possono fare (esclusività tra squadre, massimo per club,
// budget): li fa questo modulo prima del salvataggio. Il limite per club lo usa anche il mercato.
(function (root) {
    const MAX_PER_RUOLO = { P: 2, S: 4, C: 3, O: 2, L: 1 };
    const TOTALE = 12;
    const MAX_PER_CLUB = 4;

    // ids -> { club: quanti giocatori }
    function contaPerClub(ids, playersById) {
        const perClub = {};
        for (const id of ids) {
            const club = playersById[id]?.team;
            if (club) perClub[club] = (perClub[club] || 0) + 1;
        }
        return perClub;
    }

    function clubOltreIlLimite(ids, playersById) {
        return Object.entries(contaPerClub(ids, playersById)).filter(([, n]) => n > MAX_PER_CLUB);
    }

    function spesa(picks) {
        return picks.reduce((tot, p) => tot + (Number.isFinite(p.price) ? p.price : 0), 0);
    }

    // Crediti residui. Senza riferimento: budget meno i prezzi (rosa nuova, dopo l'asta).
    // Con riferimento (la rosa già salvata): si applica solo la differenza di prezzi, così i crediti
    // guadagnati o spesi al mercato non si perdono quando il Presidente risalva la rosa.
    function creditiResidui(picks, budget, riferimento) {
        if (riferimento && Number.isFinite(riferimento.creditsLeft)) return riferimento.creditsLeft - (spesa(picks) - riferimento.spesi);
        return budget - spesa(picks);
    }

    // La rosa salvata come riferimento per creditiResidui
    function riferimentoDa(roster) {
        if (!roster) return null;
        return { creditsLeft: roster.creditsLeft, spesi: spesa(rosterToPicks(roster)) };
    }

    // picks: [{ id, role, price }] -> documento rosa da salvare
    function buildRoster(picks, budget, riferimento) {
        const roster = { P: [], S: [], C: [], O: [], L: [], all: [], prices: {} };
        for (const p of picks) {
            roster[p.role].push(p.id);
            roster.all.push(p.id);
            roster.prices[p.id] = p.price;
        }
        roster.creditsLeft = creditiResidui(picks, budget, riferimento);
        return roster;
    }

    // roster salvato -> picks, per riaprirlo nell'editor
    function rosterToPicks(roster) {
        if (!roster) return [];
        return Object.keys(MAX_PER_RUOLO).flatMap(role =>
            (roster[role] || []).map(id => ({ id, role, price: roster.prices?.[id] ?? 0 })));
    }

    // playersById: { id: { team, active, name } }; altreRose: { uid: roster } delle altre squadre della lega;
    // riferimento: la rosa già salvata di questa squadra (per i crediti), se c'è
    function checkRoster({ picks, budget, playersById, altreRose = {}, riferimento = null }) {
        const errors = [];
        const warnings = [];
        const nome = id => playersById[id]?.name || id;

        for (const [role, max] of Object.entries(MAX_PER_RUOLO)) {
            const n = picks.filter(p => p.role === role).length;
            if (n > max) errors.push(`troppi giocatori nel ruolo ${role}: ${n} su ${max}`);
        }

        const visti = new Set();
        for (const p of picks) {
            if (visti.has(p.id)) errors.push(`${nome(p.id)} è inserito due volte`);
            visti.add(p.id);
            if (!Number.isInteger(p.price) || p.price < 0) errors.push(`prezzo non valido per ${nome(p.id)}`);
            if (playersById[p.id]?.active === false) warnings.push(`${nome(p.id)} non è più in SuperLega`);
        }

        const altrui = new Set(Object.values(altreRose).flatMap(r => r?.all || []));
        for (const p of picks) {
            if (altrui.has(p.id)) errors.push(`${nome(p.id)} è già nella rosa di un'altra squadra`);
        }

        for (const [club, n] of clubOltreIlLimite(picks.map(p => p.id), playersById)) {
            errors.push(`${n} giocatori di ${club}: il massimo è ${MAX_PER_CLUB}`);
        }

        const creditsLeft = creditiResidui(picks, budget, riferimento);
        if (creditsLeft < 0) errors.push(`crediti insufficienti: ne mancano ${-creditsLeft}`);

        return { errors, warnings, complete: picks.length === TOTALE && errors.length === 0, creditsLeft };
    }

    const api = { MAX_PER_RUOLO, TOTALE, MAX_PER_CLUB, contaPerClub, clubOltreIlLimite, riferimentoDa, buildRoster, rosterToPicks, checkRoster };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RoseCheck = api;
})(this);
