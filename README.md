# Archivio Famiglia — PWA

Archivio documentale digitale: Firebase (Auth + Firestore + Storage) + GitHub Pages,
stesso pattern usato per MedSafe.

## 1. Setup progetto Firebase

1. Vai su [console.firebase.google.com](https://console.firebase.google.com) → crea nuovo progetto
   (es. `archivio-famiglia-XXXX`, la sigla finale è generata automaticamente).
2. **Authentication** → tab "Sign-in method" → abilita **Email/Password**.
3. **Firestore Database** → crea database in produzione, regione `eur3` (Europa) o `europe-west1`
   per coerenza con i progetti MedSafe.
4. **Storage** → crea bucket (stessa regione di Firestore).
5. **Impostazioni progetto** → "Le tue app" → aggiungi app Web → copia la config
   e incollala in `js/firebase-config.js` al posto dei placeholder.

## 2. Pubblica le Security Rules

- Firestore → tab "Regole" → incolla il contenuto di `firestore.rules` → Pubblica.
- Storage → tab "Regole" → incolla il contenuto di `storage.rules` → Pubblica.

⚠️ Senza queste regole il database resta nel modo di test (aperto a chiunque) o bloccato
del tutto: vanno pubblicate prima di usare l'app con dati reali.

## 3. Crea il primo utente admin

Le regole vietano la scrittura della collezione `utenti` dal client (per sicurezza),
quindi il primo utente va creato manualmente:

1. **Authentication** → "Users" → "Add user" → inserisci email e password.
2. Copia lo **User UID** generato.
3. **Firestore** → crea manualmente un documento nella collezione `utenti`,
   con ID documento = lo User UID copiato, e questi campi:

   ```
   nome: "Ciro"
   ruolo: "admin"
   categorieVisibili: null
   ```

Da qui in poi puoi gestire gli altri utenti (familiari, eventuali esterni) sempre
allo stesso modo: crei l'utente in Authentication, poi il documento corrispondente
in `utenti` con il ruolo giusto.

**Ruoli disponibili:**
- `admin` — vede e gestisce tutto, incluse le categorie
- `familiare` — vede e carica tutti i documenti, non gestisce categorie/utenti
- `esterno` — vede solo le categorie elencate in `categorieVisibili` (es. `["Fiscale"]`),
  non può caricare né eliminare nulla

## 4. Deploy su GitHub Pages

```bash
git init
git add .
git commit -m "Setup iniziale Archivio Famiglia"
git remote add origin https://github.com/TUO_USERNAME/archivio-famiglia.git
git push -u origin main
```

Poi su GitHub: Settings → Pages → Source: `main` branch, cartella `/ (root)`.
L'app sarà raggiungibile su `https://TUO_USERNAME.github.io/archivio-famiglia/`.

## 5. Icone PWA

Genera due PNG (192×192 e 512×512) e mettili in `icons/icon-192.png` e `icons/icon-512.png`
prima del deploy — al momento la cartella è vuota. Qualsiasi generatore di icone PWA va bene
(anche un'immagine quadrata semplice esportata in due dimensioni).

## Struttura del progetto

```
archivio-famiglia/
├── index.html              # shell PWA, login + vista app + modale upload
├── manifest.json            # manifest PWA (installabilità)
├── service-worker.js        # cache shell statica (non i dati Firebase)
├── firestore.rules          # regole sicurezza Firestore (da pubblicare in console)
├── storage.rules            # regole sicurezza Storage (da pubblicare in console)
├── css/
│   └── style.css
├── js/
│   ├── firebase-config.js   # ⚠️ DA COMPILARE con le tue credenziali
│   ├── auth.js               # login/logout, gestione ruolo utente
│   ├── documenti.js          # CRUD Firestore + upload/download Storage
│   └── app.js                 # logica UI, rendering, eventi
└── icons/                    # ⚠️ DA POPOLARE con icon-192.png e icon-512.png
```

## Schema dati Firestore

```
documenti/{docId}
  titolo: string
  categoria: string
  tag: array<string>
  intestatario: string
  dataDocumento: timestamp | null
  dataCaricamento: timestamp (server)
  storageRef: string            # path su Storage
  thumbnailRef: string | null   # non ancora implementato, riservato per uso futuro
  caricatoDa: uid
  visibilita: "famiglia" | "privato" | "condiviso"   # solo "famiglia" usato per ora

utenti/{uid}
  nome: string
  ruolo: "admin" | "familiare" | "esterno"
  categorieVisibili: array<string> | null

categorie/{categoriaId}
  nome: string
  icona: string | null
  colore: string | null
  creataIl: timestamp
```

## Cosa manca / prossimi passi possibili

Non implementati in questa versione iniziale, ma lo schema dati li prevede già:

- **Modifica documento esistente** (la funzione `aggiornaDocumento()` esiste in
  `documenti.js` ma non è ancora collegata a nessun pulsante nell'interfaccia)
- **Thumbnail automatiche** per le immagini (richiederebbe una Cloud Function)
- **Condivisione esterna via link con scadenza** (alternativa all'account vero per
  il commercialista — quando deciderai, si aggiunge come collezione `linkCondivisi`
  separata, senza toccare lo schema esistente)
- **OCR / ricerca nel testo dei documenti** (oggi la ricerca è solo su titolo e tag)
- **Limite dimensione file lato client** prima dell'upload (oggi il limite di 25MB
  è solo lato Storage Rules, quindi l'utente lo scopre solo a upload fallito)

## Note sui costi (piano Spark, gratuito)

- Firestore: 1GB storage, 50k letture/giorno, 20k scritture/giorno
- Storage: 5GB totali, 1GB download/giorno
- Authentication: illimitato per email/password

Per un archivio di famiglia con uso normale, il piano gratuito dovrebbe reggere
a lungo. Se in futuro superi i limiti di Storage (es. tante scansioni ad alta
risoluzione), il piano Blaze (pay-as-you-go) ha costi molto bassi per GB aggiuntivi.
