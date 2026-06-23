// ============================================================
// APP.JS - Logica UI e orchestrazione viste
// ============================================================

let categorieCache = [];
let filtriAttivi = {};

document.addEventListener("DOMContentLoaded", () => {
  onAuthChange(async (user, erroreMsg) => {
    if (erroreMsg) {
      mostraErroreLogin(erroreMsg);
      return;
    }
    if (user) {
      mostraApp();
      await inizializzaApp();
    } else {
      mostraLogin();
    }
  });

  document.getElementById("form-login").addEventListener("submit", gestisciLogin);
  document.getElementById("btn-logout").addEventListener("click", () => logout());
  document.getElementById("btn-password-dimenticata").addEventListener("click", gestisciPasswordDimenticata);
  document.getElementById("btn-cambia-password").addEventListener("click", apriModaleCambiaPassword);
  document.getElementById("fab-carica").addEventListener("click", apriModaleCarica);
  document.getElementById("btn-chiudi-modale").addEventListener("click", chiudiModale);
  document.getElementById("form-carica").addEventListener("submit", gestisciCaricaDocumento);
  document.getElementById("input-ricerca").addEventListener("input", debounce(applicaFiltri, 300));
  document.getElementById("select-categoria-filtro").addEventListener("change", applicaFiltri);
  document.getElementById("select-anno-filtro").addEventListener("change", applicaFiltri);
});

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
  categorieCache = await caricaCategorie();
  popolaSelectCategorie();
  await renderListaDocumenti();
}

function popolaSelectCategorie() {
  const selectFiltro = document.getElementById("select-categoria-filtro");
  const selectUpload = document.getElementById("upload-categoria");
  const categorieDaMostrare = categorieVisibiliUtente() ?? categorieCache.map((c) => c.nome);

  selectFiltro.innerHTML = '<option value="">Tutte le categorie</option>';
  selectUpload.innerHTML = '<option value="">Seleziona categoria...</option>';

  categorieCache
    .filter((c) => categorieDaMostrare.includes(c.nome))
    .forEach((c) => {
      selectFiltro.innerHTML += `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`;
      selectUpload.innerHTML += `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`;
    });

  selectUpload.innerHTML += `<option value="__nuova__">+ Nuova categoria...</option>`;
}

