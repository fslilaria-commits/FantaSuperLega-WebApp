// Sostituisci i valori sottostanti con le tue credenziali Firebase Console
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "fanta-superlega.firebaseapp.com",
    projectId: "fanta-superlega",
    storageBucket: "fanta-superlega.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();