// ============================================================
// APP.JS - Archivio + Agenda (SPA unica, no file separati)
// ============================================================

let categorieCache = [];
let filtriAttivi = {};
const COLLECTION_APPUNTAMENTI = "appuntamenti";
let appuntamentiCache = [];
let appuntamentoInModifica = null;

document.addEventListener("DOMContentLoaded", () => {
  onAuthChange(async (user, erroreMsg) => {
    if (erroreMsg) { mostraErroreLogin(erroreMsg); return; }
    if (user) { mostraApp(); await inizializzaApp(); }
    else { mostraLogin(); }
  });

  document.getElementById("form-login").addEventListener("submit", gestisciLogin);
  document.getElementById("btn-logout").addEventListener("click", () => logout());
  document.getElementById("btn-cambia-password").addEventListener("click", apriModaleCambiaPassword);
  document.getElementById("btn-password-dimenticata").addEventListener("click", gestisciPasswordDimenticata);
  document.getElementById("fab-carica").addEventListener("click", apriModaleCarica);
  document.getElementById("btn-chiudi-modale").addEventListener("click", chiudiModale);
  document.getElementById("form-carica").addEventListener("submit", gestisciCaricaDocumento);
  document.getElementById("input-ricerca").addEventListener("input", debounce(applicaFiltri, 300));
  document.getElementById("select-categoria-filtro").addEventListener("change", applicaFiltri);
  document.getElementById("select-anno-filtro").addEventListener("change", applicaFiltri);
  document.getElementById("fab-aggiungi").addEventListener("click", apriModaleNuovoAppuntamento);
  document.getElementById("btn-esporta-excel").addEventListener("click", esportaExcel);
  document.getElementById("btn-stampa-scadenze").addEventListener("click", stampaScadenze);
  document.getElementById("btn-chiudi-modale-app").addEventListener("click", chiudiModaleAppuntamento);
  document.getElementById("form-appuntamento").addEventListener("submit", gestisciSalvaAppuntamento);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => cambiaTab(btn.dataset.tab));
  });
});

// ---- Tab ----

function cambiaTab(nomeTab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("attivo"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("attivo"));
  document.querySelector(`.tab-btn[data-tab="${nomeTab}"]`).classList.add("attivo");
  document.getElementById(`tab-${nomeTab}`).classList.add("attivo");
  if (nomeTab === "agenda") renderListaAppuntamenti();
  if (nomeTab === "scadenze") renderListaScadenze();
}

// ---- Auth ----

function mostraLogin() {
  document.getElementById("vista-login").classList.remove("nascosto");
  document.getElementById("vista-app").classList.add("nascosto");
}

function mostraApp() {
  document.getElementById("vista-login").classList.add("nascosto");
  document.getElementById("vista-app").classList.remove("nascosto");
}

async function gestisciLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const btn = document.getElementById("btn-login");
  const erroreEl = document.getElementById("login-errore");
  erroreEl.textContent = "";
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Accesso...';
  try {
    await login(email, password);
  } catch (err) {
    erroreEl.textContent = err;
  } finally {
    btn.disabled = false;
    btn.textContent = "Accedi";
  }
}

function mostraErroreLogin(msg) {
  document.getElementById("login-errore").textContent = msg;
  mostraLogin();
}

async function inizializzaApp() {
  document.getElementById("nome-utente").textContent = currentUserData?.nome || currentUser.email;
  document.getElementById("fab-carica").classList.toggle("nascosto", !puoScrivere());
  document.getElementById("fab-aggiungi").classList.toggle("nascosto", !puoScrivere());
  // Nascondi il tab Agenda agli utenti esterni
  if (isEsterno()) {
    document.querySelector('.tab-btn[data-tab="agenda"]').classList.add("nascosto");
  }
  categorieCache = await caricaCategorie();
  popolaSelectCategorie();
  await renderListaDocumenti();
}

// ---- Archivio ----

function popolaSelectCategorie() {
  const selectFiltro = document.getElementById("select-categoria-filtro");
  const selectUpload = document.getElementById("upload-categoria");
  const categorieDaMostrare = categorieVisibiliUtente() ?? categorieCache.map((c) => c.nome);
  selectFiltro.innerHTML = '<option value="">Tutte le categorie</option>';
  selectUpload.innerHTML = '<option value="">Seleziona categoria...</option>';
  categorieCache.filter((c) => categorieDaMostrare.includes(c.nome)).forEach((c) => {
    selectFiltro.innerHTML += `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`;
    selectUpload.innerHTML += `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`;
  });
  selectUpload.innerHTML += `<option value="__nuova__">+ Nuova categoria...</option>`;
}

