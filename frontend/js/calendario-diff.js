// Confronto tra la proposta di calendario (data/calendario.json) e le giornate su Firestore.
// Regola di sicurezza: la scadenza di una giornata già bloccata non si sposta mai, si segnala soltanto,
// altrimenti si riaprirebbero formazioni già chiuse.
(function (root) {
    const CAMPI = ['label', 'legaId', 'lockAt', 'provisional', 'matches'];

    // attuali: [{ id, number, lockAt (ISO), ... }]; now: Date
    function confrontaCalendario(proposta, attuali, now) {
        const attualiPerNumero = new Map(attuali.map(g => [g.number, g]));
        const diff = { nuove: [], scadenzeSpostate: [], scadenzeBloccate: [], gareCambiate: [], scritture: [] };

        for (const g of proposta) {
            const attuale = attualiPerNumero.get(g.number);
            if (!attuale) {
                diff.nuove.push(g);
                diff.scritture.push({ id: String(g.number), nuovo: true, data: { number: g.number, ...pick(g), status: 'open' } });
                continue;
            }

            const giaBloccata = attuale.lockAt && new Date(attuale.lockAt) <= now;
            const data = pick(g);
            if (attuale.lockAt !== g.lockAt) {
                if (giaBloccata) {
                    diff.scadenzeBloccate.push({ giornata: g, da: attuale.lockAt });
                    data.lockAt = attuale.lockAt;
                } else {
                    diff.scadenzeSpostate.push({ giornata: g, da: attuale.lockAt });
                }
            }
            if (!uguali(attuale.matches || [], g.matches)) diff.gareCambiate.push(g);

            const cambiato = CAMPI.some(k => !uguali(attuale[k] ?? null, data[k] ?? null));
            if (cambiato) diff.scritture.push({ id: String(g.number), nuovo: false, data });
        }
        return diff;
    }

    // Confronto che ignora l'ordine dei campi: Firestore restituisce le mappe con le chiavi in ordine alfabetico
    function uguali(a, b) {
        return stabile(a) === stabile(b);
    }

    function stabile(value) {
        if (Array.isArray(value)) return `[${value.map(stabile).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stabile(value[k])}`).join(',')}}`;
        }
        return JSON.stringify(value ?? null);
    }

    function pick(g) {
        return Object.fromEntries(CAMPI.map(k => [k, g[k] ?? null]));
    }

    // uguali serve anche fuori dal calendario (per esempio per le rose del mercato)
    const api = { confrontaCalendario, uguali };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CalendarioDiff = api;
})(this);
