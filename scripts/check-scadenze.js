// ============================================================
// CHECK-SCADENZE.JS
// Gira ogni giorno tramite GitHub Actions.
// Controlla documenti in scadenza e appuntamenti del giorno/domani
// e manda un messaggio riassuntivo su Telegram.
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

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
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: testo, parse_mode: "HTML" }),
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
  const data = new Date(timestamp.seconds * 1000);
  data.setHours(0, 0, 0, 0);
  return Math.round((data - oggi) / (1000 * 60 * 60 * 24));
}

async function checkScadenze() {
  console.log("Avvio controllo scadenze:", new Date().toISOString());

  // ---- DOCUMENTI IN SCADENZA ----
  const snapDoc = await db.collection("documenti").get();
  const scaduti = [];
  const inScadenza = [];

  for (const docSnap of snapDoc.docs) {
    const doc = docSnap.data();
    if (!doc.dataScadenza) continue;
    const giorniPreavviso = doc.giorniPreavviso || 30;
    const giorni = giorniAlla(doc.dataScadenza);
    if (giorni < 0) {
      scaduti.push({ ...doc });
    } else if (giorni === giorniPreavviso || giorni === 0) {
      inScadenza.push({ ...doc, giorni });
    }
  }

  // ---- APPUNTAMENTI OGGI E DOMANI ----
  const snapApp = await db.collection("appuntamenti").get();
  const appOggi = [];
  const appDomani = [];

  for (const appSnap of snapApp.docs) {
    const app = appSnap.data();
    if (!app.dataOra) continue;
    const giorni = giorniAlla(app.dataOra);
    if (giorni === 0) appOggi.push(app);
    else if (giorni === 1) appDomani.push(app);
  }

  const nessunDocumento = scaduti.length === 0 && inScadenza.length === 0;
  const nessunAppuntamento = appOggi.length === 0 && appDomani.length === 0;

  if (nessunDocumento && nessunAppuntamento) {
    console.log("Nessuna notifica da inviare oggi.");
    return;
  }

  let messaggio = "📁 <b>Archivio Famiglia — Avvisi del giorno</b>\n\n";

  // Documenti scaduti
  if (scaduti.length > 0) {
    messaggio += "🔴 <b>Documenti scaduti:</b>\n";
    for (const d of scaduti) {
      const giorniFA = Math.abs(giorniAlla(d.dataScadenza));
      messaggio += `• <b>${d.titolo}</b> (${d.categoria}`;
      if (d.intestatario) messaggio += ` — ${d.intestatario}`;
      messaggio += `)\n  Scaduto il ${formatData(d.dataScadenza)} (${giorniFA} giorn${giorniFA === 1 ? "o" : "i"} fa)\n\n`;
    }
  }

  // Documenti in scadenza
  if (inScadenza.length > 0) {
    messaggio += "🟡 <b>Documenti in scadenza:</b>\n";
    for (const d of inScadenza) {
      messaggio += `• <b>${d.titolo}</b> (${d.categoria}`;
      if (d.intestatario) messaggio += ` — ${d.intestatario}`;
      messaggio += `)\n  Scade il ${formatData(d.dataScadenza)}`;
      if (d.giorni === 0) messaggio += " — <b>oggi!</b>";
      else messaggio += ` — mancano ${d.giorni} giorn${d.giorni === 1 ? "o" : "i"}`;
      messaggio += "\n\n";
    }
  }

  // Appuntamenti oggi
  if (appOggi.length > 0) {
    messaggio += "📅 <b>Appuntamenti di oggi:</b>\n";
    for (const a of appOggi) {
      messaggio += `• <b>${a.titolo}</b>`;
      if (a.ora) messaggio += ` alle ${a.ora}`;
      if (a.descrizione) messaggio += `\n  ${a.descrizione}`;
      messaggio += "\n\n";
    }
  }

  // Appuntamenti domani
  if (appDomani.length > 0) {
    messaggio += "🔔 <b>Appuntamenti di domani:</b>\n";
    for (const a of appDomani) {
      messaggio += `• <b>${a.titolo}</b>`;
      if (a.ora) messaggio += ` alle ${a.ora}`;
      if (a.descrizione) messaggio += `\n  ${a.descrizione}`;
      messaggio += "\n\n";
    }
  }

  messaggio += `🔗 <a href="https://cirobuono1962-alt.github.io/archivio-famiglia/">Apri l'archivio</a>`;

  await mandaMessaggioTelegram(messaggio);
  console.log(`Messaggio inviato.`);
}

checkScadenze().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
