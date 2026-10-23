// Riempie l'emulatore Firestore con listone e calendario di data/ (npm run seed:emulatori, con gli emulatori accesi).
// Facoltativo: node tests/seed-emulatori.mjs <uid> nomina admin quell'utente dell'emulatore.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, writeBatch } from 'firebase/firestore';

const players = JSON.parse(readFileSync('data/players.json', 'utf8'));
const calendario = JSON.parse(readFileSync('data/calendario.json', 'utf8'));
const adminUid = process.argv[2];

const env = await initializeTestEnvironment({
    projectId: 'demo-fantasuperlega',
    firestore: { host: 'localhost', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
});

await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    let batch = writeBatch(db);
    let n = 0;
    const commitIfFull = async () => {
        if (++n % 400 === 0) {
            await batch.commit();
            batch = writeBatch(db);
        }
    };
    for (const { id, ...p } of players) {
        batch.set(doc(db, `players/${id}`), p);
        await commitIfFull();
    }
    for (const g of calendario) {
        batch.set(doc(db, `matchdays/${g.number}`), { ...g, lockAt: Timestamp.fromDate(new Date(g.lockAt)), status: 'open' });
        await commitIfFull();
    }
    if (adminUid) batch.set(doc(db, `admins/${adminUid}`), { nome: 'Admin di prova' });
    await batch.commit();
});

console.log(`Emulatore pronto: ${players.length} giocatori, ${calendario.length} giornate${adminUid ? `, admin ${adminUid}` : ''}.`);
await env.cleanup();