function popolaSelectAnni(documenti) {
  const select = document.getElementById("select-anno-filtro");
  const annoAttuale = select.value;

  const anni = new Set();
  documenti.forEach((doc) => {
    if (doc.dataDocumento) {
      anni.add(new Date(doc.dataDocumento.seconds * 1000).getFullYear());
    }
  });

  const anniOrdinati = [...anni].sort((a, b) => b - a);
  select.innerHTML = '<option value="">Tutti gli anni</option>';
  anniOrdinati.forEach((anno) => {
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

    // Banner scadenze
    const inScadenza = tuttiDocumenti.filter(
      (d) => statoScadenza(d) === "scaduto" || statoScadenza(d) === "in_scadenza"
    );
    renderBannerScadenze(inScadenza, tuttiDocumenti);

    if (tuttiDocumenti.length === 0) {
      container.innerHTML = '<div class="stato-vuoto">Nessun documento trovato.</div>';
      return;
    }

    container.innerHTML = tuttiDocumenti.map(renderCardDocumento).join("");

    container.querySelectorAll(".card-documento").forEach((card) => {
      card.addEventListener("click", () => apriDettaglioDocumento(card.dataset.id, tuttiDocumenti));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="stato-vuoto">Errore nel caricamento dei documenti.</div>';
  }
}

function renderBannerScadenze(documentiAllerta, tuttiDocumenti) {
  const bannerEl = document.getElementById("banner-scadenze");
  if (!bannerEl) return;

  if (documentiAllerta.length === 0) {
    bannerEl.classList.add("nascosto");
    bannerEl.innerHTML = "";
    return;
  }

  const scaduti = documentiAllerta.filter((d) => statoScadenza(d) === "scaduto");
  const inScadenza = documentiAllerta.filter((d) => statoScadenza(d) === "in_scadenza");

  let testo = "";
  if (scaduti.length > 0) testo += `🔴 ${scaduti.length} document${scaduti.length > 1 ? "i scaduti" : "o scaduto"}`;
  if (inScadenza.length > 0) {
    if (testo) testo += " · ";
    testo += `🟡 ${inScadenza.length} in scadenza`;
  }

  bannerEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <span style="font-size:0.9rem; font-weight:600;">${testo}</span>
      <button id="btn-filtro-scadenze" class="btn btn-secondario" style="padding:6px 12px; font-size:0.8rem;">
        Mostra solo questi
      </button>
    </div>
    <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
      ${documentiAllerta.slice(0, 3).map((d) => {
        const dataStr = d.dataScadenza
          ? new Date(d.dataScadenza.seconds * 1000).toLocaleDateString("it-IT")
          : "—";
        const stato = statoScadenza(d);
        const icona = stato === "scaduto" ? "🔴" : "🟡";
        return `<span style="font-size:0.85rem;">${icona} ${escapeHtml(d.titolo)} — scade il ${dataStr}</span>`;
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
  const dataStr = doc.dataDocumento
    ? new Date(doc.dataDocumento.seconds * 1000).toLocaleDateString("it-IT")
    : "—";
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

function apriModaleCarica() {
  document.getElementById("modale-carica").classList.remove("nascosto");
}

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
    } else {
      e.target.value = "";
    }
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

  if (!meta.categoria || meta.categoria === "__nuova__") {
    alert("Seleziona una categoria valida.");
    return;
  }

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
  } finally {
    btnSubmit.disabled = false;
  }
}

async function apriDettaglioDocumento(docId, documentiCache) {
  const doc = documentiCache.find((d) => d.id === docId);
  if (!doc) return;

  const dataStr = doc.dataDocumento
    ? new Date(doc.dataDocumento.seconds * 1000).toLocaleDateString("it-IT")
    : "—";

  const dataScadStr = doc.dataScadenza
    ? new Date(doc.dataScadenza.seconds * 1000).toLocaleDateString("it-IT")
    : null;

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
        <div class="info">
          <div class="titolo" style="font-size:0.9rem;">${escapeHtml(a.nomeFile)}</div>
        </div>
      </div>
      ${puoModificare ? `<button class="btn btn-pericolo" style="padding:8px 12px; flex-shrink:0;" data-elimina-allegato-idx="${idx}" title="Elimina questo allegato">🗑️</button>` : ""}
    </div>
  `).join("");

  const html = `
    <div class="overlay" id="overlay-dettaglio">
      <div class="modale">
        <h2>${escapeHtml(doc.titolo)}</h2>
        <p style="color:var(--colore-testo-secondario); margin-bottom:4px;">
          ${escapeHtml(doc.categoria)} · ${escapeHtml(doc.intestatario || "—")} · ${dataStr}
        </p>
        ${scadenzaHtml}
        <div style="margin:8px 0 12px">
          ${(doc.tag || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}
        </div>
        <p style="font-size:0.85rem; font-weight:600; color:var(--colore-testo-secondario); margin-bottom:8px;">
          ${allegati.length === 1 ? "Allegato" : `Allegati (${allegati.length})`}
        </p>
        <div id="lista-allegati-dettaglio" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          ${allegatiHtml}
        </div>
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

  // Click sui pulsanti elimina singolo allegato
  document.querySelectorAll("#lista-allegati-dettaglio [data-elimina-allegato-idx]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation(); // evita che il click apra anche il download
      const idx = parseInt(btn.dataset.eliminaAllegatoIdx, 10);
      const nomeFile = allegati[idx]?.nomeFile || "questo allegato";
      if (!confirm(`Eliminare definitivamente "${nomeFile}"?`)) return;
      try {
        const allegatiAggiornati = await eliminaAllegato(doc.id, doc, idx);
        document.getElementById("overlay-dettaglio").remove();
        await renderListaDocumenti();
        if (allegatiAggiornati !== null) {
          // Documento ancora esistente con altri allegati: riapri il dettaglio aggiornato
          doc.allegati = allegatiAggiornati;
          delete doc.storageRef;
          apriDettaglioDocumento(doc.id, [doc]);
        }
      } catch (err) {
        alert("Errore durante l'eliminazione: " + err.message);
      }
    });
  });

  document.getElementById("btn-chiudi-dettaglio").addEventListener("click", () => {
    document.getElementById("overlay-dettaglio").remove();
  });

  const btnElimina = document.getElementById("btn-elimina-doc");
  if (btnElimina) {
    btnElimina.addEventListener("click", async () => {
      const conferma = allegati.length > 1
        ? `Eliminare definitivamente "${doc.titolo}" e tutti i suoi ${allegati.length} allegati?`
        : `Eliminare definitivamente "${doc.titolo}"?`;
      if (!confirm(conferma)) return;
      try {
        await eliminaDocumento(doc.id, doc);
        document.getElementById("overlay-dettaglio").remove();
        await renderListaDocumenti();
      } catch (err) {
        alert("Errore durante l'eliminazione: " + err.message);
      }
    });
  }

  const btnModifica = document.getElementById("btn-modifica-doc");
  if (btnModifica) {
    btnModifica.addEventListener("click", () => {
      document.getElementById("overlay-dettaglio").remove();
      apriModaleModifica(doc);
    });
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
        const allegatiAggiornati = await aggiungiAllegati(doc.id, doc, nuoviFile, (pct) => {
          fillEl.style.width = `${pct}%`;
        });
        doc.allegati = allegatiAggiornati;
        delete doc.storageRef;
        document.getElementById("overlay-dettaglio").remove();
        await renderListaDocumenti();
        apriDettaglioDocumento(doc.id, [doc]);
      } catch (err) {
        console.error(err);
        alert("Errore durante il caricamento dell'allegato: " + err.message);
        btnAggiungiAllegato.disabled = false;
        btnAggiungiAllegato.textContent = "+ Aggiungi allegato";
        progressoEl.classList.add("nascosto");
      }
    });
  }
}

