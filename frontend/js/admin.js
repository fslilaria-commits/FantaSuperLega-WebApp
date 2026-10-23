// Pannello Admin: compare solo a chi è nella collezione `admins` (nominati dalla console Firebase).
// Le regole Firestore bloccano comunque ogni scrittura di chi non è admin.
const LISTONE_URL = '../data/players.json';
const BATCH_SIZE = 400; // Firestore accetta al massimo 500 scritture per batch

let listoneDiff = null;

if (auth) {
    auth.onAuthStateChanged(async user => {
        const isAdmin = user ? await checkAdmin(user.uid) : false;
        document.getElementById('adminNavBtn').hidden = !isAdmin;
        if (isAdmin) {
            loadListoneInfo();
            loadMetaInfo('calendario', 'calendarioInfo');
        } else if (document.getElementById('tab-admin').classList.contains('active')) {
            switchTab('field');
        }
    });

    document.getElementById('listoneCheckBtn').addEventListener('click', checkListone);
    document.getElementById('listoneApplyBtn').addEventListener('click', applyListone);
    document.getElementById('calendarioCheckBtn').addEventListener('click', checkCalendario);
    document.getElementById('calendarioApplyBtn').addEventListener('click', applyCalendario);
}

async function loadMetaInfo(docId, elementId) {
    const info = document.getElementById(elementId);
    try {
        const snap = await db.doc(`meta/${docId}`).get();
        const appliedAt = snap.exists ? snap.data().appliedAt?.toDate() : null;
        info.textContent = 'Ultimo aggiornamento applicato: ' + (appliedAt ? appliedAt.toLocaleString('it-IT') : 'mai');
    } catch (e) {
        info.textContent = 'Ultimo aggiornamento applicato: non disponibile';
    }
}

async function checkAdmin(uid) {
    try {
        return (await db.doc(`admins/${uid}`).get()).exists;
    } catch (e) {
        return false;
    }
}

function loadListoneInfo() {
    return loadMetaInfo('listone', 'listoneInfo');
}

