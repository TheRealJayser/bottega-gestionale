// =====================================================================
//  SERVICE WORKER: rende l'app installabile e utilizzabile offline.
//
//  - File dell'app (stesso sito): prima la rete, poi la copia salvata.
//    Così con la rete si ha sempre l'ultima versione; senza rete l'app
//    si apre lo stesso.
//  - Librerie esterne con versione nell'indirizzo (Firebase, lettore di
//    codici, Excel): prima la copia salvata (non cambiano mai).
//  - Le chiamate al database NON passano di qui: le gestisce Firestore.
// =====================================================================

const VERSIONE = 'bottega-1.1.0';

const FILE_APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/stile.css',
  'icone/icona.svg',
  'icone/icona-192.png',
  'icone/apple-touch-icon.png',
  'js/app.js',
  'js/firebase-config.js',
  'js/servizi/archivio-locale.js',
  'js/servizi/auth.js',
  'js/servizi/firebase.js',
  'js/servizi/foto.js',
  'js/servizi/importa-esporta.js',
  'js/servizi/movimenti.js',
  'js/servizi/prodotti.js',
  'js/servizi/scritture.js',
  'js/servizi/storici.js',
  'js/servizi/utenti.js',
  'js/ui/componenti.js',
  'js/ui/dom.js',
  'js/ui/finestra-scanner.js',
  'js/ui/icone.js',
  'js/ui/installazione.js',
  'js/ui/lettore-tastiera.js',
  'js/ui/scanner.js',
  'js/ui/vista-accesso.js',
  'js/ui/vista-altro.js',
  'js/ui/vista-elenco.js',
  'js/ui/vista-modulo.js',
  'js/ui/vista-movimenti.js',
  'js/ui/vista-riordino.js',
  'js/ui/vista-scansione.js',
  'js/ui/vista-scheda.js',
  'js/util/codici.js',
  'js/util/csv.js',
  'js/util/formato.js',
  'js/util/immagini.js',
  'js/util/testo.js',
  'js/util/unita.js',
];

const LIBRERIE_ESTERNE = [
  'https://www.gstatic.com/firebasejs/',
  'https://cdn.jsdelivr.net/npm/',
  'https://fastly.jsdelivr.net/npm/',
  'https://cdn.sheetjs.com/',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSIONE)
      .then((cache) => cache.addAll(FILE_APP))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== 'GET') return;
  const url = new URL(richiesta.url);

  // Librerie esterne: prima la cache.
  if (LIBRERIE_ESTERNE.some((prefisso) => richiesta.url.startsWith(prefisso))) {
    evento.respondWith(
      caches.match(richiesta).then((salvata) => salvata ?? fetch(richiesta).then((risposta) => {
        if (risposta.ok) {
          const copia = risposta.clone();
          caches.open(VERSIONE).then((cache) => cache.put(richiesta, copia));
        }
        return risposta;
      })),
    );
    return;
  }

  // File dell'app: prima la rete, poi la cache.
  if (url.origin === self.location.origin && !url.pathname.startsWith('/__/')) {
    evento.respondWith(
      fetch(richiesta)
        .then((risposta) => {
          if (risposta.ok) {
            const copia = risposta.clone();
            caches.open(VERSIONE).then((cache) => cache.put(richiesta, copia));
          }
          return risposta;
        })
        .catch(async () => (await caches.match(richiesta, { ignoreSearch: true }))
          ?? (richiesta.mode === 'navigate' ? caches.match('index.html') : Response.error())),
    );
  }
});
