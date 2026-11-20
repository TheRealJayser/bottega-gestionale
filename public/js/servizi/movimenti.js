// =====================================================================
//  MOVIMENTI DI MAGAZZINO: carichi, scarichi e rettifiche.
//
//  Ogni movimento è UNA scrittura indivisibile (batch) che:
//   - aggiunge/toglie la quantità con increment() → se due persone
//     scaricano lo stesso prodotto nello stesso istante, contano
//     entrambe le operazioni;
//   - crea il documento nello storico "movimenti".
//  Funziona anche offline: le operazioni partono quando torna la rete.
//  (Le transazioni invece fallirebbero senza rete: per questo non le usiamo.)
// =====================================================================

import {
  collection, doc, getDocs, increment, limit, onSnapshot, orderBy,
  query, serverTimestamp, startAfter, Timestamp, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { invia } from './scritture.js';
import { firmaUtente } from './utenti.js';
import { applicaInLocale, perId, ripristinaDaServer } from './prodotti.js';
import { formattaDelta } from '../util/unita.js';

export const TIPI = {
  carico: 'Carico',
  scarico: 'Scarico',
  rettifica: 'Rettifica',
};

/**
 * Registra un movimento.
 * @param {string} idProdotto
 * @param {'carico'|'scarico'|'rettifica'} tipo
 * @param {number} delta intero nell'unità minima (+ entra, − esce)
 * @param {string} [nota]
 * @returns {Promise<boolean>} conferma del server (non serve aspettarla)
 */
export function registraMovimento(idProdotto, tipo, delta, nota = '') {
  const p = perId(idProdotto);
  if (!p) throw new Error('Prodotto non trovato');
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Quantità non valida');
  if (tipo === 'carico' && delta < 0) delta = -delta;
  if (tipo === 'scarico' && delta > 0) delta = -delta;

  const firma = firmaUtente();
  const mov = doc(collection(db, 'movimenti'));
  const batch = writeBatch(db);

  batch.set(mov, {
    idProdotto,
    nomeProdotto: p.nome,
    unita: p.unita,
    tipo,
    delta,
    nota: String(nota ?? '').trim().slice(0, 500),
    utente: firma,
    data: serverTimestamp(),
  });

  batch.update(doc(db, 'prodotti', idProdotto), {
    quantita: increment(delta),
    ultimoMovimento: mov.id,
    modificatoDa: firma,
    modificatoIl: serverTimestamp(),
  });

  applicaInLocale(idProdotto, {
    quantita: p.quantita + delta,
    ultimoMovimento: mov.id,
    modificatoDa: firma,
  });

  return invia(
    batch,
    `${TIPI[tipo]} ${formattaDelta(delta, p.unita)} di "${p.nome}"`,
    () => ripristinaDaServer(idProdotto),
  );
}

/**
 * Rettifica: porta la quantità a un valore preciso (es. dopo un conteggio).
 * Registra la differenza rispetto alla quantità attuale.
 */
export function rettificaA(idProdotto, nuovaQuantita, nota = '') {
  const p = perId(idProdotto);
  const delta = nuovaQuantita - p.quantita;
  if (delta === 0) return null;
  return registraMovimento(idProdotto, 'rettifica', delta, nota || 'Conteggio');
}

function daDocumento(snap) {
  const d = snap.data({ serverTimestamps: 'estimate' });
  return { id: snap.id, ...d, data: d.data?.toMillis?.() ?? null };
}

/**
 * Cerca nello storico, con filtri e a pagine.
 * @param {{idProdotto?: string, uid?: string, da?: Date, a?: Date,
 *          cursore?: any, quanti?: number}} filtri
 */
export async function cercaMovimenti({ idProdotto, uid, da, a, cursore, quanti = 50 } = {}) {
  const vincoli = [];
  if (idProdotto) vincoli.push(where('idProdotto', '==', idProdotto));
  if (uid) vincoli.push(where('utente.uid', '==', uid));
  if (da) vincoli.push(where('data', '>=', Timestamp.fromDate(da)));
  if (a) vincoli.push(where('data', '<', Timestamp.fromDate(a)));
  vincoli.push(orderBy('data', 'desc'));
  if (cursore) vincoli.push(startAfter(cursore));
  vincoli.push(limit(quanti));

  const snap = await getDocs(query(collection(db, 'movimenti'), ...vincoli));
  return {
    righe: snap.docs.map(daDocumento),
    cursore: snap.docs.at(-1) ?? null,
    finito: snap.size < quanti,
  };
}

/** Ultimi movimenti di un prodotto, in tempo reale (per la scheda). */
export function ascoltaUltimiMovimenti(idProdotto, quanti, cb) {
  const q = query(
    collection(db, 'movimenti'),
    where('idProdotto', '==', idProdotto),
    orderBy('data', 'desc'),
    limit(quanti),
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map(daDocumento)), (err) => {
    console.error(err);
    cb(null, err);
  });
}
