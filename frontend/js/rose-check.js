// Controlli sulle rose inserite dal Presidente dopo l'asta (Modalità Leghe FantaLVF).
// Alcuni controlli le regole Firestore non li possono fare (esclusività tra squadre, massimo per club,
// budget): li fa questo modulo prima del salvataggio.
(function (root) {
    const MAX_PER_RUOLO = { P: 2, S: 4, C: 3, O: 2, L: 1 };
    const TOTALE = 12;
    const MAX_PER_CLUB = 4;

    // picks: [{ id, role, price }] -> documento rosa da salvare
    function buildRoster(picks, budget) {
        const roster = { P: [], S: [], C: [], O: [], L: [], all: [], prices: {} };
        for (const p of picks) {
            roster[p.role].push(p.id);
            roster.all.push(p.id);
            roster.prices[p.id] = p.price;
        }
        roster.creditsLeft = budget - picks.reduce((tot, p) => tot + p.price, 0);
        return roster;
    }

    // roster salvato -> picks, per riaprirlo nell'editor
    function rosterToPicks(roster) {
        if (!roster) return [];
        return Object.keys(MAX_PER_RUOLO).flatMap(role =>
            (roster[role] || []).map(id => ({ id, role, price: roster.prices?.[id] ?? 0 })));
    }

    // playersById: { id: { team, active, name } }; altreRose: { uid: roster } delle altre squadre della lega
    function checkRoster({ picks, budget, playersById, altreRose = {} }) {
        const errors = [];
        const warnings = [];

        for (const [role, max] of Object.entries(MAX_PER_RUOLO)) {
            const n = picks.filter(p => p.role === role).length;
            if (n > max) errors.push(`troppi giocatori nel ruolo ${role}: ${n} su ${max}`);
        }

        const visti = new Set();
        for (const p of picks) {
            if (visti.has(p.id)) errors.push(`${nome(p.id, playersById)} è inserito due volte`);
            visti.add(p.id);
            if (!Number.isInteger(p.price) || p.price < 0) errors.push(`prezzo non valido per ${nome(p.id, playersById)}`);
            if (playersById[p.id]?.active === false) warnings.push(`${nome(p.id, playersById)} non è più in SuperLega`);
        }

        const proprietari = new Map();
        for (const [uid, roster] of Object.entries(altreRose)) {
            for (const id of roster?.all || []) proprietari.set(id, uid);
        }
        for (const p of picks) {
            if (proprietari.has(p.id)) errors.push(`${nome(p.id, playersById)} è già nella rosa di un'altra squadra`);
        }

        const perClub = {};
        for (const p of picks) {
            const club = playersById[p.id]?.team;
            if (club) perClub[club] = (perClub[club] || 0) + 1;
        }
        for (const [club, n] of Object.entries(perClub)) {
            if (n > MAX_PER_CLUB) errors.push(`${n} giocatori di ${club}: il massimo è ${MAX_PER_CLUB}`);
        }

        const spesi = picks.reduce((tot, p) => tot + (Number.isFinite(p.price) ? p.price : 0), 0);
        if (spesi > budget) errors.push(`spesi ${spesi} crediti su ${budget} disponibili`);

        return { errors, warnings, complete: picks.length === TOTALE && errors.length === 0, creditsLeft: budget - spesi };
    }

    function nome(id, playersById) {
        return playersById[id]?.name || id;
    }

    const api = { MAX_PER_RUOLO, TOTALE, MAX_PER_CLUB, buildRoster, rosterToPicks, checkRoster };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RoseCheck = api;
})(this);
