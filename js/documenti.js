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

/**
 * Carica un nuovo documento con uno o più file allegati.
 * @param {FileList|File[]} files - uno o più file selezionati dall'utente
 * @param {Object} meta - { titolo, categoria, tag, intestatario, dataDocumento, visibilita }
 * @param {Function} onProgress - callback (percentuale 0-100, calcolata sul totale di tutti i file)
 */
async function caricaDocumento(files, meta, onProgress) {
  if (!currentUser) throw new Error("Devi essere autenticato per caricare documenti.");

  const listaFile = Array.from(files);
  if (listaFile.length === 0) throw new Error("Nessun file selezionato.");

  const docRef = db.collection(COLLECTION_DOCUMENTI).doc();
  const docId = docRef.id;

  const dimensioneTotale = listaFile.reduce((tot, f) => tot + f.size, 0);
  let caricatoTotale = 0;

  const allegati = [];

  for (const file of listaFile) {
    const estensione = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    // Nome file sanificato per evitare problemi di path (manteniamo il nome originale come metadata separato)
    const storagePath = `documenti/${meta.categoria}/${docId}/${Date.now()}_${estensione}`;
    const storageRef = storage.ref(storagePath);
    const uploadTask = storageRef.put(file);

    let caricatoFilePrecedente = 0;

    await new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const incremento = snapshot.bytesTransferred - caricatoFilePrecedente;
          caricatoFilePrecedente = snapshot.bytesTransferred;
          caricatoTotale += incremento;
          if (onProgress) onProgress((caricatoTotale / dimensioneTotale) * 100);
        },
        (err) => reject(err),
        () => resolve()
      );
    });

    allegati.push({
      nomeFile: file.name,
      storageRef: storagePath,
      dimensione: file.size,
    });
  }

  await docRef.set({
    titolo: meta.titolo,
    categoria: meta.categoria,
    tag: meta.tag || [],
    intestatario: meta.intestatario || "",
    dataDocumento: meta.dataDocumento
      ? firebase.firestore.Timestamp.fromDate(new Date(meta.dataDocumento))
      : null,
    dataCaricamento: firebase.firestore.FieldValue.serverTimestamp(),
    allegati: allegati,
    thumbnailRef: null,
    caricatoDa: currentUser.uid,
    visibilita: meta.visibilita || "famiglia",
  });

  return docId;
}

/**
 * Restituisce la lista allegati di un documento, gestendo la retrocompatibilità
 * con i documenti vecchi che avevano un singolo campo "storageRef" invece
 * dell'array "allegati".
 */
function ottieniAllegati(doc) {
  if (Array.isArray(doc.allegati) && doc.allegati.length > 0) {
    return doc.allegati;
  }
  // Formato vecchio: un solo file su storageRef diretto
  if (doc.storageRef) {
    return [{ nomeFile: doc.titolo || "File", storageRef: doc.storageRef, dimensione: null }];
  }
  return [];
}

/**
 * Query documenti con filtri opzionali.
 * @param {Object} filtri - { categoria, tag, intestatario, testoRicerca }
 */
async function cercaDocumenti(filtri = {}) {
  const categorieConsentite = categorieVisibiliUtente();

  let risultati;

  if (categorieConsentite !== null) {
    const queries = categorieConsentite.map((cat) =>
      db.collection(COLLECTION_DOCUMENTI).where("categoria", "==", cat).get()
    );
    const snapshots = await Promise.all(queries);
    risultati = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));

    risultati.sort((a, b) => {
      const da = a.dataCaricamento?.seconds || 0;
      const db_ = b.dataCaricamento?.seconds || 0;
      return db_ - da;
    });
  } else {
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

/**
 * Elimina un documento e tutti i suoi allegati (gestisce sia il formato
 * nuovo con array "allegati" che il vecchio con "storageRef" singolo).
 */
async function eliminaDocumento(docId, doc) {
  const allegati = ottieniAllegati(doc);

  await Promise.all(
    allegati.map((a) =>
      storage
        .ref(a.storageRef)
        .delete()
        .catch((err) => {
          console.warn("File storage non trovato o già eliminato:", err.message);
        })
    )
  );

  await db.collection(COLLECTION_DOCUMENTI).doc(docId).delete();
}

async function aggiornaDocumento(docId, modifiche) {
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).update(modifiche);
}
