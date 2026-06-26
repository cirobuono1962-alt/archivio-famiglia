// ============================================================
// AGENDA.JS - Gestione appuntamenti (tab dentro la SPA)
// Il login e l'init sono gestiti da app.js
// ============================================================

const COLLECTION_APPUNTAMENTI = "appuntamenti";
let appuntamentiCache = [];
let appuntamentoInModifica = null;

// Listener per il fab e la modale appuntamento — aggiunti dopo il DOMContentLoaded di app.js
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("fab-aggiungi").addEventListener("click", apriModaleNuovoAppuntamento);
  document.getElementById("btn-chiudi-modale-app").addEventListener("click", chiudiModaleAppuntamento);
  document.getElementById("form-appuntamento").addEventListener("submit", gestisciSalvaAppuntamento);
});

async function renderListaAppuntamenti() {
  const container = document.getElementById("lista-appuntamenti");
  container.innerHTML = '<div class="stato-vuoto">Caricamento...</div>';

  try {
    const snap = await db.collection(COLLECTION_APPUNTAMENTI).orderBy("dataOra", "asc").get();
    appuntamentiCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (appuntamentiCache.length === 0) {
      container.innerHTML = '<div class="stato-vuoto">Nessun appuntamento. Usa il + per aggiungerne uno.</div>';
      return;
    }

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    const futuri = appuntamentiCache.filter((a) => {
      const d = new Date(a.dataOra.seconds * 1000);
      d.setHours(0, 0, 0, 0);
      return d >= oggi;
    });

    const passati = appuntamentiCache.filter((a) => {
      const d = new Date(a.dataOra.seconds * 1000);
      d.setHours(0, 0, 0, 0);
      return d < oggi;
    });

    let html = "";
    if (futuri.length > 0) {
      html += '<div class="sezione-titolo">Prossimi appuntamenti</div>';
      html += futuri.map(renderCardAppuntamento).join("");
    }
    if (passati.length > 0) {
      html += '<div class="sezione-titolo" style="margin-top:28px;">Passati</div>';
      html += passati.slice().reverse().map(renderCardAppuntamento).join("");
    }

    container.innerHTML = html;
    container.querySelectorAll(".card-appuntamento").forEach((card) => {
      card.addEventListener("click", () => apriDettaglioAppuntamento(card.dataset.id));
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="stato-vuoto">Errore: ${err.code || ""} ${err.message || String(err)}</div>`;
  }
}

function renderCardAppuntamento(app) {
  const data = new Date(app.dataOra.seconds * 1000);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const dataApp = new Date(data);
  dataApp.setHours(0, 0, 0, 0);

  const giorno = data.getDate();
  const mese = data.toLocaleDateString("it-IT", { month: "short" });
  const anno = data.getFullYear();

  const isOggi = dataApp.getTime() === oggi.getTime();
  const isPassato = dataApp < oggi;
  const classeExtra = isOggi ? "oggi" : isPassato ? "passato" : "";
  const badgeOggi = isOggi ? '<span class="tag-pill" style="background:#fff3e0; border-color:#ff9800; color:#e65100;">Oggi</span>' : "";

  return `
    <div class="card-appuntamento ${classeExtra}" data-id="${app.id}">
      <div class="data-badge">
        <div class="giorno">${giorno}</div>
        <div class="mese">${mese} ${anno}</div>
      </div>
      <div class="info" style="flex:1; min-width:0;">
        <div class="titolo">${escapeHtml(app.titolo)}</div>
        <div class="dettagli">
          ${app.ora ? `🕐 ${app.ora}` : "Orario non specificato"}
          ${app.descrizione ? ` · ${escapeHtml(app.descrizione.substring(0, 50))}${app.descrizione.length > 50 ? "..." : ""}` : ""}
        </div>
        <div style="margin-top:4px">${badgeOggi}</div>
      </div>
    </div>
  `;
}

function apriDettaglioAppuntamento(appId) {
  const app = appuntamentiCache.find((a) => a.id === appId);
  if (!app) return;

  const data = new Date(app.dataOra.seconds * 1000);
  const dataStr = data.toLocaleDateString("it-IT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const html = `
    <div class="overlay" id="overlay-dettaglio-app">
      <div class="modale">
        <h2>${escapeHtml(app.titolo)}</h2>
        <p style="color:var(--colore-testo-secondario); margin-bottom:8px;">
          📅 ${dataStr}${app.ora ? ` · 🕐 ${app.ora}` : ""}
        </p>
        ${app.descrizione ? `<p style="font-size:0.9rem; margin-bottom:16px;">${escapeHtml(app.descrizione)}</p>` : ""}
        ${puoScrivere() ? '<button class="btn btn-secondario btn-blocco" id="btn-modifica-app" style="margin-bottom:10px">Modifica</button>' : ""}
        ${puoScrivere() ? '<button class="btn btn-pericolo btn-blocco" id="btn-elimina-app" style="margin-bottom:10px">Elimina</button>' : ""}
        <button class="btn btn-secondario btn-blocco" id="btn-chiudi-dettaglio-app">Chiudi</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);

  document.getElementById("btn-chiudi-dettaglio-app").addEventListener("click", () => {
    document.getElementById("overlay-dettaglio-app").remove();
  });

  const btnModifica = document.getElementById("btn-modifica-app");
  if (btnModifica) {
    btnModifica.addEventListener("click", () => {
      document.getElementById("overlay-dettaglio-app").remove();
      apriModaleModificaAppuntamento(app);
    });
  }

  const btnElimina = document.getElementById("btn-elimina-app");
  if (btnElimina) {
    btnElimina.addEventListener("click", async () => {
      if (!confirm(`Eliminare l'appuntamento "${app.titolo}"?`)) return;
      try {
        await db.collection(COLLECTION_APPUNTAMENTI).doc(app.id).delete();
        document.getElementById("overlay-dettaglio-app").remove();
        await renderListaAppuntamenti();
      } catch (err) {
        alert("Errore durante l'eliminazione: " + err.message);
      }
    });
  }
}

function apriModaleNuovoAppuntamento() {
  appuntamentoInModifica = null;
  document.getElementById("modale-titolo-appuntamento").textContent = "Nuovo appuntamento";
  document.getElementById("form-appuntamento").reset();
  document.getElementById("app-data").value = new Date().toISOString().split("T")[0];
  document.getElementById("modale-appuntamento").classList.remove("nascosto");
}

function apriModaleModificaAppuntamento(app) {
  appuntamentoInModifica = app;
  document.getElementById("modale-titolo-appuntamento").textContent = "Modifica appuntamento";
  const data = new Date(app.dataOra.seconds * 1000);
  document.getElementById("app-titolo").value = app.titolo || "";
  document.getElementById("app-data").value = data.toISOString().split("T")[0];
  document.getElementById("app-ora").value = app.ora || "";
  document.getElementById("app-descrizione").value = app.descrizione || "";
  document.getElementById("modale-appuntamento").classList.remove("nascosto");
}

function chiudiModaleAppuntamento() {
  document.getElementById("modale-appuntamento").classList.add("nascosto");
  document.getElementById("form-appuntamento").reset();
  appuntamentoInModifica = null;
}

async function gestisciSalvaAppuntamento(e) {
  e.preventDefault();

  const titolo = document.getElementById("app-titolo").value.trim();
  const dataVal = document.getElementById("app-data").value;
  const ora = document.getElementById("app-ora").value;
  const descrizione = document.getElementById("app-descrizione").value.trim();

  const btn = document.getElementById("btn-salva-app");
  btn.disabled = true;
  btn.textContent = "Salvataggio...";

  try {
    const dataOra = firebase.firestore.Timestamp.fromDate(new Date(dataVal));
    const dati = {
      titolo,
      dataOra,
      ora: ora || null,
      descrizione: descrizione || null,
      caricatoDa: currentUser.uid,
    };

    if (appuntamentoInModifica) {
      await db.collection(COLLECTION_APPUNTAMENTI).doc(appuntamentoInModifica.id).update(dati);
    } else {
      await db.collection(COLLECTION_APPUNTAMENTI).add(dati);
    }

    chiudiModaleAppuntamento();
    await renderListaAppuntamenti();
  } catch (err) {
    console.error(err);
    alert("Errore durante il salvataggio: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Salva";
  }
}
