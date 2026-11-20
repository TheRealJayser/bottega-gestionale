// =====================================================================
//  Copia locale dell'elenco prodotti (IndexedDB del browser).
//
//  Serve a risparmiare le letture gratuite di Firestore: all'apertura
//  l'app mostra subito i prodotti salvati qui e chiede al server solo
//  quelli cambiati dopo l'ultima sincronizzazione.
// =====================================================================

const NOME_DB = 'bottega-locale';
const VERSIONE_DB = 1;

let promessaDb = null;

function apri() {
  if (!promessaDb) {
    promessaDb = new Promise((ok, ko) => {
      const richiesta = indexedDB.open(NOME_DB, VERSIONE_DB);
      richiesta.onupgradeneeded = () => {
        const db = richiesta.result;
        if (!db.objectStoreNames.contains('prodotti')) db.createObjectStore('prodotti', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      richiesta.onsuccess = () => ok(richiesta.result);
      richiesta.onerror = () => ko(richiesta.error);
    });
  }
  return promessaDb;
}

/** Esegue `operazione(store)` in una transazione e restituisce il risultato. */
async function transazione(nomeStore, modo, operazione) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const tx = db.transaction(nomeStore, modo);
    const richiesta = operazione(tx.objectStore(nomeStore));
    tx.oncomplete = () => ok(richiesta?.result);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error);
  });
}

export function leggiProdotti() {
  return transazione('prodotti', 'readonly', (s) => s.getAll());
}

export function salvaProdotti(lista) {
  return transazione('prodotti', 'readwrite', (s) => { lista.forEach((p) => s.put(p)); });
}

export function leggiMeta(chiave) {
  return transazione('meta', 'readonly', (s) => s.get(chiave));
}

export function scriviMeta(chiave, valore) {
  return transazione('meta', 'readwrite', (s) => s.put(valore, chiave));
}

/** Cancella la copia locale (per una risincronizzazione completa). */
export async function svuotaArchivio() {
  await transazione('prodotti', 'readwrite', (s) => s.clear());
  await transazione('meta', 'readwrite', (s) => s.clear());
}
