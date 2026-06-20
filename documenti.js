// ============================================================
// DOCUMENTI.JS - CRUD documenti (Firestore) + file (Storage)
// ============================================================

const COLLECTION_DOCUMENTI = "documenti";
const COLLECTION_CATEGORIE = "categorie";

/**
 * Carica la lista categorie esistenti (per popolare select / filtri).
 * Le categorie sono dati, non sono hardcoded: la lista cresce con l'uso.
 */
async function caricaCategorie() {
  const snap = await db.collection(COLLECTION_CATEGORIE).orderBy("nome").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function creaCategoria(nome, icona = null, colore = null) {
  const ref = await db.collection(COLLECTION_CATEGORIE).add({
    nome,
    icona,
    colore,
    creataIl: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Carica un nuovo documento: file su Storage + metadata su Firestore.
 * @param {File} file - file selezionato dall'utente
 * @param {Object} meta - { titolo, categoria, tag, intestatario, dataDocumento, visibilita }
 * @param {Function} onProgress - callback (percentuale 0-100)
 */
async function caricaDocumento(file, meta, onProgress) {
  if (!currentUser) throw new Error("Devi essere autenticato per caricare documenti.");

  // 1. Crea prima il documento Firestore per ottenere un docId stabile
  const docRef = db.collection(COLLECTION_DOCUMENTI).doc();
  const docId = docRef.id;

  // 2. Path su Storage organizzato per categoria/docId
  const estensione = file.name.split(".").pop();
  const storagePath = `documenti/${meta.categoria}/${docId}/originale.${estensione}`;
  const storageRef = storage.ref(storagePath);

  // 3. Upload con tracking progresso
  const uploadTask = storageRef.put(file);

  await new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(pct);
      },
      (err) => reject(err),
      () => resolve()
    );
  });

  // 4. Scrivi i metadata su Firestore
  await docRef.set({
    titolo: meta.titolo,
    categoria: meta.categoria,
    tag: meta.tag || [],
    intestatario: meta.intestatario || "",
    dataDocumento: meta.dataDocumento
      ? firebase.firestore.Timestamp.fromDate(new Date(meta.dataDocumento))
      : null,
    dataCaricamento: firebase.firestore.FieldValue.serverTimestamp(),
    storageRef: storagePath,
    thumbnailRef: null,
    caricatoDa: currentUser.uid,
    visibilita: meta.visibilita || "famiglia",
  });

  return docId;
}

/**
 * Query documenti con filtri opzionali.
 * @param {Object} filtri - { categoria, tag, intestatario, testoRicerca }
 */
async function cercaDocumenti(filtri = {}) {
  let query = db.collection(COLLECTION_DOCUMENTI);

  if (filtri.categoria) {
    query = query.where("categoria", "==", filtri.categoria);
  }
  if (filtri.intestatario) {
    query = query.where("intestatario", "==", filtri.intestatario);
  }
  if (filtri.tag) {
    query = query.where("tag", "array-contains", filtri.tag);
  }

  query = query.orderBy("dataCaricamento", "desc");

  const snap = await query.get();
  let risultati = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Filtro lato client per ruolo "esterno" (categorie consentite)
  const categorieConsentite = categorieVisibiliUtente();
  if (categorieConsentite !== null) {
    risultati = risultati.filter((doc) => categorieConsentite.includes(doc.categoria));
  }

  // Ricerca testuale semplice su titolo (Firestore non supporta full-text nativo)
  if (filtri.testoRicerca) {
    const q = filtri.testoRicerca.toLowerCase();
    risultati = risultati.filter(
      (doc) =>
        doc.titolo?.toLowerCase().includes(q) ||
        doc.tag?.some((t) => t.toLowerCase().includes(q))
    );
  }

  return risultati;
}

/**
 * Ottiene l'URL di download temporaneo per un file su Storage.
 */
async function ottieniUrlDownload(storagePath) {
  return await storage.ref(storagePath).getDownloadURL();
}

async function eliminaDocumento(docId, storagePath) {
  await storage.ref(storagePath).delete().catch((err) => {
    // Se il file non esiste più su storage, non blocchiamo l'eliminazione del metadato
    console.warn("File storage non trovato o già eliminato:", err.message);
  });
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).delete();
}

async function aggiornaDocumento(docId, modifiche) {
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).update(modifiche);
}
