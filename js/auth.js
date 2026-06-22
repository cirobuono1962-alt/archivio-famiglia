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

/**
 * Vede E modifica/carica/elimina tutti i documenti (esclusa gestione categorie/utenti).
 */
function isFamiliare() {
  return currentUserData?.ruolo === "familiare" || isAdmin();
}

/**
 * Vede tutti i documenti di tutte le categorie, ma NON può modificare,
 * caricare o eliminare nulla (sola consultazione).
 */
function isLettore() {
  return currentUserData?.ruolo === "lettore";
}

/**
 * Vede solo le categorie a lui assegnate, non può modificare nulla.
 */
function isEsterno() {
  return currentUserData?.ruolo === "esterno";
}

/**
 * True se l'utente può caricare/modificare/eliminare documenti.
 * (admin e familiare possono scrivere; lettore ed esterno solo leggere)
 */
function puoScrivere() {
  return isFamiliare(); // isFamiliare() include già isAdmin()
}

/**
 * Restituisce le categorie visibili per l'utente corrente.
 * null = vede tutte le categorie (admin/familiare/lettore)
 * array = vede solo quelle elencate (esterno)
 */
function categorieVisibiliUtente() {
  if (isEsterno()) {
    return currentUserData?.categorieVisibili || [];
  }
  return null; // nessun filtro: admin, familiare, lettore vedono tutto
}

/**
 * Invia un'email di reset password all'indirizzo indicato.
 * Non richiede che l'utente sia loggato.
 */
async function inviaResetPassword(email) {
  try {
    await auth.sendPasswordResetEmail(email.trim().toLowerCase());
  } catch (err) {
    throw mapAuthError(err.code);
  }
}

/**
 * Cambia la password dell'utente attualmente loggato.
 * Firebase richiede che il login sia recente — se l'utente è loggato
 * da troppo tempo, Firebase lancia un errore "requires-recent-login"
 * e bisogna chiedere di fare logout e login di nuovo.
 */
async function cambiaPassword(nuovaPassword) {
  if (!currentUser) throw new Error("Devi essere autenticato.");
  try {
    await currentUser.updatePassword(nuovaPassword);
  } catch (err) {
    if (err.code === "auth/requires-recent-login") {
      throw "Per motivi di sicurezza, devi fare logout e login di nuovo prima di cambiare la password.";
    }
    throw mapAuthError(err.code);
  }
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
