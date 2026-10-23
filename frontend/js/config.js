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

// Finché la configurazione non è compilata l'app resta offline con i dati di esempio
const firebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');

let db = null;
let auth = null;
if (firebaseConfigured) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
}
