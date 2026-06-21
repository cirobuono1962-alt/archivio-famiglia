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
  document.getElementById("fab-carica").addEventListener("click", apriModaleCarica);
  document.getElementById("btn-chiudi-modale").addEventListener("click", chiudiModale);
  document.getElementById("form-carica").addEventListener("submit", gestisciCaricaDocumento);
  document.getElementById("input-ricerca").addEventListener("input", debounce(applicaFiltri, 300));
  document.getElementById("select-categoria-filtro").addEventListener("change", applicaFiltri);
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

function applicaFiltri() {
  filtriAttivi = {
    testoRicerca: document.getElementById("input-ricerca").value.trim(),
    categoria: document.getElementById("select-categoria-filtro").value,
  };
  renderListaDocumenti();
}

async function renderListaDocumenti() {
  const container = document.getElementById("lista-documenti");
  container.innerHTML = '<div class="stato-vuoto">Caricamento...</div>';

  try {
    const documenti = await cercaDocumenti(filtriAttivi);

    if (documenti.length === 0) {
      container.innerHTML = '<div class="stato-vuoto">Nessun documento trovato.</div>';
      return;
    }

    container.innerHTML = documenti.map(renderCardDocumento).join("");

    container.querySelectorAll(".card-documento").forEach((card) => {
      card.addEventListener("click", () => apriDettaglioDocumento(card.dataset.id, documenti));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="stato-vuoto">Errore nel caricamento dei documenti.</div>';
  }
}

function renderCardDocumento(doc) {
  const dataStr = doc.dataDocumento
    ? new Date(doc.dataDocumento.seconds * 1000).toLocaleDateString("it-IT")
    : "—";
  const tagHtml = (doc.tag || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");

  const numAllegati = ottieniAllegati(doc).length;
  const badgeAllegati = numAllegati > 1 ? `<span class="tag-pill">📎 ${numAllegati} allegati</span>` : "";

  return `
    <div class="card-documento" data-id="${doc.id}">
      <div class="icona-categoria">${iniziale(doc.categoria)}</div>
      <div class="info">
        <div class="titolo">${escapeHtml(doc.titolo)}</div>
        <div class="dettagli">${escapeHtml(doc.categoria)} · ${escapeHtml(doc.intestatario || "—")} · ${dataStr}</div>
        <div style="margin-top:6px">${tagHtml}${badgeAllegati}</div>
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
    tag: document
      .getElementById("upload-tag")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean),
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
    await caricaDocumento(files, meta, (pct) => {
      fillEl.style.width = `${pct}%`;
    });
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

  const puoModificare = puoScrivere();
  const allegati = ottieniAllegati(doc);

  const allegatiHtml = allegati
    .map(
      (a, idx) => `
      <div class="card-documento" style="cursor:pointer; padding:10px 14px;" data-allegato-idx="${idx}">
        <div class="icona-categoria" style="width:34px; height:34px; font-size:1rem;">📄</div>
        <div class="info">
          <div class="titolo" style="font-size:0.9rem;">${escapeHtml(a.nomeFile)}</div>
        </div>
      </div>
    `
    )
    .join("");

  const html = `
    <div class="overlay" id="overlay-dettaglio">
      <div class="modale">
        <h2>${escapeHtml(doc.titolo)}</h2>
        <p style="color:var(--colore-testo-secondario); margin-bottom:4px;">
          ${escapeHtml(doc.categoria)} · ${escapeHtml(doc.intestatario || "—")} · ${dataStr}
        </p>
        <div style="margin:12px 0">
          ${(doc.tag || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}
        </div>

        <p style="font-size:0.85rem; font-weight:600; color:var(--colore-testo-secondario); margin-bottom:8px;">
          ${allegati.length === 1 ? "Allegato" : `Allegati (${allegati.length})`}
        </p>
        <div id="lista-allegati-dettaglio" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          ${allegatiHtml}
        </div>

        ${puoModificare ? '<button class="btn btn-secondario btn-blocco" id="btn-modifica-doc" style="margin-bottom:10px">Modifica</button>' : ""}
        ${puoModificare ? '<button class="btn btn-pericolo btn-blocco" id="btn-elimina-doc" style="margin-bottom:10px">Elimina</button>' : ""}
        <button class="btn btn-secondario btn-blocco" id="btn-chiudi-dettaglio">Chiudi</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", html);

  // Click su un allegato → scarica/apri quello specifico
  document.querySelectorAll("#lista-allegati-dettaglio [data-allegato-idx]").forEach((el) => {
    el.addEventListener("click", async () => {
      const idx = parseInt(el.dataset.allegatoIdx, 10);
      const allegato = allegati[idx];
      const testoOriginale = el.querySelector(".titolo").textContent;
      el.querySelector(".titolo").textContent = "Apertura...";
      try {
        const url = await ottieniUrlDownload(allegato.storageRef);
        await new Promise((r) => setTimeout(r, 500));
        window.location.href = url;
      } catch (err) {
        alert("Impossibile aprire il file: " + (err.message || "errore sconosciuto"));
        el.querySelector(".titolo").textContent = testoOriginale;
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
}

function apriModaleModifica(doc) {
  const dataValue = doc.dataDocumento
    ? new Date(doc.dataDocumento.seconds * 1000).toISOString().split("T")[0]
    : "";

  const opzioniCategorie = categorieCache
    .map((c) => `<option value="${escapeHtml(c.nome)}" ${c.nome === doc.categoria ? "selected" : ""}>${escapeHtml(c.nome)}</option>`)
    .join("");

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

    const modifiche = {
      titolo: document.getElementById("modifica-titolo").value.trim(),
      categoria: document.getElementById("modifica-categoria").value,
      intestatario: document.getElementById("modifica-intestatario").value.trim(),
      dataDocumento: document.getElementById("modifica-data").value
        ? firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("modifica-data").value))
        : null,
      tag: document
        .getElementById("modifica-tag")
        .value.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
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
