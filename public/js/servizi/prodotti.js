// =====================================================================
//  PRODOTTI: elenco sincronizzato in tempo reale + anagrafica.
//
//  Come funziona la sincronizzazione (pensata per il piano gratuito):
//  1. all'apertura si caricano i prodotti dalla copia locale (IndexedDB);
//  2. si ascoltano in tempo reale SOLO i prodotti con "modificatoIl"
//     successivo all'ultima sincronizzazione;
//  3. ogni prodotto ricevuto aggiorna la memoria e la copia locale.
//  Per questo i prodotti non si cancellano mai: si archiviano (se
//  sparissero, gli altri dispositivi non se ne accorgerebbero).
// =====================================================================

import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp,
  Timestamp, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import * as archivio from './archivio-locale.js';
import { invia } from './scritture.js';
import { firmaUtente } from './utenti.js';
import { normalizza } from '../util/testo.js';
import { infoUnita } from '../util/unita.js';

/** Margine di sicurezza sugli orari (2 minuti) per non perdere nulla. */
const MARGINE_MS = 2 * 60 * 1000;
const CHIAVE_SYNC = 'ultimaSincronizzazione';

/** Campi dell'anagrafica che una persona può modificare. */
export const CAMPI_ANAGRAFICA = [
  'nome', 'ean', 'categoria', 'prezzoVendita', 'prezzoAcquisto',
  'unita', 'sogliaMinima', 'passo', 'fornitore', 'note',
];

// ---------- Stato in memoria ----------

const prodotti = new Map();   // id → prodotto
const perCodice = new Map();  // codice a barre → id
const ascoltatori = new Set();
const statoSync = { pronto: false, daServer: false, errore: null };
let annullaAscolto = null;
let notificaInCoda = false;
let risolviPronto;
let promessaPronto = new Promise((ok) => { risolviPronto = ok; });

/** Chiama `cb()` ogni volta che l'elenco cambia. Restituisce la funzione per smettere. */
export function suCambio(cb) {
  ascoltatori.add(cb);
  return () => ascoltatori.delete(cb);
}

function notifica() {
  if (notificaInCoda) return;
  notificaInCoda = true;
  queueMicrotask(() => {
    notificaInCoda = false;
    ascoltatori.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
  });
}

const inMillisecondi = (t) => (t?.toMillis ? t.toMillis() : (typeof t === 'number' ? t : null));

/** Documento Firestore → oggetto semplice (date in millisecondi). */
function daDocumento(snap) {
  const d = snap.data({ serverTimestamps: 'estimate' });
  return {
    id: snap.id,
    ...d,
    creatoIl: inMillisecondi(d.creatoIl),
    modificatoIl: inMillisecondi(d.modificatoIl),
  };
}

function inserisciInMemoria(p) {
  const vecchio = prodotti.get(p.id);
  if (vecchio?.ean && vecchio.ean !== p.ean && perCodice.get(vecchio.ean) === p.id) {
    perCodice.delete(vecchio.ean);
  }
  prodotti.set(p.id, p);
  if (p.ean) perCodice.set(p.ean, p.id);
}

function rimuoviDaMemoria(id) {
  const p = prodotti.get(id);
  if (p?.ean && perCodice.get(p.ean) === id) perCodice.delete(p.ean);
  prodotti.delete(id);
}

/**
 * Applica subito una modifica in locale (prima della conferma del
 * server), così l'interfaccia è immediata anche senza rete.
 */
export function applicaInLocale(id, modifiche) {
  const p = { ...(prodotti.get(id) ?? { id }), ...modifiche, modificatoIl: Date.now() };
  inserisciInMemoria(p);
  archivio.salvaProdotti([p]).catch(() => {});
  notifica();
}

/** Se il server rifiuta una scrittura, rilegge il prodotto com'è davvero. */
export async function ripristinaDaServer(id) {
  try {
    const snap = await getDoc(doc(db, 'prodotti', id));
    if (snap.exists()) {
      const p = daDocumento(snap);
      inserisciInMemoria(p);
      archivio.salvaProdotti([p]).catch(() => {});
    } else {
      rimuoviDaMemoria(id);
    }
  } catch (e) {
    console.error(e);
  }
  notifica();
}

// ---------- Sincronizzazione ----------

