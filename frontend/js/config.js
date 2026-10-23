// Configurazione dell'app web del progetto Firebase fanta-superlega-734b1.
// Questi valori sono pubblici per natura: la sicurezza la fanno le regole in firestore.rules.
const firebaseConfig = {
    apiKey: "AIzaSyDwTmcD9I4-Yn05jvjmSb_1O4e-OClQ7NM",
    authDomain: "fanta-superlega-734b1.firebaseapp.com",
    projectId: "fanta-superlega-734b1",
    storageBucket: "fanta-superlega-734b1.firebasestorage.app",
    messagingSenderId: "744640932398",
    appId: "1:744640932398:web:6841966d19cd3158820dbf"
};

const firebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');

// Chiave Fraud Defense (ex reCAPTCHA Enterprise) per App Check, pubblica come la configurazione.
// Vuota = App Check spento. Vale solo sul dominio fslilaria-commits.github.io; come ottenerla: docs/sicurezza.md
const appCheckSiteKey = '6Ld65fwtAAAAAFED9z41fucCMASqP3qwT8ZWj2My';

// Solo per lo sviluppo: http://localhost:<porta>/frontend/?emulatori usa gli emulatori Firebase locali
// (npm run emulatori) invece del progetto vero. Sul sito pubblicato non si attiva mai.
const useEmulators = ['localhost', '127.0.0.1'].includes(location.hostname)
    && new URLSearchParams(location.search).has('emulatori');

let db = null;
let auth = null;
if (firebaseConfigured) {
    firebase.initializeApp(useEmulators
        ? { apiKey: 'demo', authDomain: 'demo-fantasuperlega.firebaseapp.com', projectId: 'demo-fantasuperlega' }
        : firebaseConfig);
    if (!useEmulators && appCheckSiteKey) {
        // App Check, prima di qualsiasi altro servizio: ogni richiesta a Firebase porta la prova
        // che arriva da questa app (chiave a punteggio, invisibile per chi gioca)
        firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(appCheckSiteKey), true);
    }
    db = firebase.firestore();
    auth = firebase.auth();
    if (useEmulators) {
        db.useEmulator('localhost', 8080);
        auth.useEmulator('http://localhost:9099', { disableWarnings: true });
    }
}