async function checkListone() {
    const status = document.getElementById('listoneStatus');
    const applyBtn = document.getElementById('listoneApplyBtn');
    applyBtn.hidden = true;
    status.textContent = 'Controllo in corso…';
    try {
        const res = await fetch(`${LISTONE_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`proposta non trovata (HTTP ${res.status})`);
        const proposta = await res.json();
        const snap = await db.collection('players').get();
        const attuali = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        listoneDiff = ListoneDiff.confrontaListone(proposta, attuali);
        renderListoneDiff(listoneDiff, proposta.length, attuali.length);

        const totale = ListoneDiff.totaleModifiche(listoneDiff);
        applyBtn.hidden = totale === 0;
        status.textContent = totale === 0 ? 'Il listone è già aggiornato.' : `${totale} modifiche da applicare.`;
    } catch (e) {
        status.textContent = 'Controllo non riuscito: ' + e.message;
    }
}

function renderListoneDiff(diff, totaleProposta, totaleAttuale) {
    renderSections('listoneDiff', `Proposta: ${totaleProposta} giocatori · Nel gioco: ${totaleAttuale}`, [
        ['Nuovi giocatori', diff.nuovi, p => `${p.name} · ${p.team} · ${ROLE_NAMES[p.role]}`],
        ['Trasferiti', diff.trasferiti, t => `${t.player.name}: ${t.da} → ${t.player.team}`],
        ['Tornati in SuperLega', diff.rientrati, p => `${p.name} · ${p.team}`],
        ['Usciti dalla SuperLega (diventano non attivi)', diff.usciti, p => `${p.name} · ${p.team}`],
        ['Dati aggiornati (maglia, foto, nome)', diff.aggiornati, p => `${p.name} · ${p.team}`],
        ['Ruolo diverso sul sito della Lega (non viene cambiato)', diff.ruoliDiversi,
            r => `${r.player.name}: nel gioco ${ROLE_NAMES[r.player.role]}, per la Lega ${ROLE_NAMES[r.ruoloLega]}`],
    ]);
}

async function applyListone() {
    if (!listoneDiff) return;
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
        loadListoneInfo();
        await loadPlayers();
        refreshAll();
    } catch (e) {
        status.textContent = 'Aggiornamento non riuscito: ' + (e.code === 'permission-denied' ? 'permessi da admin mancanti.' : e.message);
    } finally {
        applyBtn.disabled = false;
    }
}

// --- Calendario e scadenze ---

const CALENDARIO_URL = '../data/calendario.json';
let calendarioDiff = null;

function formatRome(iso) {
    return iso ? new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function renderSections(boxId, intro, sezioni) {
    const box = document.getElementById(boxId);
    box.replaceChildren();
    const p = document.createElement('p');
    p.className = 'admin-sub';
    p.textContent = intro;
    box.append(p);
    for (const [titolo, elenco, riga] of sezioni) {
        if (!elenco.length) continue;
        const det = document.createElement('details');
        det.className = 'admin-diff';
        det.open = elenco.length <= 10;
        const sum = document.createElement('summary');
        sum.textContent = `${titolo} (${elenco.length})`;
        const ul = document.createElement('ul');
        for (const item of elenco) {
            const li = document.createElement('li');
            li.textContent = riga(item);
            ul.append(li);
        }
        det.append(sum, ul);
        box.append(det);
    }
}

async function checkCalendario() {
    const status = document.getElementById('calendarioStatus');
    const applyBtn = document.getElementById('calendarioApplyBtn');
    applyBtn.hidden = true;
    status.textContent = 'Controllo in corso…';
    try {
        const res = await fetch(`${CALENDARIO_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`proposta non trovata (HTTP ${res.status})`);
        const proposta = await res.json();
        const snap = await db.collection('matchdays').get();
        const attuali = snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, ...data, lockAt: data.lockAt ? data.lockAt.toDate().toISOString() : null };
        });

        calendarioDiff = CalendarioDiff.confrontaCalendario(proposta, attuali, new Date());
        const spostate = proposta.flatMap(g => g.matches.filter(m => m.moved).map(m => ({ g, m })));
        renderSections('calendarioDiff', `Proposta: ${proposta.length} giornate · Nel gioco: ${attuali.length}`, [
            ['Giornate nuove', calendarioDiff.nuove, g => `${g.label}: scadenza ${formatRome(g.lockAt)}${g.provisional ? ' (provvisoria)' : ''}`],
            ['Scadenze spostate', calendarioDiff.scadenzeSpostate, s => `${s.giornata.label}: ${formatRome(s.da)} → ${formatRome(s.giornata.lockAt)}`],
            ['Giornate già bloccate: scadenza NON spostata, da verificare', calendarioDiff.scadenzeBloccate,
                s => `${s.giornata.label}: resta ${formatRome(s.da)} (la Lega indica ${formatRome(s.giornata.lockAt)})`],
            ['Orari delle gare aggiornati', calendarioDiff.gareCambiate, g => g.label],
            ['Gare spostate fuori dalla loro giornata (punteggio medio)', spostate,
                ({ g, m }) => `${g.label}: ${m.home} – ${m.away}, ${formatRome(m.start)}`],
        ]);

        const totale = calendarioDiff.scritture.length;
        applyBtn.hidden = totale === 0;
        status.textContent = totale === 0 ? 'Il calendario è già aggiornato.' : `${totale} giornate da aggiornare.`;
    } catch (e) {
        status.textContent = 'Controllo non riuscito: ' + e.message;
    }
}

async function applyCalendario() {
    if (!calendarioDiff) return;
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
    } catch (e) {
        status.textContent = 'Aggiornamento non riuscito: ' + (e.code === 'permission-denied' ? 'permessi da admin mancanti.' : e.message);
    } finally {
        applyBtn.disabled = false;
    }
}