export async function avviaSincronizzazione() {
  fermaSincronizzazione();
  let ultima = 0;
  try {
    const salvati = await archivio.leggiProdotti();
    salvati.forEach(inserisciInMemoria);
    // Se la copia locale è vuota (prima volta o dati cancellati dal
    // browser) si scarica tutto da capo.
    ultima = salvati.length ? (await archivio.leggiMeta(CHIAVE_SYNC)) ?? 0 : 0;
    if (salvati.length) {
      statoSync.pronto = true;
      risolviPronto();
    }
  } catch (e) {
    console.warn('Copia locale non disponibile, scarico tutto dal server', e);
  }
  notifica();

  const da = Timestamp.fromMillis(Math.max(0, ultima - MARGINE_MS));
  const q = query(collection(db, 'prodotti'), where('modificatoIl', '>', da));

  annullaAscolto = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const daSalvare = [];
    let massimo = ultima;
    snap.docChanges({ includeMetadataChanges: true }).forEach((cambio) => {
      if (cambio.type === 'removed') return;
      const p = daDocumento(cambio.doc);
      inserisciInMemoria(p);
      daSalvare.push(p);
      // Avanziamo la data di sincronizzazione solo con dati confermati dal server.
      if (!cambio.doc.metadata.hasPendingWrites && !snap.metadata.fromCache && p.modificatoIl > massimo) {
        massimo = p.modificatoIl;
      }
    });

    statoSync.daServer = !snap.metadata.fromCache;
    statoSync.errore = null;
    if (!statoSync.pronto && (statoSync.daServer || prodotti.size > 0)) {
      statoSync.pronto = true;
      risolviPronto();
    }
    notifica();

    if (daSalvare.length) {
      archivio.salvaProdotti(daSalvare)
        .then(() => {
          if (massimo > ultima) {
            ultima = massimo;
            return archivio.scriviMeta(CHIAVE_SYNC, massimo);
          }
        })
        .catch((e) => console.warn('Salvataggio locale non riuscito', e));
    }
  }, (err) => {
    console.error('Sincronizzazione interrotta', err);
    statoSync.errore = err?.code === 'permission-denied'
      ? 'Accesso ai dati negato: l\'account potrebbe essere stato disattivato.'
      : 'Sincronizzazione interrotta: ' + (err?.message ?? '');
    statoSync.pronto = true;
    risolviPronto();
    notifica();
  });
}

export function fermaSincronizzazione() {
  annullaAscolto?.();
  annullaAscolto = null;
}

/** Cancella la copia locale e riscarica tutto (in caso di dubbi). */
export async function risincronizzaTutto() {
  fermaSincronizzazione();
  prodotti.clear();
  perCodice.clear();
  statoSync.pronto = false;
  promessaPronto = new Promise((ok) => { risolviPronto = ok; });
  await archivio.svuotaArchivio().catch(() => {});
  notifica();
  await avviaSincronizzazione();
}

/** Promessa che si risolve quando l'elenco è disponibile. */
export function attendiPronto() {
  return promessaPronto;
}

export function statoSincronizzazione() {
  return { ...statoSync, numero: prodotti.size };
}

// ---------- Letture (dalla memoria, istantanee) ----------

export function perId(id) {
  return prodotti.get(id) ?? null;
}

export function perCodiceABarre(codice) {
  const id = perCodice.get(codice);
  return id ? prodotti.get(id) ?? null : null;
}

export function tutti({ archiviati = false } = {}) {
  const lista = [...prodotti.values()];
  return archiviati ? lista : lista.filter((p) => !p.archiviato);
}

function valoriDistinti(campo) {
  const insieme = new Set();
  for (const p of prodotti.values()) if (p[campo]) insieme.add(p[campo]);
  return [...insieme].sort((a, b) => a.localeCompare(b, 'it'));
}

export const categorie = () => valoriDistinti('categoria');
export const fornitori = () => valoriDistinti('fornitore');

/** Prodotti sotto la scorta minima (con soglia impostata). */
export function daRiordinare() {
  return tutti().filter((p) => p.sogliaMinima > 0 && p.quantita <= p.sogliaMinima);
}

// ---------- Scritture ----------

/** Pulisce e completa i dati inseriti nel modulo. */
function preparaDati(d) {
  const nome = String(d.nome ?? '').trim();
  const categoria = String(d.categoria ?? '').trim();
  return {
    nome,
    nomeRicerca: normalizza(`${nome} ${categoria}`),
    ean: d.ean ? String(d.ean) : null,
    categoria,
    prezzoVendita: d.prezzoVendita ?? 0,
    prezzoAcquisto: d.prezzoAcquisto ?? null,
    unita: d.unita ?? 'pz',
    sogliaMinima: d.sogliaMinima ?? 0,
    passo: d.passo > 0 ? d.passo : infoUnita(d.unita).passo,
    fornitore: String(d.fornitore ?? '').trim(),
    note: String(d.note ?? '').trim(),
  };
}

/**
 * Crea un nuovo prodotto (con eventuale quantità iniziale).
 * @returns {{ id: string, conferma: Promise<boolean> }}
 */
