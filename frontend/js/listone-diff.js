// Confronto tra la proposta di listone (data/players.json) e il listone attuale su Firestore.
// Regole: i nuovi entrano con il ruolo della Lega; per chi c'è già il ruolo resta quello del gioco
// (un ruolo diverso viene solo segnalato); nessuno viene cancellato, chi esce diventa non attivo.
(function (root) {
    const CAMPI_AGGIORNABILI = ['name', 'team', 'teamId', 'number', 'birthYear', 'nationality', 'photo'];

    function confrontaListone(proposta, attuali) {
        const attualiPerId = new Map(attuali.map(p => [p.id, p]));
        const propostaIds = new Set(proposta.map(p => p.id));
        const diff = { nuovi: [], rientrati: [], trasferiti: [], aggiornati: [], ruoliDiversi: [], usciti: [] };

        for (const p of proposta) {
            const attuale = attualiPerId.get(p.id);
            if (!attuale) {
                diff.nuovi.push(p);
                continue;
            }
            if (attuale.active === false) diff.rientrati.push(p);
            if (attuale.role !== p.role) diff.ruoliDiversi.push({ player: attuale, ruoloLega: p.role });
            if (attuale.team !== p.team) {
                diff.trasferiti.push({ player: p, da: attuale.team });
            } else if (CAMPI_AGGIORNABILI.some(k => (attuale[k] ?? null) !== (p[k] ?? null))) {
                diff.aggiornati.push(p);
            }
        }

        for (const a of attuali) {
            if (!propostaIds.has(a.id) && a.active !== false) diff.usciti.push(a);
        }
        return diff;
    }

    // Le scritture da fare su Firestore per applicare il confronto: [{ id, data, nuovo }]
    function scrittureListone(diff) {
        const campi = p => Object.fromEntries(CAMPI_AGGIORNABILI.map(k => [k, p[k] ?? null]));
        const perId = new Map();
        for (const p of diff.nuovi) perId.set(p.id, { id: p.id, nuovo: true, data: { ...campi(p), role: p.role, active: true } });
        for (const p of [...diff.aggiornati, ...diff.trasferiti.map(t => t.player), ...diff.rientrati]) {
            perId.set(p.id, { id: p.id, nuovo: false, data: { ...campi(p), active: true } });
        }
        for (const p of diff.usciti) perId.set(p.id, { id: p.id, nuovo: false, data: { active: false } });
        return [...perId.values()];
    }

    function totaleModifiche(diff) {
        return diff.nuovi.length + diff.rientrati.length + diff.trasferiti.length + diff.aggiornati.length + diff.usciti.length;
    }

    const api = { confrontaListone, scrittureListone, totaleModifiche };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ListoneDiff = api;
})(this);