function apriModaleModifica(doc) {
  const dataValue = doc.dataDocumento
    ? new Date(doc.dataDocumento.seconds * 1000).toISOString().split("T")[0]
    : "";
  const dataScadValue = doc.dataScadenza
    ? new Date(doc.dataScadenza.seconds * 1000).toISOString().split("T")[0]
    : "";
  const giorniPreavviso = doc.giorniPreavviso || 30;

  const opzioniCategorie = categorieCache
    .map((c) => `<option value="${escapeHtml(c.nome)}" ${c.nome === doc.categoria ? "selected" : ""}>${escapeHtml(c.nome)}</option>`)
    .join("");

  const opzioniPreavviso = [7, 15, 30, 60, 90].map((g) =>
    `<option value="${g}" ${g === giorniPreavviso ? "selected" : ""}>${g} giorni prima</option>`
  ).join("");

  const html = `
    <div class="overlay" id="overlay-modifica">
      <div class="modale">
        <h2>Modifica documento</h2>
        <form id="form-modifica">
          <div class="campo">
            <label for="modifica-titolo">Titolo</label>
            <input type="text" id="modifica-titolo" required value="${escapeHtml(doc.titolo)}" />
          </div>
          <div class="campo">
            <label for="modifica-categoria">Categoria</label>
            <select id="modifica-categoria" required>${opzioniCategorie}</select>
          </div>
          <div class="campo">
            <label for="modifica-intestatario">Intestatario</label>
            <input type="text" id="modifica-intestatario" value="${escapeHtml(doc.intestatario || "")}" />
          </div>
          <div class="campo">
            <label for="modifica-data">Data documento</label>
            <input type="date" id="modifica-data" value="${dataValue}" />
          </div>
          <div class="campo">
            <label for="modifica-scadenza">Data scadenza (opzionale)</label>
            <input type="date" id="modifica-scadenza" value="${dataScadValue}" />
          </div>
          <div class="campo">
            <label for="modifica-preavviso">Avvisa con anticipo di</label>
            <select id="modifica-preavviso">${opzioniPreavviso}</select>
          </div>
          <div class="campo">
            <label for="modifica-tag">Tag (separati da virgola)</label>
            <input type="text" id="modifica-tag" value="${escapeHtml((doc.tag || []).join(", "))}" />
          </div>
          <div class="modale-azioni">
            <button type="button" class="btn btn-secondario" id="btn-annulla-modifica">Annulla</button>
            <button type="submit" class="btn btn-accento" id="btn-salva-modifica">Salva modifiche</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);

  document.getElementById("btn-annulla-modifica").addEventListener("click", () => {
    document.getElementById("overlay-modifica").remove();
  });

  document.getElementById("form-modifica").addEventListener("submit", async (e) => {
    e.preventDefault();

    const dataScadenzaVal = document.getElementById("modifica-scadenza").value;
    const modifiche = {
      titolo: document.getElementById("modifica-titolo").value.trim(),
      categoria: document.getElementById("modifica-categoria").value,
      intestatario: document.getElementById("modifica-intestatario").value.trim(),
      dataDocumento: document.getElementById("modifica-data").value
        ? firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("modifica-data").value))
        : null,
      dataScadenza: dataScadenzaVal
        ? firebase.firestore.Timestamp.fromDate(new Date(dataScadenzaVal))
        : null,
      giorniPreavviso: parseInt(document.getElementById("modifica-preavviso").value) || 30,
      tag: document.getElementById("modifica-tag").value.split(",").map((t) => t.trim()).filter(Boolean),
    };

    const btnSalva = document.getElementById("btn-salva-modifica");
    btnSalva.disabled = true;
    btnSalva.textContent = "Salvataggio...";

    try {
      await aggiornaDocumento(doc.id, modifiche);
      document.getElementById("overlay-modifica").remove();
      await renderListaDocumenti();
    } catch (err) {
      console.error(err);
      alert("Errore durante il salvataggio: " + err.message);
      btnSalva.disabled = false;
      btnSalva.textContent = "Salva modifiche";
    }
  });
}

// ---------- Password dimenticata ----------

async function gestisciPasswordDimenticata() {
  const email = document.getElementById("login-email").value.trim();
  const msgEl = document.getElementById("reset-messaggio");

  if (!email) {
    msgEl.style.display = "block";
    msgEl.style.color = "var(--colore-errore)";
    msgEl.textContent = "Inserisci la tua email nel campo qui sopra, poi clicca di nuovo.";
    return;
  }

  try {
    await inviaResetPassword(email);
    msgEl.style.display = "block";
    msgEl.style.color = "var(--colore-successo)";
    msgEl.textContent = "✓ Email di reset inviata a " + email + ". Controlla la casella (anche spam).";
  } catch (err) {
    msgEl.style.display = "block";
    msgEl.style.color = "var(--colore-errore)";
    msgEl.textContent = err;
  }
}

// ---------- Cambia password (utente loggato) ----------

function apriModaleCambiaPassword() {
  const html = `
    <div class="overlay" id="overlay-cambia-password">
      <div class="modale">
        <h2>Cambia password</h2>
        <form id="form-cambia-password">
          <div class="campo">
            <label for="nuova-password">Nuova password</label>
            <input type="password" id="nuova-password" required minlength="8" placeholder="Almeno 8 caratteri" />
          </div>
          <div class="campo">
            <label for="conferma-password">Conferma password</label>
            <input type="password" id="conferma-password" required minlength="8" placeholder="Ripeti la nuova password" />
          </div>
          <div class="errore-msg" id="cambia-password-errore"></div>
          <div class="modale-azioni" style="margin-top:16px">
            <button type="button" class="btn btn-secondario" id="btn-annulla-cambia-password">Annulla</button>
            <button type="submit" class="btn btn-primario" id="btn-salva-nuova-password">Salva</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);

  document.getElementById("btn-annulla-cambia-password").addEventListener("click", () => {
    document.getElementById("overlay-cambia-password").remove();
  });

  document.getElementById("form-cambia-password").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nuova = document.getElementById("nuova-password").value;
    const conferma = document.getElementById("conferma-password").value;
    const erroreEl = document.getElementById("cambia-password-errore");
    const btnSalva = document.getElementById("btn-salva-nuova-password");

    erroreEl.textContent = "";

    if (nuova !== conferma) {
      erroreEl.textContent = "Le due password non coincidono.";
      return;
    }

    if (nuova.length < 8) {
      erroreEl.textContent = "La password deve essere di almeno 8 caratteri.";
      return;
    }

    btnSalva.disabled = true;
    btnSalva.textContent = "Salvataggio...";

    try {
      await cambiaPassword(nuova);
      document.getElementById("overlay-cambia-password").remove();
      alert("✓ Password cambiata con successo.");
    } catch (err) {
      erroreEl.textContent = err;
      btnSalva.disabled = false;
      btnSalva.textContent = "Salva";
    }
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function iniziale(categoria) {
  return (categoria || "?").charAt(0).toUpperCase();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