export function crea(dati, quantitaIniziale = 0) {
  const firma = firmaUtente();
  const base = preparaDati(dati);
  const rif = doc(collection(db, 'prodotti'));
  const batch = writeBatch(db);

  let ultimoMovimento = null;
  if (quantitaIniziale !== 0) {
    const mov = doc(collection(db, 'movimenti'));
    ultimoMovimento = mov.id;
    batch.set(mov, {
      idProdotto: rif.id,
      nomeProdotto: base.nome,
      unita: base.unita,
      tipo: quantitaIniziale > 0 ? 'carico' : 'rettifica',
      delta: quantitaIniziale,
      nota: 'Quantità iniziale',
      utente: firma,
      data: serverTimestamp(),
    });
  }

  batch.set(rif, {
    ...base,
    quantita: quantitaIniziale,
    haFoto: false,
    archiviato: false,
    ultimoMovimento,
    creatoDa: firma,
    creatoIl: serverTimestamp(),
    modificatoDa: firma,
    modificatoIl: serverTimestamp(),
  });

  if (base.ean) batch.set(doc(db, 'codici', base.ean), { idProdotto: rif.id });

  batch.set(doc(collection(rif, 'modifiche')), {
    azione: 'inserimento', campi: [], utente: firma, data: serverTimestamp(),
  });

  applicaInLocale(rif.id, {
    ...base, quantita: quantitaIniziale, haFoto: false, archiviato: false,
    ultimoMovimento, creatoDa: firma, creatoIl: Date.now(), modificatoDa: firma,
  });

  const conferma = invia(batch, `Inserimento di "${base.nome}"`, () => ripristinaDaServer(rif.id));
  return { id: rif.id, conferma };
}

/**
 * Salva le modifiche all'anagrafica. Registra nello storico chi ha
 * cambiato cosa e, per i prezzi, anche lo storico dei prezzi.
 * @returns {Promise<boolean> | null} null se non è cambiato nulla
 */
export function aggiorna(id, nuoviDati) {
  const attuale = prodotti.get(id);
  if (!attuale) throw new Error('Prodotto non trovato');
  const firma = firmaUtente();
  const base = preparaDati({ ...attuale, ...nuoviDati });

  const campi = CAMPI_ANAGRAFICA
    .filter((c) => (base[c] ?? null) !== (attuale[c] ?? null))
    .map((c) => ({ campo: c, vecchio: attuale[c] ?? null, nuovo: base[c] ?? null }));
  if (!campi.length) return null;

  const rif = doc(db, 'prodotti', id);
  const batch = writeBatch(db);
  batch.update(rif, { ...base, modificatoDa: firma, modificatoIl: serverTimestamp() });

  // Codice a barre cambiato: si libera il vecchio e si prenota il nuovo.
  if (base.ean !== attuale.ean) {
    if (attuale.ean) batch.delete(doc(db, 'codici', attuale.ean));
    if (base.ean) batch.set(doc(db, 'codici', base.ean), { idProdotto: id });
  }

  // Storico prezzi.
  for (const [campo, tipo] of [['prezzoVendita', 'vendita'], ['prezzoAcquisto', 'acquisto']]) {
    if ((base[campo] ?? null) !== (attuale[campo] ?? null)) {
      batch.set(doc(collection(rif, 'storicoPrezzi')), {
        tipo, vecchio: attuale[campo] ?? null, nuovo: base[campo] ?? null,
        utente: firma, data: serverTimestamp(),
      });
    }
  }

  batch.set(doc(collection(rif, 'modifiche')), {
    azione: 'modifica', campi, utente: firma, data: serverTimestamp(),
  });

  applicaInLocale(id, { ...base, modificatoDa: firma });
  return invia(batch, `Modifica di "${base.nome}"`, () => ripristinaDaServer(id));
}

/** Archivia (nasconde) o ripristina un prodotto. */
export function impostaArchiviato(id, archiviato) {
  const attuale = prodotti.get(id);
  if (!attuale) throw new Error('Prodotto non trovato');
  const firma = firmaUtente();
  const rif = doc(db, 'prodotti', id);
  const batch = writeBatch(db);
  batch.update(rif, { archiviato, modificatoDa: firma, modificatoIl: serverTimestamp() });
  batch.set(doc(collection(rif, 'modifiche')), {
    azione: archiviato ? 'archiviazione' : 'ripristino',
    campi: [], utente: firma, data: serverTimestamp(),
  });
  applicaInLocale(id, { archiviato, modificatoDa: firma });
  return invia(batch, `${archiviato ? 'Archiviazione' : 'Ripristino'} di "${attuale.nome}"`,
    () => ripristinaDaServer(id));
}
