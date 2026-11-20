# Gestionale Bottega

Web app (PWA) per il magazzino della bottega: prodotti, quantità, prezzi con storico, carico/scarico rapido, scansione dei codici a barre, avvisi di scorta bassa, import/export CSV ed Excel.

Stack: Firebase (piano gratuito Spark) — Hosting, Authentication (email e password), Firestore. JavaScript puro a moduli, nessuna compilazione.

## Struttura

```
firebase.json            configurazione Hosting + Firestore
firestore.rules          regole di sicurezza (chi può fare cosa)
firestore.indexes.json   indici per i filtri dello storico movimenti
public/                  l'app pubblicata
  index.html             pagina unica + versione di Firebase (import map)
  sw.js                  service worker (offline, installazione)
  css/stile.css          grafica (telefono prima, computer da 900 px)
  js/app.js              avvio e navigazione
  js/firebase-config.js  dati del progetto Firebase  ← da compilare
  js/servizi/            accesso ai dati (unico posto che parla con Firebase)
  js/ui/                 schermate e componenti
  js/util/               formati, unità di misura, codici, CSV, foto
```

## Pubblicare una modifica

```bash
firebase deploy                 # tutto
firebase deploy --only hosting  # solo l'app
firebase deploy --only firestore:rules
```

Quando cambi i file dell'app, aumenta la versione in `public/sw.js` (`VERSIONE`) e in `public/js/ui/installazione.js` (`VERSIONE_APP`). Se aggiungi un file JavaScript, aggiungilo anche all'elenco `FILE_APP` in `sw.js`.

## Aggiungere un utente

1. Console Firebase → Authentication → Aggiungi utente (email + password provvisoria).
2. Firestore → raccolta `utenti` → nuovo documento con ID = UID dell'utente e campi `nome` (string), `email` (string), `attivo` (boolean true), `creatoIl` (timestamp).

Per togliere l'accesso: `attivo` = false (lo storico resta).

## Scelte importanti

- Quantità sempre intere nell'unità minima (pezzi, grammi, millilitri); prezzi in centesimi.
- Ogni movimento è un batch atomico: `increment()` sulla quantità + documento in `movimenti`. Funziona offline. Le regole impediscono di cambiare la quantità senza un movimento corrispondente.
- I prodotti non si cancellano, si archiviano (serve alla sincronizzazione incrementale che risparmia letture).
- Foto compresse nel browser (~600 px, < 100 KB) nella raccolta `foto`, lette solo nella scheda. Per passare a Cloud Storage (piano Blaze) basta riscrivere `js/servizi/foto.js`.
- Nessun backup automatico sul piano gratuito: usare "Altro → Backup completo" almeno una volta al mese.
