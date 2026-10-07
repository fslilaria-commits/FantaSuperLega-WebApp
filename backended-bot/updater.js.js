const admin = require('firebase-admin');
const axios = require('axios');
const cheerio = require('cheerio');

// Inizializza Firebase tramite Service Account fornito come secret da GitHub
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ ERRORE: Variabile FIREBASE_SERVICE_ACCOUNT non trovata.");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function mapRole(roleText) {
    if (!roleText) return 'S';
    const r = roleText.toUpperCase();
    if (r.includes('PALLEGGIATORE')) return 'P';
    if (r.includes('SCHIACCIATORE')) return 'S';
    if (r.includes('CENTRALE')) return 'C';
    if (r.includes('OPPOSTO')) return 'O';
    if (r.includes('LIBERO')) return 'L';
    return 'S';
}

async function scrapeAndSync() {
    console.log("🚀 Avvio scraping dei giocatori dal sito ufficiale...");
    try {
        const { data: html } = await axios.get('https://www.legavolley.it/atleti/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const $ = cheerio.load(html);
        const batch = db.batch();
        let count = 0;

        $('.card-atleta, .row-player').each((_, el) => {
            const name = $(el).find('.nome-atleta').text().trim();
            const team = $(el).find('.squadra-atleta').text().trim();
            const roleStr = $(el).find('.ruolo-atleta').text().trim();
            const photo = $(el).find('img').attr('src') || '';

            if (name) {
                const role = mapRole(roleStr);
                const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                
                const playerRef = db.collection('global_players').doc(id);
                batch.set(playerRef, {
                    id, name, team, role, photo,
                    price: 80, // Prezzo stimato di default per nuovi ingressi
                    lastUpdated: new Date().toISOString()
                }, { merge: true });
                count++;
            }
        });

        await batch.commit();
        console.log(`✅ Sincronizzazione riuscita: ${count} giocatori aggiornati su Firestore.`);
    } catch (err) {
        console.error("❌ Errore durante l'esecuzione del bot:", err);
        process.exit(1);
    }
}

scrapeAndSync();