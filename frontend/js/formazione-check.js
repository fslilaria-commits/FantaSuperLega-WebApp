// Formazione di giornata: 7 titolari (P, S1, S2, C1, C2, O, L) presi dalla propria rosa, un capitano
// tra i titolari (punti x2); gli altri della rosa (7 su 14) vanno in panchina (punti al 50%).
(function (root) {
    const RoseCheck = typeof module !== 'undefined' && module.exports ? require('./rose-check.js') : root.RoseCheck;
    const SLOTS = [
        { slot: 'P', role: 'P' },
        { slot: 'S1', role: 'S' },
        { slot: 'S2', role: 'S' },
        { slot: 'C1', role: 'C' },
        { slot: 'C2', role: 'C' },
        { slot: 'O', role: 'O' },
        { slot: 'L', role: 'L' },
    ];

    function isRosterComplete(roster) {
        return !!roster && Array.isArray(roster.all) && roster.all.length === RoseCheck.TOTALE;
    }

    function checkLineup(roster, starters, captain) {
        const errors = [];
        if (!isRosterComplete(roster)) return [`la rosa non è ancora completa: il Presidente deve inserire tutti i ${RoseCheck.TOTALE} giocatori`];

        const scelti = [];
        for (const { slot, role } of SLOTS) {
            const id = starters[slot];
            if (!id) errors.push(`manca il titolare ${slot}`);
            else if (!(roster[role] || []).includes(id)) errors.push(`${slot}: il giocatore non è un ${role} della tua rosa`);
            else scelti.push(id);
        }
        if (new Set(scelti).size !== scelti.length) errors.push('lo stesso giocatore è schierato due volte');
        if (!captain) errors.push('scegli il capitano');
        else if (!scelti.includes(captain)) errors.push('il capitano deve essere uno dei titolari');
        return errors;
    }

    // Documento da salvare: la panchina sono quelli della rosa non schierati
    function buildLineup({ roster, starters, captain, matchday, uid }) {
        const titolari = SLOTS.map(s => starters[s.slot]);
        return {
            uid,
            matchday,
            starters: Object.fromEntries(SLOTS.map(s => [s.slot, starters[s.slot]])),
            bench: roster.all.filter(id => !titolari.includes(id)),
            captain,
        };
    }

    // Per una nuova giornata riparte dalla formazione precedente, tenendo solo ciò che è ancora valido
    function suggestFrom(roster, previous) {
        const starters = {};
        if (!previous || !isRosterComplete(roster)) return { starters, captain: null };
        for (const { slot, role } of SLOTS) {
            const id = previous.starters?.[slot];
            if (id && (roster[role] || []).includes(id) && !Object.values(starters).includes(id)) starters[slot] = id;
        }
        const captain = Object.values(starters).includes(previous.captain) ? previous.captain : null;
        return { starters, captain };
    }

    const api = { SLOTS, isRosterComplete, checkLineup, buildLineup, suggestFrom };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.FormazioneCheck = api;
})(this);
