// ============================================================
// CONFIGURAZIONE FIREBASE
// Sostituisci con le credenziali del tuo progetto Firebase
// (Console Firebase > Impostazioni progetto > Le tue app > Config SDK)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyChgm9atbKHDC3t_YYghsZw8FOFSmjZ154",
  authDomain: "archivio-famiglia-buono.firebaseapp.com",
  projectId: "archivio-famiglia-buono",
  storageBucket: "archivio-famiglia-buono.firebasestorage.app",
  messagingSenderId: "687728369877",
  appId: "1:687728369877:web:5268ae6f35be9596d7c25c"
};

// Inizializzazione (Firebase v9+ compat, stesso pattern usato in MedSafe)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Abilita persistenza offline per Firestore (cache metadata anche senza rete)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Persistenza offline non attiva: troppe schede aperte.");
  } else if (err.code === "unimplemented") {
    console.warn("Persistenza offline non supportata da questo browser.");
  }
});
