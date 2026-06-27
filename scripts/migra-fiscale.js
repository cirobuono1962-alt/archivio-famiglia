// ============================================================
// MIGRA-FISCALE.JS
// Script di migrazione una-tantum: sposta i file fisici su
// Firebase Storage nella cartella corretta per tutti i documenti
// con categoria "Fiscale" che hanno storageRef sbagliato.
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({
  credential: cert(serviceAccount),
  storageBucket: "archivio-famiglia-buono.firebasestorage.app",
});

const db = getFirestore();
const bucket = getStorage().bucket();

/**
 * Scarica un file da Storage in una cartella temporanea locale.
 */
async function scaricaFile(storagePath, localPath) {
  await bucket.file(storagePath).download({ destination: localPath });
}

/**
 * Carica un file locale su Storage.
 */
async function caricaFile(localPath, storagePath) {
  await bucket.upload(localPath, { destination: storagePath });
}

/**
 * Elimina un file da Storage.
 */
async function eliminaFile(storagePath) {
  await bucket.file(storagePath).delete().catch((err) => {
    console.warn(`  ⚠️  File non trovato o già eliminato: ${storagePath}`);
  });
}

async function migra() {
  console.log("=== Migrazione documenti Fiscale ===\n");

  const snap = await db.collection("documenti")
    .where("categoria", "==", "Fiscale")
    .get();

  console.log(`Trovati ${snap.docs.length} documenti con categoria "Fiscale"\n`);

  let migrati = 0;
  let inalterati = 0;
  let errori = 0;

  for (const docSnap of snap.docs) {
    const doc = docSnap.data();
    const docId = docSnap.id;
    console.log(`Documento: "${doc.titolo}" (${docId})`);

    // Supporta sia formato vecchio (storageRef singolo) che nuovo (allegati array)
    const allegati = Array.isArray(doc.allegati) && doc.allegati.length > 0
      ? doc.allegati
      : doc.storageRef
        ? [{ nomeFile: doc.titolo, storageRef: doc.storageRef, dimensione: null }]
        : [];

    if (allegati.length === 0) {
      console.log("  ⚠️  Nessun allegato trovato, saltato.\n");
      continue;
    }

    let documentoModificato = false;
    const allegatiAggiornati = [];

    for (const allegato of allegati) {
      const vecchioPath = allegato.storageRef;

      // Controlla se il path è già corretto
      if (vecchioPath.startsWith("documenti/Fiscale/")) {
        console.log(`  ✅ ${allegato.nomeFile} — già in Fiscale`);
        allegatiAggiornati.push(allegato);
        continue;
      }

      // Path sbagliato — bisogna spostare il file
      // Nuovo path: documenti/Fiscale/{docId}/{nomefile}
      const nomeFileOriginale = vecchioPath.split("/").pop();
      const nuovoPath = `documenti/Fiscale/${docId}/${nomeFileOriginale}`;

      console.log(`  🔄 ${allegato.nomeFile}`);
      console.log(`     Da: ${vecchioPath}`);
      console.log(`     A:  ${nuovoPath}`);

      try {
        // Scarica in temp, ricarica nel nuovo path, elimina il vecchio
        const tmpFile = path.join(os.tmpdir(), `migrazione_${Date.now()}_${nomeFileOriginale}`);
        await scaricaFile(vecchioPath, tmpFile);
        await caricaFile(tmpFile, nuovoPath);
        await eliminaFile(vecchioPath);
        fs.unlinkSync(tmpFile);

        allegatiAggiornati.push({ ...allegato, storageRef: nuovoPath });
        documentoModificato = true;
        console.log(`     ✅ Spostato con successo`);
      } catch (err) {
        console.error(`     ❌ Errore: ${err.message}`);
        allegatiAggiornati.push(allegato); // mantieni il vecchio path se fallisce
        errori++;
      }
    }

    // Aggiorna Firestore solo se qualcosa è cambiato
    if (documentoModificato) {
      const aggiornamento = {};
      if (Array.isArray(doc.allegati)) {
        aggiornamento.allegati = allegatiAggiornati;
      } else {
        // Formato vecchio con storageRef singolo
        aggiornamento.storageRef = allegatiAggiornati[0].storageRef;
      }
      await db.collection("documenti").doc(docId).update(aggiornamento);
      console.log(`  📝 Firestore aggiornato\n`);
      migrati++;
    } else {
      console.log(`  ℹ️  Nessuna modifica necessaria\n`);
      inalterati++;
    }
  }

  console.log("=== Riepilogo ===");
  console.log(`✅ Migrati:    ${migrati}`);
  console.log(`ℹ️  Inalterati: ${inalterati}`);
  console.log(`❌ Errori:     ${errori}`);

  if (errori > 0) {
    console.error("\nAttenzione: alcuni file non sono stati migrati. Riesegui lo script.");
    process.exit(1);
  }
}

migra().catch((err) => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
