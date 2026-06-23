Eccolo:
javascript// ============================================================
// CHECK-SCADENZE.JS
// Gira ogni giorno tramite GitHub Actions.
// Controlla i documenti in scadenza su Firestore e manda
// un messaggio riassuntivo su Telegram.
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Credenziali Firebase dal Secret di GitHub (JSON della service account)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function mandaMessaggioTelegram(testo) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: testo,
      parse_mode: "HTML",
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error("Telegram API error: " + JSON.stringify(data));
}

function formatData(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp.seconds * 1000).toLocaleDateString("it-IT");
}

function giorniAlla(timestamp) {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const scadenza = new Date(timestamp.seconds * 1000);
  scadenza.setHours(0, 0, 0, 0);
  return Math.round((scadenza - oggi) / (1000 * 60 * 60 * 24));
}

async function checkScadenze() {
  console.log("Avvio controllo scadenze:", new Date().toISOString());

  const snap = await db.collection("documenti").get();
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const scaduti = [];
  const inScadenza = [];

  for (const docSnap of snap.docs) {
    const doc = docSnap.data();
    if (!doc.dataScadenza) continue;

    const giorniPreavviso = doc.giorniPreavviso || 30;
    const giorni = giorniAlla(doc.dataScadenza);

    if (giorni < 0) {
      scaduti.push({ titolo: doc.titolo, categoria: doc.categoria, intestatario: doc.intestatario, giorni, dataScadenza: doc.dataScadenza });
    } else if (giorni === giorniPreavviso || giorni === 0) {
      inScadenza.push({ titolo: doc.titolo, categoria: doc.categoria, intestatario: doc.intestatario, giorni, dataScadenza: doc.dataScadenza });
    }
  }

  if (scaduti.length === 0 && inScadenza.length === 0) {
    console.log("Nessuna scadenza da segnalare oggi.");
    return;
  }

  let messaggio = "📁 <b>Archivio Famiglia — Avvisi scadenze</b>\n\n";

  if (scaduti.length > 0) {
    messaggio += "🔴 <b>Documenti scaduti:</b>\n";
    for (const d of scaduti) {
      const giorniFA = Math.abs(d.giorni);
      messaggio += `• <b>${d.titolo}</b> (${d.categoria}`;
      if (d.intestatario) messaggio += ` — ${d.intestatario}`;
      messaggio += `)\n  Scaduto il ${formatData(d.dataScadenza)} (${giorniFA} giorn${giorniFA === 1 ? "o" : "i"} fa)\n\n`;
    }
  }

  if (inScadenza.length > 0) {
    messaggio += "🟡 <b>In scadenza:</b>\n";
    for (const d of inScadenza) {
      messaggio += `• <b>${d.titolo}</b> (${d.categoria}`;
      if (d.intestatario) messaggio += ` — ${d.intestatario}`;
      messaggio += `)\n  Scade il ${formatData(d.dataScadenza)}`;
      if (d.giorni === 0) messaggio += " — <b>oggi!</b>";
      else messaggio += ` — mancano ${d.giorni} giorn${d.giorni === 1 ? "o" : "i"}`;
      messaggio += "\n\n";
    }
  }

  messaggio += `🔗 <a href="https://cirobuono1962-alt.github.io/archivio-famiglia/">Apri l'archivio</a>`;

  await mandaMessaggioTelegram(messaggio);
  console.log(`Messaggio inviato: ${scaduti.length} scaduti, ${inScadenza.length} in scadenza.`);
}

checkScadenze().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
Incollalo tutto in scripts/check-scadenze.js, fai commit, poi Run workflow di nuovo.
