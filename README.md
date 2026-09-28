# Gatto Impianti — Preventivi digitali

App mobile-first per creare preventivi digitali, gemella dell'app Rapportino. Costruita con React + Vite + Tailwind, pronta per il deploy su Vercel.

---

## 1. Struttura del progetto

```
gatto-impianti-preventivi/
├─ src/
│  ├─ App.jsx        ← tutta la logica e l'interfaccia dell'app
│  ├─ pdf.js         ← generazione del PDF del preventivo
│  ├─ main.jsx        ← punto di ingresso React (registra anche il service worker)
│  ├─ index.css        ← Tailwind
│  └─ assets/logo.png  ← il tuo logo (lo stesso dell'app Rapportino)
├─ public/
│  ├─ manifest.json    ← configurazione PWA (nome, icone, modalità schermo intero)
│  ├─ sw.js         ← service worker (installabilità + uso offline)
│  ├─ apple-touch-icon.png ← icona per l'installazione su iOS
│  └─ icons/         ← icone 192px / 512px / maskable per Android
├─ index.html
├─ package.json
├─ .env.example        ← modello per le chiavi Telegram (vedi punto 3)
└─ vite.config.js
```

## 2. Come pubblicare su Vercel

**Opzione A — dal sito Vercel (più semplice, senza terminale)**

