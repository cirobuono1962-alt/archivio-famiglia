// ============================================================
// DOCUMENTI.JS - CRUD documenti (Firestore) + file (Storage)
// ============================================================

const COLLECTION_DOCUMENTI = "documenti";
const COLLECTION_CATEGORIE = "categorie";

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

async function caricaDocumento(file, meta, onProgress) {
  if (!currentUser) throw new Error("Devi essere autenticato per caricare documenti.");

  const docRef = db.collection(COLLECTION_DOCUMENTI).doc();
  const docId = docRef.id;

  const estensione = file.name.split(".").pop();
  const storagePath = `documenti/${meta.categoria}/${docId}/originale.${estensione}`;
  const storageRef = storage.ref(storagePath);

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
 *
 * IMPORTANTE: per gli utenti con ruolo "esterno", la query a Firestore
 * DEVE filtrare per categoria lato server con .where(), perché le
 * Security Rules negano la lettura dei singoli documenti di categorie
 * non consentite. Se la query provasse a leggere TUTTI i documenti
 * (anche quelli di categorie vietate) per poi filtrare lato client,
 * Firestore restituirebbe un errore di permessi sull'intera lettura,
 * non solo sui documenti vietati.
 *
 * Per admin/familiare invece (che vedono tutto), manteniamo la lettura
 * senza .where() combinato con orderBy, per evitare la necessità di
 * creare indici compositi manualmente.
 */
async function cercaDocumenti(filtri = {}) {
  const categorieConsentite = categorieVisibiliUtente(); // null per admin/familiare, array per esterno

  let risultati;

  if (categorieConsentite !== null) {
    // Ruolo "esterno": leggiamo solo le categorie consentite, una query per categoria.
    // Necessario per rispettare le Security Rules (vedi nota sopra).
    const queries = categorieConsentite.map((cat) =>
      db.collection(COLLECTION_DOCUMENTI).where("categoria", "==", cat).get()
    );
    const snapshots = await Promise.all(queries);
    risultati = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));

    // Ordiniamo lato client per data di caricamento (più recenti prima),
    // dato che qui non possiamo usare orderBy combinato senza indice composito.
    risultati.sort((a, b) => {
      const da = a.dataCaricamento?.seconds || 0;
      const db_ = b.dataCaricamento?.seconds || 0;
      return db_ - da;
    });
  } else {
    // Ruolo admin/familiare: vede tutto, lettura semplice + filtro lato client.
    const snap = await db.collection(COLLECTION_DOCUMENTI).orderBy("dataCaricamento", "desc").get();
    risultati = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  if (filtri.categoria) {
    risultati = risultati.filter((doc) => doc.categoria === filtri.categoria);
  }
  if (filtri.intestatario) {
    risultati = risultati.filter((doc) => doc.intestatario === filtri.intestatario);
  }
  if (filtri.tag) {
    risultati = risultati.filter((doc) => (doc.tag || []).includes(filtri.tag));
  }

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

async function ottieniUrlDownload(storagePath) {
  return await storage.ref(storagePath).getDownloadURL();
}

async function eliminaDocumento(docId, storagePath) {
  await storage.ref(storagePath).delete().catch((err) => {
    console.warn("File storage non trovato o già eliminato:", err.message);
  });
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).delete();
}

async function aggiornaDocumento(docId, modifiche) {
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).update(modifiche);
}
