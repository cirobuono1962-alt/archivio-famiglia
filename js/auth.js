// ============================================================
// AUTH.JS - Gestione autenticazione e ruoli utente
// ============================================================

let currentUser = null;   // oggetto auth Firebase
let currentUserData = null; // documento utenti/{uid} (ruolo, categorieVisibili, nome)

/**
 * Login con email/password
 */
async function login(email, password) {
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  } catch (err) {
    console.error("Errore login:", err.code, err.message);
    throw mapAuthError(err.code);
  }
}

async function logout() {
  await auth.signOut();
  currentUser = null;
  currentUserData = null;
}

/**
 * Carica il documento utente (ruolo, categorie visibili) da Firestore.
 * Va richiamato dopo ogni login, prima di mostrare l'interfaccia.
 */
async function caricaDatiUtente(uid) {
  const doc = await db.collection("utenti").doc(uid).get();
  if (!doc.exists) {
    throw new Error("Utente autenticato ma non presente in 'utenti'. Contatta l'admin.");
  }
  currentUserData = doc.data();
  return currentUserData;
}

function isAdmin() {
  return currentUserData?.ruolo === "admin";
}

function isFamiliare() {
  return currentUserData?.ruolo === "familiare" || isAdmin();
}

function isEsterno() {
  return currentUserData?.ruolo === "esterno";
}

/**
 * Restituisce le categorie visibili per l'utente corrente.
 * null = vede tutte le categorie (admin/familiare)
 */
function categorieVisibiliUtente() {
  if (isEsterno()) {
    return currentUserData?.categorieVisibili || [];
  }
  return null; // nessun filtro
}

function mapAuthError(code) {
  const messaggi = {
    "auth/user-not-found": "Utente non trovato.",
    "auth/wrong-password": "Password errata.",
    "auth/invalid-email": "Email non valida.",
    "auth/too-many-requests": "Troppi tentativi falliti. Riprova più tardi.",
    "auth/invalid-credential": "Credenziali non valide.",
  };
  return messaggi[code] || "Errore di autenticazione. Riprova.";
}

/**
 * Observer centrale: tiene sincronizzato lo stato auth con la UI.
 * Va collegato in app.js
 */
function onAuthChange(callback) {
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
      try {
        await caricaDatiUtente(user.uid);
      } catch (err) {
        console.error(err);
        await logout();
        callback(null, err.message);
        return;
      }
    } else {
      currentUserData = null;
    }
    callback(user);
  });
}
