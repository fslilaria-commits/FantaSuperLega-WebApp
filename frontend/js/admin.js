// Pannello Admin: compare solo a chi è nella collezione `admins` (nominati dalla console Firebase).
// Le regole Firestore bloccano comunque ogni scrittura di chi non è admin.
// Le funzioni apply* restituiscono true se l'aggiornamento è riuscito: la routine settimanale si ferma al primo errore.
const LISTONE_URL = '../data/players.json';
const CALENDARIO_URL = '../data/calendario.json';
const BATCH_SIZE = 400; // Firestore accetta al massimo 500 scritture per batch

let listoneDiff = null;
let calendarioDiff = null;

if (auth) {
    auth.onAuthStateChanged(async user => {
        const isAdmin = user ? await checkAdmin(user.uid) : false;
        document.getElementById('adminNavBtn').hidden = !isAdmin;
        if (isAdmin) {
            loadMetaInfo('listone', 'listoneInfo');
            loadMetaInfo('calendario', 'calendarioInfo');
            loadGiornateTabellini();
        } else if (document.getElementById('tab-admin').classList.contains('active')) {
            switchTab('home');
        }
    });

    document.getElementById('listoneCheckBtn').addEventListener('click', checkListone);
    document.getElementById('listoneApplyBtn').addEventListener('click', applyListone);
    document.getElementById('calendarioCheckBtn').addEventListener('click', checkCalendario);
    document.getElementById('calendarioApplyBtn').addEventListener('click', applyCalendario);
}

async function checkAdmin(uid) {
    try {
        return (await db.doc(`admins/${uid}`).get()).exists;
    } catch {
        return false;
    }
}

async function loadMetaInfo(docId, elementId) {
    const info = document.getElementById(elementId);
    try {
        const snap = await db.doc(`meta/${docId}`).get();
        const appliedAt = snap.exists ? snap.data().appliedAt?.toDate() : null;
        info.textContent = 'Ultimo aggiornamento applicato: ' + (appliedAt ? appliedAt.toLocaleString('it-IT') : 'mai');
    } catch {
        info.textContent = 'Ultimo aggiornamento applicato: non disponibile';
    }
}

function renderSections(boxId, intro, sezioni) {
    riempi(document.getElementById(boxId), el('p', { class: 'admin-sub' }, intro), listaDettagli(sezioni));
}

function messaggioErrore(e) {
    return e.code === 'permission-denied' ? 'permessi da admin mancanti (regole aggiornate?).' : e.message;
}

async function caricaProposta(url) {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`proposta non trovata (HTTP ${res.status})`);
    return res.json();
}

// --- Listone ---

async function checkListone() {
    const status = document.getElementById('listoneStatus');
    const applyBtn = document.getElementById('listoneApplyBtn');
    applyBtn.hidden = true;
    listoneDiff = null;
    status.textContent = 'Controllo in corso…';
    try {
        const proposta = await caricaProposta(LISTONE_URL);
        const snap = await db.collection('players').get();
        const attuali = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        listoneDiff = ListoneDiff.confrontaListone(proposta, attuali);
        renderSections('listoneDiff', `Proposta: ${proposta.length} giocatori · Nel gioco: ${attuali.length}`, [
            ['Nuovi giocatori', listoneDiff.nuovi, p => `${p.name} · ${p.team} · ${ROLE_NAMES[p.role]}`],
            ['Trasferiti', listoneDiff.trasferiti, t => `${t.player.name}: ${t.da} → ${t.player.team}`],
            ['Tornati in SuperLega', listoneDiff.rientrati, p => `${p.name} · ${p.team}`],
            ['Usciti dalla SuperLega (diventano non attivi)', listoneDiff.usciti, p => `${p.name} · ${p.team}`],
            ['Dati aggiornati (maglia, foto, nome)', listoneDiff.aggiornati, p => `${p.name} · ${p.team}`],
            ['Ruolo diverso sul sito della Lega (non viene cambiato)', listoneDiff.ruoliDiversi,
                r => `${r.player.name}: nel gioco ${ROLE_NAMES[r.player.role]}, per la Lega ${ROLE_NAMES[r.ruoloLega]}`],
        ]);
        const totale = ListoneDiff.totaleModifiche(listoneDiff);
        applyBtn.hidden = totale === 0;
        status.textContent = totale === 0 ? 'Il listone è già aggiornato.' : `${totale} modifiche da applicare.`;
        return true;
    } catch (e) {
        status.textContent = 'Controllo non riuscito: ' + e.message;
        return false;
    }
}

