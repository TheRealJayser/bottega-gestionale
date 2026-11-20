// =====================================================================
//  FOTO DEI PRODOTTI
//
//  Oggi (piano gratuito Spark): la foto compressa (< 100 KB) è salvata
//  in Firestore nella raccolta "foto", con lo stesso ID del prodotto,
//  MAI dentro il documento del prodotto. Si legge solo aprendo la scheda.
//
//  Domani (piano Blaze + Cloud Storage): basterà riscrivere QUESTO file
//  mantenendo le stesse tre funzioni (salvaFoto, leggiFoto, eliminaFoto).
//  Il resto dell'app non dovrà cambiare.
// =====================================================================

import {
  Bytes, collection, doc, getDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { invia } from './scritture.js';
import { firmaUtente } from './utenti.js';
import { applicaInLocale, perId, ripristinaDaServer } from './prodotti.js';

/** Foto già scaricate in questa sessione: id → indirizzo locale. */
const cache = new Map();

/**
 * Salva (o sostituisce) la foto di un prodotto.
 * @param {string} idProdotto
 * @param {{blob: Blob, formato: string, larghezza: number, altezza: number}} foto già compressa
 * @returns {Promise<{conferma: Promise<boolean>}>} si risolve appena la foto
 *   è salvata in locale; `conferma` arriva quando risponde il server.
 */
export async function salvaFoto(idProdotto, foto) {
  const p = perId(idProdotto);
  const firma = firmaUtente();
  const bytes = Bytes.fromUint8Array(new Uint8Array(await foto.blob.arrayBuffer()));
  const rifProdotto = doc(db, 'prodotti', idProdotto);
  const batch = writeBatch(db);

  batch.set(doc(db, 'foto', idProdotto), {
    dati: bytes,
    formato: foto.formato,
    larghezza: foto.larghezza,
    altezza: foto.altezza,
    dimensione: foto.blob.size,
    caricataDa: firma,
    caricataIl: serverTimestamp(),
  });
  batch.update(rifProdotto, { haFoto: true, modificatoDa: firma, modificatoIl: serverTimestamp() });
  batch.set(doc(collection(rifProdotto, 'modifiche')), {
    azione: 'foto',
    campi: [{ campo: 'foto', vecchio: p?.haFoto ? 'presente' : null, nuovo: 'nuova foto' }],
    utente: firma,
    data: serverTimestamp(),
  });

  impostaInCache(idProdotto, foto.blob);
  applicaInLocale(idProdotto, { haFoto: true, modificatoDa: firma });
  // Restituiamo un oggetto (non la promessa del server) così chi chiama
  // può aspettare il salvataggio locale senza restare bloccato offline.
  const conferma = invia(batch, `Foto di "${p?.nome ?? 'prodotto'}"`, () => {
    cache.delete(idProdotto);
    ripristinaDaServer(idProdotto);
  });
  return { conferma };
}

/**
 * Restituisce l'indirizzo dell'immagine da usare in <img src>, o null.
 * @returns {Promise<{url: string, caricataDa?: object, caricataIl?: number} | null>}
 */
export async function leggiFoto(idProdotto) {
  if (cache.has(idProdotto)) return cache.get(idProdotto);
  const snap = await getDoc(doc(db, 'foto', idProdotto));
  if (!snap.exists()) return null;
  const d = snap.data({ serverTimestamps: 'estimate' });
  const blob = new Blob([d.dati.toUint8Array()], { type: d.formato });
  return impostaInCache(idProdotto, blob, d.caricataDa, d.caricataIl?.toMillis?.());
}

/** Toglie la foto da un prodotto. */
export function eliminaFoto(idProdotto) {
  const p = perId(idProdotto);
  const firma = firmaUtente();
  const rifProdotto = doc(db, 'prodotti', idProdotto);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'foto', idProdotto));
  batch.update(rifProdotto, { haFoto: false, modificatoDa: firma, modificatoIl: serverTimestamp() });
  batch.set(doc(collection(rifProdotto, 'modifiche')), {
    azione: 'foto',
    campi: [{ campo: 'foto', vecchio: 'presente', nuovo: null }],
    utente: firma,
    data: serverTimestamp(),
  });

  const vecchia = cache.get(idProdotto);
  if (vecchia) URL.revokeObjectURL(vecchia.url);
  cache.delete(idProdotto);
  applicaInLocale(idProdotto, { haFoto: false, modificatoDa: firma });
  return invia(batch, `Rimozione foto di "${p?.nome ?? 'prodotto'}"`, () => ripristinaDaServer(idProdotto));
}

/** Legge i dati grezzi di una foto (per il backup completo). */
export async function leggiFotoGrezza(idProdotto) {
  const snap = await getDoc(doc(db, 'foto', idProdotto));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { formato: d.formato, base64: d.dati.toBase64() };
}

function impostaInCache(idProdotto, blob, caricataDa = firmaSicura(), caricataIl = Date.now()) {
  const vecchia = cache.get(idProdotto);
  if (vecchia) URL.revokeObjectURL(vecchia.url);
  const voce = { url: URL.createObjectURL(blob), caricataDa, caricataIl };
  cache.set(idProdotto, voce);
  return voce;
}

function firmaSicura() {
  try { return firmaUtente(); } catch { return null; }
}
