// Leghe a quotazioni, come il Fanta F1 e il Fantasy del FantaLVF (regolamento-fantasy): niente asta, ogni giocatore
// ha un prezzo deciso dall'admin (meta/quotazioni) e lo stesso giocatore può stare in più squadre della lega.
// Ognuno si fa la squadra da solo dentro il budget della lega: stessa rosa da 14 della modalità ad asta, massimo 4
// per club, fino a 5 cambi per giornata (liberi nella prima giornata della squadra, come nel FantaLVF). Chi tiene un
// giocatore tiene il prezzo che ha pagato: un prezzo cambiato dall'admin vale solo per i nuovi acquisti.
// Le regole Firestore rifanno i conti di ruoli, prezzi, budget e cambi; il massimo per club lo controlla questo modulo.
(function (root) {
    const inNode = typeof module !== 'undefined' && module.exports;
    const RoseCheck = inNode ? require('./rose-check.js') : root.RoseCheck;
    const FormazioneCheck = inNode ? require('./formazione-check.js') : root.FormazioneCheck;
    const RUOLI = Object.keys(RoseCheck.MAX_PER_RUOLO);
    const MAX_CAMBI = 5;
    // Prezzi proposti da 2 a 15 crediti: con 100 crediti per 14 giocatori non si prendono tutti i migliori
    const PREZZO_MIN = 2;
    const PREZZO_MAX = 15;
    const BUDGET_CONSIGLIATO = 100;

    // meta/quotazioni tiene i prezzi divisi per ruolo (così le regole controllano anche il ruolo): qui { id: prezzo }
    function prezziPerId(doc) {
        const prezzi = {};
        for (const ruolo of RUOLI) Object.assign(prezzi, doc?.prezzi?.[ruolo] || {});
        return prezzi;
    }

    // { id: prezzo } -> { P: { id: prezzo }, ... } con il ruolo del listone. Restano solo i prezzi interi da 1 in su
    // dei giocatori nel listone: chi è uscito dalla SuperLega resta, perché può essere ancora in qualche squadra
    function prezziPerRuolo(prezzi, playersById) {
        const perRuolo = Object.fromEntries(RUOLI.map(r => [r, {}]));
        for (const [id, prezzo] of Object.entries(prezzi)) {
            const ruolo = playersById[id]?.role;
            if (perRuolo[ruolo] && Number.isInteger(prezzo) && prezzo >= 1) perRuolo[ruolo][id] = prezzo;
        }
        return perRuolo;
    }

    // Proposta dalle medie fanta-punti: in ogni ruolo si va in ordine di media, dal più caro (max) al meno caro (min),
    // con lo stesso prezzo a parità di media; chi non ha ancora giocato vale il minimo. Si confronta dentro il ruolo
    // perché i punti dei ruoli non si somigliano (un libero ne fa molti meno di un opposto)
    function proponiPrezzi(players, statistiche, { min = PREZZO_MIN, max = PREZZO_MAX } = {}) {
        const prezzi = {};
        for (const ruolo of RUOLI) {
            const delRuolo = players.filter(p => p.role === ruolo);
            const media = p => statistiche[p.id]?.media;
            const conMedia = delRuolo.filter(p => Number.isFinite(media(p))).sort((a, b) => media(b) - media(a));
            conMedia.forEach(p => {
                const posto = conMedia.findIndex(q => media(q) === media(p));
                const quota = conMedia.length > 1 ? posto / (conMedia.length - 1) : 0;
                prezzi[p.id] = Math.round(max - (max - min) * quota);
            });
            for (const p of delRuolo) if (!(p.id in prezzi)) prezzi[p.id] = min;
        }
        return prezzi;
    }

    // Giocatori del listone ancora senza prezzo: nelle leghe a quotazioni non si possono prendere
    function senzaPrezzo(players, prezzi) {
        return players.filter(p => p.active !== false && !Number.isInteger(prezzi[p.id]));
    }

    // Il prezzo di un giocatore per questa squadra: chi c'era già tiene quello pagato, chi arriva paga la quotazione
    function prezzoPer(id, ruolo, vecchia, quotazioni) {
        const tenuto = !!vecchia?.prices && Object.prototype.hasOwnProperty.call(vecchia.prices, id) && (vecchia[ruolo] || []).includes(id);
        return tenuto ? vecchia.prices[id] : quotazioni[id];
    }

    // picks: [{ id, role }]; vecchia: la squadra salvata (null se non c'è ancora); quotazioni: { id: prezzo };
    // giornata: quella per cui valgono i cambi (la prossima da schierare)
    function controllaSquadra({ picks, vecchia = null, quotazioni, budget, playersById, giornata }) {
        const errors = [];
        const warnings = [];
        const nome = id => playersById[id]?.name || id;

        for (const [role, max] of Object.entries(RoseCheck.MAX_PER_RUOLO)) {
            const n = picks.filter(p => p.role === role).length;
            if (n > max) errors.push(`troppi giocatori nel ruolo ${role}: ${n} su ${max}`);
        }

        const prezzi = {};
        const visti = new Set();
        for (const p of picks) {
            if (visti.has(p.id)) errors.push(`${nome(p.id)} è inserito due volte`);
            visti.add(p.id);
            if (playersById[p.id] && playersById[p.id].role !== p.role) errors.push(`${nome(p.id)} non è un ${p.role}`);
            const prezzo = prezzoPer(p.id, p.role, vecchia, quotazioni);
            if (Number.isInteger(prezzo)) prezzi[p.id] = prezzo;
            else errors.push(`${nome(p.id)} non ha ancora un prezzo: lo decide l'admin`);
            if (playersById[p.id]?.active === false) warnings.push(`${nome(p.id)} non è più in SuperLega`);
        }

        for (const [club, n] of RoseCheck.clubOltreIlLimite(picks.map(p => p.id), playersById)) {
            errors.push(`${n} giocatori di ${club}: il massimo è ${RoseCheck.MAX_PER_CLUB}`);
        }

        const spesa = Object.values(prezzi).reduce((a, b) => a + b, 0);
        const creditsLeft = budget - spesa;
        if (creditsLeft < 0) errors.push(`budget superato di ${-creditsLeft} crediti`);

        // Cambi: i giocatori che arrivano rispetto alla squadra salvata; nella prima giornata della squadra sono liberi
        const prima = new Set(vecchia?.all || []);
        const nuovi = vecchia ? picks.filter(p => !prima.has(p.id)).length : 0;
        const liberi = !vecchia || giornata === vecchia.dalla;
        const giaFatti = !liberi && vecchia.giornata === giornata ? vecchia.cambi || 0 : 0;
        const cambi = liberi ? 0 : giaFatti + nuovi;
        if (cambi > MAX_CAMBI) errors.push(`troppi cambi: ${cambi} su ${MAX_CAMBI} per giornata`);

        return {
            errors, warnings, prezzi, spesa, creditsLeft, cambi, giaFatti, liberi, nuovi,
            completa: picks.length === RoseCheck.TOTALE && errors.length === 0,
        };
    }

    // Il documento da salvare (leagues/{id}/rosters/{uid}); controllo: il risultato di controllaSquadra.
    // all segue l'ordine dei ruoli (P, S, C, O, L), come vogliono le regole
    function costruisciSquadra({ picks, controllo, vecchia, giornata }) {
        const squadra = { P: [], S: [], C: [], O: [], L: [], prices: {} };
        for (const p of picks) {
            squadra[p.role].push(p.id);
            squadra.prices[p.id] = controllo.prezzi[p.id];
        }
        const all = RUOLI.flatMap(r => squadra[r]);
        return { ...squadra, all, creditsLeft: controllo.creditsLeft, giornata, dalla: vecchia?.dalla ?? giornata, cambi: controllo.cambi };
    }

    // Squadra salvata -> picks per l'editor
    function picksDa(squadra) {
        return squadra ? RUOLI.flatMap(role => (squadra[role] || []).map(id => ({ id, role }))) : [];
    }

    // Formazione da salvare insieme alla squadra: chi arriva prende il posto (e la fascia di capitano) di chi parte
    // nello stesso ruolo. Senza una formazione di partenza: titolari i più cari di ogni ruolo, capitano il più caro
    function formazioneDopoCambi({ nuova, precedente }) {
        const starters = {};
        const usati = new Set();
        const titolariPrima = new Set(Object.values(precedente?.starters || {}));
        const inPrecedente = new Set([...titolariPrima, ...(precedente?.bench || [])]);
        const perPrezzo = ruolo => (nuova[ruolo] || []).slice().sort((a, b) => (nuova.prices[b] ?? 0) - (nuova.prices[a] ?? 0));
        for (const { slot, role } of FormazioneCheck.SLOTS) {
            const prima = precedente?.starters?.[slot];
            const liberi = perPrezzo(role).filter(id => !usati.has(id));
            const scelto = prima && liberi.includes(prima) ? prima
                : liberi.find(id => !inPrecedente.has(id)) || liberi.find(id => !titolariPrima.has(id)) || liberi[0];
            if (scelto) {
                starters[slot] = scelto;
                usati.add(scelto);
            }
        }
        const titolari = Object.values(starters);
        let captain = precedente && titolari.includes(precedente.captain) ? precedente.captain : null;
        if (!captain && precedente) {
            const slotCapitano = Object.keys(precedente.starters || {}).find(s => precedente.starters[s] === precedente.captain);
            captain = slotCapitano ? starters[slotCapitano] || null : null;
        }
        if (!captain) captain = titolari.slice().sort((a, b) => (nuova.prices[b] ?? 0) - (nuova.prices[a] ?? 0))[0] || null;
        return { starters, captain };
    }

    const api = {
        MAX_CAMBI, PREZZO_MIN, PREZZO_MAX, BUDGET_CONSIGLIATO,
        prezziPerId, prezziPerRuolo, proponiPrezzi, senzaPrezzo, controllaSquadra, costruisciSquadra, picksDa, formazioneDopoCambi,
    };
    if (inNode) module.exports = api;
    else root.Quotazioni = api;
})(this);
