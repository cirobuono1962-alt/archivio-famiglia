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

async function cercaDocumenti(filtri = {}) {
  const query = db.collection(COLLECTION_DOCUMENTI).orderBy("dataCaricamento", "desc");

  const snap = await query.get();
  let risultati = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filtri.categoria) {
    risultati = risultati.filter((doc) => doc.categoria === filtri.categoria);
  }
  if (filtri.intestatario) {
    risultati = risultati.filter((doc) => doc.intestatario === filtri.intestatario);
  }
  if (filtri.tag) {
    risultati = risultati.filter((doc) => (doc.tag || []).includes(filtri.tag));
  }

  const categorieConsentite = categorieVisibiliUtente();
  if (categorieConsentite !== null) {
    risultati = risultati.filter((doc) => categorieConsentite.includes(doc.categoria));
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
