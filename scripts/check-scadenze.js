name: Controllo scadenze documenti

on:
  schedule:
    # Ogni giorno alle 07:00 UTC = 08:00 ora italiana (09:00 ora legale)
    - cron: '0 7 * * *'
  workflow_dispatch:
    # Permette anche di avviarlo manualmente da GitHub per testarlo

jobs:
  check-scadenze:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: scripts/package.json

      - name: Installa dipendenze
        working-directory: scripts
        run: npm install

      - name: Controlla scadenze e invia notifiche
        working-directory: scripts
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
        run: node check-scadenze.js