function popolaSelectAnni(documenti) {
  const select = document.getElementById("select-anno-filtro");
  const annoAttuale = select.value;
  const anni = new Set();
  documenti.forEach((doc) => { if (doc.dataDocumento) anni.add(new Date(doc.dataDocumento.seconds * 1000).getFullYear()); });
  select.innerHTML = '<option value="">Tutti gli anni</option>';
  [...anni].sort((a, b) => b - a).forEach((anno) => {
    select.innerHTML += `<option value="${anno}" ${anno == annoAttuale ? "selected" : ""}>${anno}</option>`;
  });
}

function applicaFiltri() {
  filtriAttivi = {
    testoRicerca: document.getElementById("input-ricerca").value.trim(),
    categoria: document.getElementById("select-categoria-filtro").value,
    anno: document.getElementById("select-anno-filtro").value,
  };
  renderListaDocumenti();
}

async function renderListaDocumenti() {
  const container = document.getElementById("lista-documenti");
  container.innerHTML = '<div class="stato-vuoto">Caricamento...</div>';
  try {
    const tuttiDocumenti = await cercaDocumenti({ ...filtriAttivi });
    popolaSelectAnni(await cercaDocumenti({}));
    const allerta = tuttiDocumenti.filter((d) => statoScadenza(d) === "scaduto" || statoScadenza(d) === "in_scadenza");
    renderBannerScadenze(allerta);
    if (tuttiDocumenti.length === 0) { container.innerHTML = '<div class="stato-vuoto">Nessun documento trovato.</div>'; return; }
    container.innerHTML = tuttiDocumenti.map(renderCardDocumento).join("");
    container.querySelectorAll(".card-documento").forEach((card) => {
      card.addEventListener("click", () => apriDettaglioDocumento(card.dataset.id, tuttiDocumenti));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="stato-vuoto">Errore nel caricamento dei documenti.</div>';
  }
}

function renderBannerScadenze(documentiAllerta) {
  const bannerEl = document.getElementById("banner-scadenze");
  if (!bannerEl) return;
  if (documentiAllerta.length === 0) { bannerEl.classList.add("nascosto"); bannerEl.innerHTML = ""; return; }
  const scaduti = documentiAllerta.filter((d) => statoScadenza(d) === "scaduto");
  const inScad = documentiAllerta.filter((d) => statoScadenza(d) === "in_scadenza");
  let testo = "";
  if (scaduti.length > 0) testo += `🔴 ${scaduti.length} scadut${scaduti.length > 1 ? "i" : "o"}`;
  if (inScad.length > 0) { if (testo) testo += " · "; testo += `🟡 ${inScad.length} in scadenza`; }
  bannerEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <span style="font-size:0.9rem; font-weight:600;">${testo}</span>
      <button id="btn-filtro-scadenze" class="btn btn-secondario" style="padding:6px 12px; font-size:0.8rem;">Mostra solo questi</button>
    </div>
    <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
      ${documentiAllerta.slice(0, 3).map((d) => {
        const dataStr = d.dataScadenza ? new Date(d.dataScadenza.seconds * 1000).toLocaleDateString("it-IT") : "—";
        return `<span style="font-size:0.85rem;">${statoScadenza(d) === "scaduto" ? "🔴" : "🟡"} ${escapeHtml(d.titolo)} — scade il ${dataStr}</span>`;
      }).join("")}
      ${documentiAllerta.length > 3 ? `<span style="font-size:0.8rem; color:var(--colore-testo-secondario);">e altri ${documentiAllerta.length - 3}...</span>` : ""}
    </div>
  `;
  bannerEl.classList.remove("nascosto");
  document.getElementById("btn-filtro-scadenze").addEventListener("click", async () => {
    const soloScadenze = await cercaDocumenti({ soloScadenze: true });
    const container = document.getElementById("lista-documenti");
    container.innerHTML = soloScadenze.map(renderCardDocumento).join("");
    container.querySelectorAll(".card-documento").forEach((card) => {
      card.addEventListener("click", () => apriDettaglioDocumento(card.dataset.id, soloScadenze));
    });
  });
}

function renderCardDocumento(doc) {
  const dataStr = doc.dataDocumento ? new Date(doc.dataDocumento.seconds * 1000).toLocaleDateString("it-IT") : "—";
  const tagHtml = (doc.tag || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");
  const numAllegati = ottieniAllegati(doc).length;
  const badgeAllegati = numAllegati > 1 ? `<span class="tag-pill">📎 ${numAllegati} allegati</span>` : "";
  const stato = statoScadenza(doc);
  let badgeScadenza = "";
  if (stato === "scaduto") badgeScadenza = `<span class="tag-pill" style="background:#fdecea; border-color:#e57373; color:#c62828;">🔴 Scaduto</span>`;
  else if (stato === "in_scadenza") {
    const dataScad = new Date(doc.dataScadenza.seconds * 1000).toLocaleDateString("it-IT");
    badgeScadenza = `<span class="tag-pill" style="background:#fff8e1; border-color:#ffb300; color:#e65100;">🟡 Scade il ${dataScad}</span>`;
  }
  return `
    <div class="card-documento" data-id="${doc.id}">
      <div class="icona-categoria">${iniziale(doc.categoria)}</div>
      <div class="info">
        <div class="titolo">${escapeHtml(doc.titolo)}</div>
        <div class="dettagli">${escapeHtml(doc.categoria)} · ${escapeHtml(doc.intestatario || "—")} · ${dataStr}</div>
        <div style="margin-top:6px">${tagHtml}${badgeAllegati}${badgeScadenza}</div>
      </div>
    </div>
  `;
}

function apriModaleCarica() { document.getElementById("modale-carica").classList.remove("nascosto"); }

function chiudiModale() {
  document.getElementById("modale-carica").classList.add("nascosto");
  document.getElementById("form-carica").reset();
  document.getElementById("upload-progresso").classList.add("nascosto");
}

document.addEventListener("change", (e) => {
  if (e.target.id === "upload-categoria" && e.target.value === "__nuova__") {
    const nome = prompt("Nome della nuova categoria:");
    if (nome && nome.trim()) {
      creaCategoria(nome.trim()).then(async () => {
        categorieCache = await caricaCategorie();
        popolaSelectCategorie();
        document.getElementById("upload-categoria").value = nome.trim();
      });
    } else { e.target.value = ""; }
  }
});

async function gestisciCaricaDocumento(e) {
  e.preventDefault();
  const files = document.getElementById("upload-file").files;
  if (!files || files.length === 0) return;
  const meta = {
    titolo: document.getElementById("upload-titolo").value.trim(),
    categoria: document.getElementById("upload-categoria").value,
    intestatario: document.getElementById("upload-intestatario").value.trim(),
    dataDocumento: document.getElementById("upload-data").value,
    dataScadenza: document.getElementById("upload-scadenza").value || null,
    giorniPreavviso: parseInt(document.getElementById("upload-preavviso").value) || 30,
    tag: document.getElementById("upload-tag").value.split(",").map((t) => t.trim()).filter(Boolean),
    visibilita: "famiglia",
  };
  if (!meta.categoria || meta.categoria === "__nuova__") { alert("Seleziona una categoria valida."); return; }
  const progressoEl = document.getElementById("upload-progresso");
  const fillEl = document.getElementById("upload-progresso-fill");
  const btnSubmit = document.getElementById("btn-upload-submit");
  progressoEl.classList.remove("nascosto");
  btnSubmit.disabled = true;
  try {
    await caricaDocumento(files, meta, (pct) => { fillEl.style.width = `${pct}%`; });
    chiudiModale();
    await renderListaDocumenti();
  } catch (err) {
    console.error(err);
    alert("Errore durante il caricamento: " + err.message);
  } finally { btnSubmit.disabled = false; }
}

async function apriDettaglioDocumento(docId, documentiCache) {
  const doc = documentiCache.find((d) => d.id === docId);
  if (!doc) return;
  const dataStr = doc.dataDocumento ? new Date(doc.dataDocumento.seconds * 1000).toLocaleDateString("it-IT") : "—";
  const dataScadStr = doc.dataScadenza ? new Date(doc.dataScadenza.seconds * 1000).toLocaleDateString("it-IT") : null;
  const stato = statoScadenza(doc);
  let scadenzaHtml = "";
  if (dataScadStr) {
    const colore = stato === "scaduto" ? "#c62828" : stato === "in_scadenza" ? "#e65100" : "var(--colore-testo-secondario)";
    const icona = stato === "scaduto" ? "🔴" : stato === "in_scadenza" ? "🟡" : "📅";
    scadenzaHtml = `<p style="font-size:0.85rem; color:${colore}; margin-bottom:8px;">${icona} Scadenza: ${dataScadStr}</p>`;
  }
  const puoModificare = puoScrivere();
  const allegati = ottieniAllegati(doc);
  const allegatiHtml = allegati.map((a, idx) => `
    <div style="display:flex; align-items:center; gap:8px;">
      <div class="card-documento" style="cursor:pointer; padding:10px 14px; flex:1;" data-allegato-idx="${idx}">
        <div class="icona-categoria" style="width:34px; height:34px; font-size:1rem;">📄</div>
        <div class="info"><div class="titolo" style="font-size:0.9rem;">${escapeHtml(a.nomeFile)}</div></div>
      </div>
      ${puoModificare ? `<button class="btn btn-pericolo" style="padding:8px 12px; flex-shrink:0;" data-elimina-allegato-idx="${idx}">🗑️</button>` : ""}
    </div>
  `).join("");
  const html = `
    <div class="overlay" id="overlay-dettaglio">
      <div class="modale">
        <h2>${escapeHtml(doc.titolo)}</h2>
        <p style="color:var(--colore-testo-secondario); margin-bottom:4px;">${escapeHtml(doc.categoria)} · ${escapeHtml(doc.intestatario || "—")} · ${dataStr}</p>
        ${scadenzaHtml}
        <div style="margin:8px 0 12px">${(doc.tag || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>
        <p style="font-size:0.85rem; font-weight:600; color:var(--colore-testo-secondario); margin-bottom:8px;">${allegati.length === 1 ? "Allegato" : `Allegati (${allegati.length})`}</p>
        <div id="lista-allegati-dettaglio" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">${allegatiHtml}</div>
        ${puoModificare ? '<button class="btn btn-secondario btn-blocco" id="btn-aggiungi-allegato" style="margin-bottom:10px">+ Aggiungi allegato</button>' : ""}
        ${puoModificare ? '<button class="btn btn-secondario btn-blocco" id="btn-modifica-doc" style="margin-bottom:10px">Modifica</button>' : ""}
        ${puoModificare ? '<button class="btn btn-pericolo btn-blocco" id="btn-elimina-doc" style="margin-bottom:10px">Elimina</button>' : ""}
        <button class="btn btn-secondario btn-blocco" id="btn-chiudi-dettaglio">Chiudi</button>
        <input type="file" id="input-nuovo-allegato" multiple style="display:none" />
        <div id="progresso-nuovo-allegato" class="barra-progresso nascosto" style="margin-top:10px">
          <div id="progresso-nuovo-allegato-fill" class="barra-progresso-fill" style="width:0%"></div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
  document.querySelectorAll("#lista-allegati-dettaglio [data-allegato-idx]").forEach((el) => {
    el.addEventListener("click", async () => {
      const idx = parseInt(el.dataset.allegatoIdx, 10);
      const allegato = allegati[idx];
      const titoloEl = el.querySelector(".titolo");
      const testoOriginale = titoloEl.textContent;
      titoloEl.textContent = "Apertura...";
      try {
        const url = await ottieniUrlDownload(allegato.storageRef);
        await new Promise((r) => setTimeout(r, 500));
        window.location.href = url;
      } catch (err) {
        alert("Impossibile aprire il file: " + (err.message || "errore sconosciuto"));
        titoloEl.textContent = testoOriginale;
      }
    });
  });
  document.querySelectorAll("#lista-allegati-dettaglio [data-elimina-allegato-idx]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.eliminaAllegatoIdx, 10);
      const nomeFile = allegati[idx]?.nomeFile || "questo allegato";
      if (!confirm(`Eliminare definitivamente "${nomeFile}"?`)) return;
      try {
        const allegatiAggiornati = await eliminaAllegato(doc.id, doc, idx);
        document.getElementById("overlay-dettaglio").remove();
        await renderListaDocumenti();
        if (allegatiAggiornati !== null) { doc.allegati = allegatiAggiornati; delete doc.storageRef; apriDettaglioDocumento(doc.id, [doc]); }
      } catch (err) { alert("Errore: " + err.message); }
    });
  });
  document.getElementById("btn-chiudi-dettaglio").addEventListener("click", () => document.getElementById("overlay-dettaglio").remove());
  const btnElimina = document.getElementById("btn-elimina-doc");
  if (btnElimina) {
    btnElimina.addEventListener("click", async () => {
      const conferma = allegati.length > 1 ? `Eliminare "${doc.titolo}" e tutti i suoi ${allegati.length} allegati?` : `Eliminare definitivamente "${doc.titolo}"?`;
      if (!confirm(conferma)) return;
      try { await eliminaDocumento(doc.id, doc); document.getElementById("overlay-dettaglio").remove(); await renderListaDocumenti(); }
      catch (err) { alert("Errore: " + err.message); }
    });
  }
  const btnModifica = document.getElementById("btn-modifica-doc");
  if (btnModifica) {
    btnModifica.addEventListener("click", () => { document.getElementById("overlay-dettaglio").remove(); apriModaleModifica(doc); });
  }
  const btnAggiungiAllegato = document.getElementById("btn-aggiungi-allegato");
  if (btnAggiungiAllegato) {
    const inputFile = document.getElementById("input-nuovo-allegato");
    btnAggiungiAllegato.addEventListener("click", () => inputFile.click());
    inputFile.addEventListener("change", async () => {
      const nuoviFile = inputFile.files;
      if (!nuoviFile || nuoviFile.length === 0) return;
      const progressoEl = document.getElementById("progresso-nuovo-allegato");
      const fillEl = document.getElementById("progresso-nuovo-allegato-fill");
      btnAggiungiAllegato.disabled = true;
      btnAggiungiAllegato.textContent = "Caricamento...";
      progressoEl.classList.remove("nascosto");
      try {
        const allegatiAggiornati = await aggiungiAllegati(doc.id, doc, nuoviFile, (pct) => { fillEl.style.width = `${pct}%`; });
        doc.allegati = allegatiAggiornati; delete doc.storageRef;
        document.getElementById("overlay-dettaglio").remove();
        await renderListaDocumenti();
        apriDettaglioDocumento(doc.id, [doc]);
      } catch (err) {
        alert("Errore: " + err.message);
        btnAggiungiAllegato.disabled = false;
        btnAggiungiAllegato.textContent = "+ Aggiungi allegato";
        progressoEl.classList.add("nascosto");
      }
    });
  }
}

function apriModaleModifica(doc) {
  const dataValue = doc.dataDocumento ? new Date(doc.dataDocumento.seconds * 1000).toISOString().split("T")[0] : "";
  const dataScadValue = doc.dataScadenza ? new Date(doc.dataScadenza.seconds * 1000).toISOString().split("T")[0] : "";
  const giorniPreavviso = doc.giorniPreavviso || 30;
  const opzioniCategorie = categorieCache.map((c) => `<option value="${escapeHtml(c.nome)}" ${c.nome === doc.categoria ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("");
  const opzioniPreavviso = [7, 15, 30, 60, 90].map((g) => `<option value="${g}" ${g === giorniPreavviso ? "selected" : ""}>${g} giorni prima</option>`).join("");
  const html = `
    <div class="overlay" id="overlay-modifica">
      <div class="modale">
        <h2>Modifica documento</h2>
        <form id="form-modifica">
          <div class="campo"><label>Titolo</label><input type="text" id="modifica-titolo" required value="${escapeHtml(doc.titolo)}" /></div>
          <div class="campo"><label>Categoria</label><select id="modifica-categoria" required>${opzioniCategorie}</select></div>
          <div class="campo"><label>Intestatario</label><input type="text" id="modifica-intestatario" value="${escapeHtml(doc.intestatario || "")}" /></div>
          <div class="campo"><label>Data documento</label><input type="date" id="modifica-data" value="${dataValue}" /></div>
          <div class="campo"><label>Data scadenza</label><input type="date" id="modifica-scadenza" value="${dataScadValue}" /></div>
          <div class="campo"><label>Avvisa con anticipo di</label><select id="modifica-preavviso">${opzioniPreavviso}</select></div>
          <div class="campo"><label>Tag (separati da virgola)</label><input type="text" id="modifica-tag" value="${escapeHtml((doc.tag || []).join(", "))}" /></div>
          <div class="modale-azioni">
            <button type="button" class="btn btn-secondario" id="btn-annulla-modifica">Annulla</button>
            <button type="submit" class="btn btn-accento" id="btn-salva-modifica">Salva</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
  document.getElementById("btn-annulla-modifica").addEventListener("click", () => document.getElementById("overlay-modifica").remove());
  document.getElementById("form-modifica").addEventListener("submit", async (e) => {
    e.preventDefault();
    const dataScadenzaVal = document.getElementById("modifica-scadenza").value;
    const modifiche = {
      titolo: document.getElementById("modifica-titolo").value.trim(),
      categoria: document.getElementById("modifica-categoria").value,
      intestatario: document.getElementById("modifica-intestatario").value.trim(),
      dataDocumento: document.getElementById("modifica-data").value ? firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("modifica-data").value)) : null,
      dataScadenza: dataScadenzaVal ? firebase.firestore.Timestamp.fromDate(new Date(dataScadenzaVal)) : null,
      giorniPreavviso: parseInt(document.getElementById("modifica-preavviso").value) || 30,
      tag: document.getElementById("modifica-tag").value.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const btnSalva = document.getElementById("btn-salva-modifica");
    btnSalva.disabled = true; btnSalva.textContent = "Salvataggio...";
    try { await aggiornaDocumento(doc.id, modifiche); document.getElementById("overlay-modifica").remove(); await renderListaDocumenti(); }
    catch (err) { alert("Errore: " + err.message); btnSalva.disabled = false; btnSalva.textContent = "Salva"; }
  });
}

// ---- Scadenze ----

async function renderListaScadenze() {
  const container = document.getElementById("lista-scadenze");
  container.innerHTML = '<div class="stato-vuoto">Caricamento...</div>';
  try {
    const tutti = await cercaDocumenti({});
    const conScadenza = tutti
      .filter((d) => d.dataScadenza)
      .sort((a, b) => a.dataScadenza.seconds - b.dataScadenza.seconds);

    if (conScadenza.length === 0) {
      container.innerHTML = '<div class="stato-vuoto">Nessun documento con scadenza impostata.</div>';
      return;
    }

    container.innerHTML = conScadenza.map((doc) => {
      const stato = statoScadenza(doc);
      const dataScad = new Date(doc.dataScadenza.seconds * 1000).toLocaleDateString("it-IT");
      const oggi = new Date(); oggi.setHours(0,0,0,0);
      const scad = new Date(doc.dataScadenza.seconds * 1000); scad.setHours(0,0,0,0);
      const giorni = Math.round((scad - oggi) / (1000 * 60 * 60 * 24));

      let coloreStato = "var(--colore-testo-secondario)";
      let etichetta = giorni > 0 ? `tra ${giorni} giorn${giorni === 1 ? "o" : "i"}` : giorni === 0 ? "oggi" : `scaduto ${Math.abs(giorni)} giorni fa`;
      if (stato === "scaduto") coloreStato = "#c62828";
      else if (stato === "in_scadenza") coloreStato = "#e65100";

      return `
        <div class="card-documento" style="cursor:default;">
          <div class="icona-categoria">${iniziale(doc.categoria)}</div>
          <div class="info" style="flex:1;">
            <div class="titolo">${escapeHtml(doc.titolo)}</div>
            <div class="dettagli">${escapeHtml(doc.categoria)} · ${escapeHtml(doc.intestatario || "—")}</div>
            <div style="margin-top:4px; font-size:0.85rem; color:${coloreStato}; font-weight:600;">
              📅 ${dataScad} — ${etichetta}
            </div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="stato-vuoto">Errore nel caricamento.</div>';
  }
}

async function esportaExcel() {
  try {
    const tutti = await cercaDocumenti({});
    const conScadenza = tutti
      .filter((d) => d.dataScadenza)
      .sort((a, b) => a.dataScadenza.seconds - b.dataScadenza.seconds);

    if (conScadenza.length === 0) {
      alert("Nessun documento con scadenza impostata.");
      return;
    }

    const oggi = new Date(); oggi.setHours(0,0,0,0);

    // Costruisco CSV (compatibile con Excel)
    const righe = [
      ["Titolo", "Categoria", "Intestatario", "Data scadenza", "Giorni rimanenti", "Stato"],
      ...conScadenza.map((doc) => {
        const scad = new Date(doc.dataScadenza.seconds * 1000); scad.setHours(0,0,0,0);
        const giorni = Math.round((scad - oggi) / (1000 * 60 * 60 * 24));
        const stato = statoScadenza(doc);
        const statoTesto = stato === "scaduto" ? "Scaduto" : stato === "in_scadenza" ? "In scadenza" : "OK";
        return [
          doc.titolo || "",
          doc.categoria || "",
          doc.intestatario || "",
          scad.toLocaleDateString("it-IT"),
          giorni,
          statoTesto,
        ];
      }),
    ];

    const csv = "﻿" + righe.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scadenze_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Errore durante l'esportazione: " + err.message);
  }
}

async function stampaScadenze() {
  try {
    const tutti = await cercaDocumenti({});
    const conScadenza = tutti
      .filter((d) => d.dataScadenza)
      .sort((a, b) => a.dataScadenza.seconds - b.dataScadenza.seconds);

    if (conScadenza.length === 0) {
      alert("Nessun documento con scadenza impostata.");
      return;
    }

    const btn = document.getElementById("btn-stampa-scadenze");
    btn.disabled = true;
    btn.textContent = "Generazione...";

    // Carica jsPDF e autoTable dinamicamente
    await Promise.all([
      caricaScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
      caricaScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"),
    ]);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Intestazione
    doc.setFillColor(44, 95, 111); // colore primario
    doc.rect(0, 0, 210, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Archivio Famiglia — Scadenzario", 14, 13);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generato il ${new Date().toLocaleDateString("it-IT")}`, 196, 13, { align: "right" });

    // Tabella
    const oggi = new Date(); oggi.setHours(0,0,0,0);

    const righe = conScadenza.map((d) => {
      const scad = new Date(d.dataScadenza.seconds * 1000); scad.setHours(0,0,0,0);
      const giorni = Math.round((scad - oggi) / (1000 * 60 * 60 * 24));
      const stato = statoScadenza(d);
      const statoTesto = stato === "scaduto" ? "Scaduto" : stato === "in_scadenza" ? "In scadenza" : "OK";
      const giorniTesto = giorni < 0 ? `${Math.abs(giorni)}gg fa` : giorni === 0 ? "Oggi" : `${giorni}gg`;
      return [d.titolo || "", d.categoria || "", d.intestatario || "", scad.toLocaleDateString("it-IT"), giorniTesto, statoTesto];
    });

    doc.autoTable({
      startY: 26,
      head: [["Titolo", "Categoria", "Intestatario", "Scadenza", "Giorni", "Stato"]],
      body: righe,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [44, 95, 111], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 250] },
      margin: { left: 8, right: 8 },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 18 },
        5: { cellWidth: 28 },
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const val = data.cell.raw;
          if (val === "Scaduto") data.cell.styles.textColor = [198, 40, 40];
          else if (val === "In scadenza") data.cell.styles.textColor = [230, 81, 0];
          else data.cell.styles.textColor = [46, 125, 50];
        }
      },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Pagina ${i} di ${pageCount}`, 196, 290, { align: "right" });
    }

    doc.save(`scadenze_${new Date().toISOString().split("T")[0]}.pdf`);

    btn.disabled = false;
    btn.textContent = "🖨️ Stampa / PDF";
  } catch (err) {
    console.error(err);
    alert("Errore durante la generazione del PDF: " + err.message);
    document.getElementById("btn-stampa-scadenze").disabled = false;
    document.getElementById("btn-stampa-scadenze").textContent = "🖨️ Stampa / PDF";
  }
}

function caricaScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ---- Agenda ----

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
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const futuri = appuntamentiCache.filter((a) => { const d = new Date(a.dataOra.seconds * 1000); d.setHours(0,0,0,0); return d >= oggi; });
    const passati = appuntamentiCache.filter((a) => { const d = new Date(a.dataOra.seconds * 1000); d.setHours(0,0,0,0); return d < oggi; });
    let html = "";
    if (futuri.length > 0) { html += '<div class="sezione-titolo">Prossimi appuntamenti</div>'; html += futuri.map(renderCardAppuntamento).join(""); }
    if (passati.length > 0) { html += '<div class="sezione-titolo" style="margin-top:28px;">Passati</div>'; html += passati.slice().reverse().map(renderCardAppuntamento).join(""); }
    container.innerHTML = html;
    container.querySelectorAll(".card-appuntamento").forEach((card) => {
      card.addEventListener("click", () => apriDettaglioAppuntamento(card.dataset.id));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="stato-vuoto">Errore: ${err.message || String(err)}</div>`;
  }
}