1. Estrai lo .zip su una cartella sul tuo computer.
2. Crea un repository su GitHub e carica tutta la cartella `gatto-impianti-preventivi`.
3. Vai su [vercel.com](https://vercel.com) → **Add New... → Project**.
4. Seleziona il repository appena creato.
5. Vercel riconosce automaticamente **Vite** come framework: lascia i valori di default
   (Build Command: `npm run build`, Output Directory: `dist`).
6. Prima di premere "Deploy", aggiungi le variabili d'ambiente (vedi punto 3 sotto) in **Environment Variables**.
7. Premi **Deploy**. In circa 1 minuto avrai l'URL pubblico dell'app.

**Opzione B — da terminale con Vercel CLI**

```bash
npm install -g vercel
cd gatto-impianti-preventivi
npm install
vercel
```

Ogni volta che modifichi il codice e rifai il push su GitHub (o rilanci `vercel --prod`), il sito si aggiorna automaticamente.

Se hai già collegato l'app Rapportino allo stesso bot/gruppo Telegram, puoi **riusare lo stesso Token e lo stesso Chat ID** anche qui (punto 3): arriveranno nello stesso gruppo, distinguibili dall'emoji 📄 e dalla dicitura "Nuovo preventivo".

---

## 3. Collegare l'invio reale (Telegram)

Il pulsante "Invia Preventivo" oggi, se non configuri nulla, mostra comunque la conferma a schermo ma **non invia nessun messaggio reale** (modalità demo). Per attivare l'invio vero, usa un **bot Telegram** (gratuito, istantaneo).

### Passo 1 — Crea il bot (o riusa quello del Rapportino)
1. Apri Telegram e cerca **@BotFather**.
2. Scrivigli **/newbot**, scegli un nome (es. "Preventivi Gatto Impianti") e uno username che finisca in "bot".
3. BotFather ti darà un **Token** (stringa tipo `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`) — è il tuo `TELEGRAM_BOT_TOKEN`.

### Passo 2 — Gruppo di destinazione
Puoi usare lo stesso gruppo dei rapportini, oppure crearne uno dedicato ai preventivi e aggiungere il bot come membro.

### Passo 3 — Trova il Chat ID
1. Scrivi un messaggio nel gruppo.
2. Apri `https://api.telegram.org/bot<TOKEN>/getUpdates` nel browser (sostituendo `<TOKEN>`).
3. Cerca `"chat":{"id":-1001234567890,...}` — quel numero è il tuo **Chat ID**.

### Passo 4 — Inserisci le chiavi nel progetto

In locale:
1. Duplica `.env.example` e rinominalo `.env`.
2. Incolla i tuoi valori:
```
VITE_TELEGRAM_BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_TELEGRAM_CHAT_ID=-1001234567890
```
3. Riavvia `npm run dev`.

Su Vercel: **Settings → Environment Variables** → aggiungi le stesse due variabili → **Deployments → ⋯ → Redeploy**.

### Passo 5 — Test
Compila un preventivo di prova e premi "Invia Preventivo": messaggio e PDF dovrebbero comparire nel gruppo Telegram in pochi secondi.

---

## 4. PDF automatico del preventivo

Ogni invio genera un **PDF con intestazione aziendale** (logo, tagline, dati di sede) e lo allega su Telegram. Il PDF include: cliente, indirizzo (via, paese, CAP, provincia), descrizione del preventivo, tabella voci (descrizione, quantità, unità, prezzo, sconto per riga, totale riga), sconto complessivo, imponibile, IVA (inserita liberamente), totale finale, validità dell'offerta e note.

### Modifica dal messaggio Telegram

Ogni messaggio inviato su Telegram include un pulsante **"✏️ Modifica Preventivo"**. Toccandolo si riapre il sito con tutti i campi già precompilati con i dati inseriti in precedenza (cliente, indirizzo, voci, sconti, IVA, note...): basta modificare quello che serve e reinviare, il sistema crea un nuovo messaggio/PDF aggiornato (non sovrascrive quello vecchio, che resta comunque visibile nella chat).

Nota tecnica: i dati vengono codificati direttamente nel link (non c'è un database), quindi il pulsante funziona anche se il sito viene rigenerato o ridistribuito.

### Chat separata "Preventivi modificati"

I preventivi inviati dopo aver premuto "Modifica Preventivo" non vanno nella chat principale ma in una seconda chat Telegram (es. "Preventivi modificati"), con l'intestazione "Preventivo MODIFICATO". Per attivarla serve una terza variabile d'ambiente, `VITE_TELEGRAM_CHAT_ID_MODIFICATI`, con l'ID di quel gruppo (si ricava come per la chat principale, con `getUpdates`). Se la variabile non è impostata, le modifiche ripiegano sulla chat principale.

**Per modificare contenuto/stile del PDF**: apri `src/pdf.js`.

---

## 5. Modifiche future comuni

- **Aggiungere/rimuovere un dipendente**: modifica l'array `EMPLOYEES` in `src/App.jsx` (attualmente: Fabio, Filippo, Gastone).
- **Cambiare le unità di misura disponibili**: modifica `UNIT_OPTIONS` in `src/App.jsx` (default: Pz, Mt, Ore, A corpo).
- **Cambiare le opzioni di validità dell'offerta**: modifica `VALIDITA_OPTIONS` in `src/App.jsx`.
- **Campi indirizzo**: Via, Paese, CAP e Provincia in `src/App.jsx` sono ora campi liberi (il CAP accetta solo numeri), senza autocompilamento.
- **Cambiare il logo**: sostituisci `src/assets/logo.png` (mantieni sfondo trasparente).

---

## 6. Comandi utili

```bash
npm install       # installa le dipendenze (solo la prima volta)
npm run dev        # avvia il sito in locale per testare (http://localhost:5173)
npm run build       # crea la versione di produzione nella cartella dist/
npm run preview      # visualizza in locale la build di produzione
```

---

## 7. Installare l'app sulla home del telefono (PWA)

Identico all'app Rapportino:

**Su iPhone (Safari):** apri il link → icona di condivisione → **"Aggiungi a Home"**.

**Su Android (Chrome):** apri il link → banner **"Aggiungi alla schermata Home"** (o Menu ⋮ → Installa app).

**Nota:** dopo un nuovo deploy, chi ha già installato l'app potrebbe dover riaprirla (swipe via e riapri) prima che il service worker scarichi l'aggiornamento.
