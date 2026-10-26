// Scontri diretti e classifiche di lega, come nel FantaLVF (regolamento-fantasy/campionati):
// - ogni giornata sfide 1 contro 1; con meno squadre che giornate le sfide si ripetono a ciclo
// - con squadre dispari si aggiunge la "Squadra media", che prende la media dei punti della giornata
// - vittoria 3 punti; a parità di fanta-punti tie-break (più punti in classifica generale, poi iscrizione
//   più vecchia): 2 punti a chi lo vince, 1 a chi lo perde
// - classifica: punti, poi fanta-punti totali, poi iscrizione più vecchia
(function (root) {
    const MEDIA = 'MEDIA';
    const r2 = x => Math.round(x * 100) / 100;

    function mescola(lista, random) {
        const a = lista.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Girone all'italiana (metodo del cerchio), ripetuto a ciclo dalla giornata di inizio all'ultima del calendario (end)
    function generaCalendario(uids, { start, end, random = Math.random } = {}) {
        if (uids.length < 2) throw new Error('servono almeno 2 squadre');
        if (!Number.isInteger(end) || end < start) throw new Error('manca il calendario delle giornate');
        const squadre = mescola(uids, random);
        if (squadre.length % 2) squadre.push(MEDIA);
        const n = squadre.length;
        const turni = [];
        let giro = squadre.slice();
        for (let t = 0; t < n - 1; t++) {
            // Ogni sfida è { a, b }: Firestore non accetta liste dentro liste
            turni.push(Array.from({ length: n / 2 }, (_, i) => ({ a: giro[i], b: giro[n - 1 - i] })));
            giro = [giro[0], giro[n - 1], ...giro.slice(1, n - 1)];
        }
        const rounds = {};
        for (let g = start; g <= end; g++) rounds[g] = turni[(g - start) % turni.length];
        return { teams: uids.slice(), rounds };
    }

    // scores: [{ uid, matchday, total }]; members: [{ uid, joinedAt (ms) }]
    // Le sfide di una giornata. Il calendario lo scrive il browser del Presidente: i dati malformati si ignorano
    function sfideDi(rounds, giornata) {
        const sfide = rounds?.[giornata];
        return Array.isArray(sfide)
            ? sfide.filter(s => s && typeof s.a === 'string' && typeof s.b === 'string' && s.a !== s.b)
            : [];
    }

    function risultatiScontri({ rounds, scores, members }) {
        const iscrizione = Object.fromEntries(members.map(m => [m.uid, m.joinedAt ?? 0]));
        const classifica = Object.fromEntries(members.map(m => [m.uid, {
            points: 0, played: 0, won: 0, lost: 0, tbWon: 0, tbLost: 0, for: 0, against: 0, total: 0,
        }]));
        const perGiornata = {};
        for (const s of scores) (perGiornata[s.matchday] = perGiornata[s.matchday] || {})[s.uid] = s.total;

        const partite = [];
        for (const g of Object.keys(perGiornata).map(Number).sort((a, b) => a - b)) {
            const punti = perGiornata[g];
            const reali = Object.keys(classifica).map(uid => punti[uid] ?? 0);
            const media = reali.length ? r2(reali.reduce((a, b) => a + b, 0) / reali.length) : 0;
            // I fanta-punti totali entrano in classifica prima del tie-break della giornata
            for (const uid of Object.keys(classifica)) classifica[uid].total = r2(classifica[uid].total + (punti[uid] ?? 0));

            for (const { a, b } of sfideDi(rounds, g)) {
                const pa = a === MEDIA ? media : (punti[a] ?? 0);
                const pb = b === MEDIA ? media : (punti[b] ?? 0);
                let vincitore;
                let tiebreak = false;
                if (pa !== pb) vincitore = pa > pb ? a : b;
                else {
                    tiebreak = true;
                    vincitore = vinceTiebreak(a, b, classifica, iscrizione);
                }
                const perdente = vincitore === a ? b : a;
                for (const [uid, fatti, subiti] of [[a, pa, pb], [b, pb, pa]]) {
                    const c = classifica[uid];
                    if (!c) continue; // la Squadra media non è in classifica
                    c.played += 1;
                    c.for = r2(c.for + fatti);
                    c.against = r2(c.against + subiti);
                }
                if (classifica[vincitore]) {
                    classifica[vincitore].points += tiebreak ? 2 : 3;
                    classifica[vincitore][tiebreak ? 'tbWon' : 'won'] += 1;
                }
                if (classifica[perdente]) {
                    classifica[perdente].points += tiebreak ? 1 : 0;
                    classifica[perdente][tiebreak ? 'tbLost' : 'lost'] += 1;
                }
                partite.push({ matchday: g, a, b, pa, pb, vincitore, tiebreak });
            }
        }
        return { classifica, partite };
    }

    // La Squadra media e le squadre uscite dalla lega (presenti nel calendario ma non più in classifica)
    // perdono sempre il tie-break contro una squadra in classifica
    function vinceTiebreak(a, b, classifica, iscrizione) {
        if (!classifica[a]) return classifica[b] ? b : a;
        if (!classifica[b]) return a;
        if (classifica[a].total !== classifica[b].total) return classifica[a].total > classifica[b].total ? a : b;
        return (iscrizione[a] ?? 0) <= (iscrizione[b] ?? 0) ? a : b;
    }

    // Ordine della classifica. mode: 'scontri' (punti, fanta-punti, iscrizione) o 'classifica' (fanta-punti, iscrizione)
    function ordinaClassifica(members, standings, mode) {
        const s = uid => standings[uid] || { points: 0, total: 0 };
        return members.slice().sort((x, y) =>
            (mode === 'scontri' ? s(y.uid).points - s(x.uid).points : 0)
            || s(y.uid).total - s(x.uid).total
            || (x.joinedAt ?? 0) - (y.joinedAt ?? 0));
    }

    const api = { MEDIA, generaCalendario, sfideDi, risultatiScontri, ordinaClassifica };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Scontri = api;
})(this);