function renderCardAppuntamento(app) {
  const data = new Date(app.dataOra.seconds * 1000);
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const dataApp = new Date(data); dataApp.setHours(0,0,0,0);
  const isOggi = dataApp.getTime() === oggi.getTime();
  const isPassato = dataApp < oggi;
  const badgeOggi = isOggi ? '<span class="tag-pill" style="background:#fff3e0; border-color:#ff9800; color:#e65100;">Oggi</span>' : "";
  return `
    <div class="card-appuntamento ${isOggi ? "oggi" : isPassato ? "passato" : ""}" data-id="${app.id}">
      <div class="data-badge">
        <div class="giorno">${data.getDate()}</div>
        <div class="mese">${data.toLocaleDateString("it-IT", { month: "short" })} ${data.getFullYear()}</div>
      </div>
      <div class="info" style="flex:1; min-width:0;">
        <div class="titolo">${escapeHtml(app.titolo)}</div>
        <div class="dettagli">${app.ora ? `🕐 ${app.ora}` : "Orario non specificato"}${app.descrizione ? ` · ${escapeHtml(app.descrizione.substring(0,50))}${app.descrizione.length > 50 ? "..." : ""}` : ""}</div>
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
        <p style="color:var(--colore-testo-secondario); margin-bottom:8px;">📅 ${dataStr}${app.ora ? ` · 🕐 ${app.ora}` : ""}</p>
        ${app.descrizione ? `<p style="font-size:0.9rem; margin-bottom:16px;">${escapeHtml(app.descrizione)}</p>` : ""}
        ${puoScrivere() ? '<button class="btn btn-secondario btn-blocco" id="btn-modifica-app" style="margin-bottom:10px">Modifica</button>' : ""}
        ${puoScrivere() ? '<button class="btn btn-pericolo btn-blocco" id="btn-elimina-app" style="margin-bottom:10px">Elimina</button>' : ""}
        <button class="btn btn-secondario btn-blocco" id="btn-chiudi-dettaglio-app">Chiudi</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
  document.getElementById("btn-chiudi-dettaglio-app").addEventListener("click", () => document.getElementById("overlay-dettaglio-app").remove());
  const btnModifica = document.getElementById("btn-modifica-app");
  if (btnModifica) { btnModifica.addEventListener("click", () => { document.getElementById("overlay-dettaglio-app").remove(); apriModaleModificaAppuntamento(app); }); }
  const btnElimina = document.getElementById("btn-elimina-app");
  if (btnElimina) {
    btnElimina.addEventListener("click", async () => {
      if (!confirm(`Eliminare l'appuntamento "${app.titolo}"?`)) return;
      try { await db.collection(COLLECTION_APPUNTAMENTI).doc(app.id).delete(); document.getElementById("overlay-dettaglio-app").remove(); await renderListaAppuntamenti(); }
      catch (err) { alert("Errore: " + err.message); }
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
  btn.disabled = true; btn.textContent = "Salvataggio...";
  try {
    const dati = { titolo, dataOra: firebase.firestore.Timestamp.fromDate(new Date(dataVal)), ora: ora || null, descrizione: descrizione || null, caricatoDa: currentUser.uid };
    if (appuntamentoInModifica) { await db.collection(COLLECTION_APPUNTAMENTI).doc(appuntamentoInModifica.id).update(dati); }
    else { await db.collection(COLLECTION_APPUNTAMENTI).add(dati); }
    chiudiModaleAppuntamento();
    await renderListaAppuntamenti();
  } catch (err) {
    console.error(err);
    alert("Errore durante il salvataggio: " + err.message);
  } finally { btn.disabled = false; btn.textContent = "Salva"; }
}