async function applyListone() {
    if (!listoneDiff) return false;
    const status = document.getElementById('listoneStatus');
    const applyBtn = document.getElementById('listoneApplyBtn');
    const scritture = ListoneDiff.scrittureListone(listoneDiff);
    applyBtn.disabled = true;
    status.textContent = `Applico ${scritture.length} modifiche…`;
    try {
        const now = firebase.firestore.FieldValue.serverTimestamp();
        for (let i = 0; i < scritture.length; i += BATCH_SIZE) {
            const batch = db.batch();
            for (const w of scritture.slice(i, i + BATCH_SIZE)) {
                batch.set(db.collection('players').doc(w.id), { ...w.data, updatedAt: now }, { merge: true });
            }
            await batch.commit();
        }
        await db.doc('meta/listone').set({ appliedAt: now, appliedBy: auth.currentUser.uid, changes: scritture.length });
        status.textContent = `Fatto: ${scritture.length} modifiche applicate.`;
        applyBtn.hidden = true;
        listoneDiff = null;
        loadMetaInfo('listone', 'listoneInfo');
        await loadPlayers();
        refreshAll();
        return true;
    } catch (e) {
        status.textContent = 'Aggiornamento non riuscito: ' + messaggioErrore(e);
        return false;
    } finally {
        applyBtn.disabled = false;
    }
}

// --- Calendario e scadenze ---

function formatRome(iso) {
    return iso ? new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

async function checkCalendario() {
    const status = document.getElementById('calendarioStatus');
    const applyBtn = document.getElementById('calendarioApplyBtn');
    applyBtn.hidden = true;
    calendarioDiff = null;
    status.textContent = 'Controllo in corso…';
    try {
        const proposta = await caricaProposta(CALENDARIO_URL);
        const snap = await db.collection('matchdays').get();
        const attuali = snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, ...data, lockAt: data.lockAt?.toDate ? data.lockAt.toDate().toISOString() : null };
        });
        calendarioDiff = CalendarioDiff.confrontaCalendario(proposta, attuali, new Date());
        const spostate = proposta.flatMap(g => g.matches.filter(m => m.moved).map(m => ({ g, m })));
        renderSections('calendarioDiff', `Proposta: ${proposta.length} giornate · Nel gioco: ${attuali.length}`, [
            ['Giornate nuove', calendarioDiff.nuove, g => `${g.label}: scadenza ${formatRome(g.lockAt)}${g.provisional ? ' (provvisoria)' : ''}`],
            ['Scadenze spostate', calendarioDiff.scadenzeSpostate, x => `${x.giornata.label}: ${formatRome(x.da)} → ${formatRome(x.giornata.lockAt)}`],
            ['Giornate già bloccate: scadenza NON spostata, da verificare', calendarioDiff.scadenzeBloccate,
                x => `${x.giornata.label}: resta ${formatRome(x.da)} (la Lega indica ${formatRome(x.giornata.lockAt)})`],
            ['Orari delle gare aggiornati', calendarioDiff.gareCambiate, g => g.label],
            ['Gare spostate fuori dalla loro giornata (punteggio medio)', spostate,
                ({ g, m }) => `${g.label}: ${m.home} – ${m.away}, ${formatRome(m.start)}`],
        ]);
        const totale = calendarioDiff.scritture.length;
        applyBtn.hidden = totale === 0;
        status.textContent = totale === 0 ? 'Il calendario è già aggiornato.' : `${totale} giornate da aggiornare.`;
        return true;
    } catch (e) {
        status.textContent = 'Controllo non riuscito: ' + e.message;
        return false;
    }
}

async function applyCalendario() {
    if (!calendarioDiff) return false;
    const status = document.getElementById('calendarioStatus');
    const applyBtn = document.getElementById('calendarioApplyBtn');
    const scritture = calendarioDiff.scritture;
    applyBtn.disabled = true;
    status.textContent = `Aggiorno ${scritture.length} giornate…`;
    try {
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const batch = db.batch();
        for (const w of scritture) {
            const data = { ...w.data, lockAt: firebase.firestore.Timestamp.fromDate(new Date(w.data.lockAt)), updatedAt: now };
            batch.set(db.collection('matchdays').doc(w.id), data, { merge: true });
        }
        batch.set(db.doc('meta/calendario'), { appliedAt: now, appliedBy: auth.currentUser.uid, changes: scritture.length });
        await batch.commit();
        status.textContent = `Fatto: ${scritture.length} giornate aggiornate.`;
        applyBtn.hidden = true;
        calendarioDiff = null;
        loadMetaInfo('calendario', 'calendarioInfo');
        await loadNextMatchday();
        refreshAll();
        return true;
    } catch (e) {
        status.textContent = 'Aggiornamento non riuscito: ' + messaggioErrore(e);
        return false;
    } finally {
        applyBtn.disabled = false;
    }
}
