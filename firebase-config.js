// ============================================================
// CONFIGURAZIONE FIREBASE
// Sostituisci con le credenziali del tuo progetto Firebase
// (Console Firebase > Impostazioni progetto > Le tue app > Config SDK)
// ============================================================

const firebaseConfig = {
  apiKey: "TUA_API_KEY",
  authDomain: "TUO_PROGETTO.firebaseapp.com",
  projectId: "TUO_PROGETTO",
  storageBucket: "TUO_PROGETTO.appspot.com",
  messagingSenderId: "TUO_SENDER_ID",
  appId: "TUA_APP_ID"
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
