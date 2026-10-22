// Sostituisci i valori sottostanti con le tue credenziali Firebase Console
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
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
