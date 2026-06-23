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

    allegati.push({ nomeFile: file.name, storageRef: storagePath, dimensione: file.size });
  }

  await docRef.set({
    titolo: meta.titolo,
    categoria: meta.categoria,
    tag: meta.tag || [],
    intestatario: meta.intestatario || "",
    dataDocumento: meta.dataDocumento
      ? firebase.firestore.Timestamp.fromDate(new Date(meta.dataDocumento))
      : null,
    dataScadenza: meta.dataScadenza
      ? firebase.firestore.Timestamp.fromDate(new Date(meta.dataScadenza))
      : null,
    giorniPreavviso: meta.giorniPreavviso || 30,
    dataCaricamento: firebase.firestore.FieldValue.serverTimestamp(),
    allegati,
    thumbnailRef: null,
    caricatoDa: currentUser.uid,
    visibilita: meta.visibilita || "famiglia",
  });

  return docId;
}

function ottieniAllegati(doc) {
  if (Array.isArray(doc.allegati) && doc.allegati.length > 0) {
    return doc.allegati;
  }
  if (doc.storageRef) {
    return [{ nomeFile: doc.titolo || "File", storageRef: doc.storageRef, dimensione: null }];
  }
  return [];
}

/**
 * Calcola lo stato di scadenza di un documento.
 * Restituisce: "scaduto" | "in_scadenza" | "ok" | null (nessuna scadenza)
 */
function statoScadenza(doc) {
  if (!doc.dataScadenza) return null;
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const scadenza = new Date(doc.dataScadenza.seconds * 1000);
  scadenza.setHours(0, 0, 0, 0);
  const giorniPreavviso = doc.giorniPreavviso || 30;
  const msPreavviso = giorniPreavviso * 24 * 60 * 60 * 1000;

  if (scadenza < oggi) return "scaduto";
  if (scadenza - oggi <= msPreavviso) return "in_scadenza";
  return "ok";
}

async function cercaDocumenti(filtri = {}) {
  const categorieConsentite = categorieVisibiliUtente();
  let risultati;

  if (categorieConsentite !== null) {
    const queries = categorieConsentite.map((cat) =>
      db.collection(COLLECTION_DOCUMENTI).where("categoria", "==", cat).get()
    );
    const snapshots = await Promise.all(queries);
    risultati = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } else {
    const snap = await db.collection(COLLECTION_DOCUMENTI).get();
    risultati = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // Ordinamento: per dataDocumento (più recenti prima), senza data in fondo
  risultati.sort((a, b) => {
    const da = a.dataDocumento?.seconds ?? -Infinity;
    const db_ = b.dataDocumento?.seconds ?? -Infinity;
    return db_ - da;
  });

  if (filtri.categoria) {
    risultati = risultati.filter((doc) => doc.categoria === filtri.categoria);
  }
  if (filtri.anno) {
    risultati = risultati.filter((doc) => {
      if (!doc.dataDocumento) return false;
      return new Date(doc.dataDocumento.seconds * 1000).getFullYear() === parseInt(filtri.anno);
    });
  }
  if (filtri.soloScadenze) {
    risultati = risultati.filter((doc) =>
      statoScadenza(doc) === "scaduto" || statoScadenza(doc) === "in_scadenza"
    );
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

async function eliminaDocumento(docId, doc) {
  const allegati = ottieniAllegati(doc);
  await Promise.all(
    allegati.map((a) =>
      storage.ref(a.storageRef).delete().catch((err) => {
        console.warn("File storage non trovato o già eliminato:", err.message);
      })
    )
  );
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).delete();
}

async function aggiornaDocumento(docId, modifiche) {
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).update(modifiche);
}

/**
 * Elimina un singolo allegato da un documento esistente.
 * Rimuove il file da Storage e aggiorna l'array "allegati" in Firestore.
 * Se era l'ultimo allegato, elimina l'intero documento.
 */
async function eliminaAllegato(docId, doc, allegatoIdx) {
  const allegati = ottieniAllegati(doc);
  const allegato = allegati[allegatoIdx];
  if (!allegato) throw new Error("Allegato non trovato.");

  // Elimina il file da Storage
  await storage.ref(allegato.storageRef).delete().catch((err) => {
    console.warn("File storage non trovato o già eliminato:", err.message);
  });

  const allegatiAggiornati = allegati.filter((_, idx) => idx !== allegatoIdx);

  if (allegatiAggiornati.length === 0) {
    // Era l'ultimo allegato: elimina l'intero documento
    await db.collection(COLLECTION_DOCUMENTI).doc(docId).delete();
    return null; // segnala che il documento è stato eliminato
  }

  // Aggiorna Firestore con l'array allegati senza quello eliminato
  await db.collection(COLLECTION_DOCUMENTI).doc(docId).update({
    allegati: allegatiAggiornati,
  });

  return allegatiAggiornati;
}

async function aggiungiAllegati(docId, doc, nuoviFile, onProgress) {
  if (!currentUser) throw new Error("Devi essere autenticato per aggiungere allegati.");

  const listaFile = Array.from(nuoviFile);
  if (listaFile.length === 0) throw new Error("Nessun file selezionato.");

  const allegatiEsistenti = ottieniAllegati(doc);
  const dimensioneTotale = listaFile.reduce((tot, f) => tot + f.size, 0);
  let caricatoTotale = 0;
  const nuoviAllegati = [];

  for (const file of listaFile) {
    const estensione = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const storagePath = `documenti/${doc.categoria}/${docId}/${Date.now()}_${estensione}`;
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

    nuoviAllegati.push({ nomeFile: file.name, storageRef: storagePath, dimensione: file.size });
  }

  const allegatiAggiornati = [...allegatiEsistenti, ...nuoviAllegati];
  const aggiornamento = { allegati: allegatiAggiornati };
  if (doc.storageRef) {
    aggiornamento.storageRef = firebase.firestore.FieldValue.delete();
  }

  await db.collection(COLLECTION_DOCUMENTI).doc(docId).update(aggiornamento);
  return allegatiAggiornati;
}