// ---- Password ----

async function gestisciPasswordDimenticata() {
  const email = document.getElementById("login-email").value.trim();
  const msgEl = document.getElementById("reset-messaggio");
  if (!email) { msgEl.style.display = "block"; msgEl.style.color = "var(--colore-errore)"; msgEl.textContent = "Inserisci la tua email nel campo qui sopra, poi clicca di nuovo."; return; }
  try {
    await inviaResetPassword(email);
    msgEl.style.display = "block"; msgEl.style.color = "var(--colore-successo)";
    msgEl.textContent = "✓ Email di reset inviata. Controlla la casella (anche spam).";
  } catch (err) { msgEl.style.display = "block"; msgEl.style.color = "var(--colore-errore)"; msgEl.textContent = err; }
}

function apriModaleCambiaPassword() {
  const html = `
    <div class="overlay" id="overlay-cambia-password">
      <div class="modale">
        <h2>Cambia password</h2>
        <form id="form-cambia-password">
          <div class="campo"><label>Nuova password</label><input type="password" id="nuova-password" required minlength="8" placeholder="Almeno 8 caratteri" /></div>
          <div class="campo"><label>Conferma password</label><input type="password" id="conferma-password" required minlength="8" /></div>
          <div class="errore-msg" id="cambia-password-errore"></div>
          <div class="modale-azioni" style="margin-top:16px">
            <button type="button" class="btn btn-secondario" id="btn-annulla-cambia-password">Annulla</button>
            <button type="submit" class="btn btn-primario">Salva</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
  document.getElementById("btn-annulla-cambia-password").addEventListener("click", () => document.getElementById("overlay-cambia-password").remove());
  document.getElementById("form-cambia-password").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nuova = document.getElementById("nuova-password").value;
    const conferma = document.getElementById("conferma-password").value;
    const erroreEl = document.getElementById("cambia-password-errore");
    erroreEl.textContent = "";
    if (nuova !== conferma) { erroreEl.textContent = "Le due password non coincidono."; return; }
    try { await cambiaPassword(nuova); document.getElementById("overlay-cambia-password").remove(); alert("✓ Password cambiata con successo."); }
    catch (err) { erroreEl.textContent = err; }
  });
}

// ---- Utility ----

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function iniziale(categoria) { return (categoria || "?").charAt(0).toUpperCase(); }

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
