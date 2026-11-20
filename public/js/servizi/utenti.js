// =====================================================================
//  Profilo dell'utente collegato ed elenco delle persone.
//  Un utente può usare l'app solo se esiste il documento utenti/{uid}
//  con attivo == true (lo controllano anche le regole di Firestore).
// =====================================================================

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase.js';

const CHIAVE_PROFILO = 'bottega.profilo';

let corrente = null;
let elenco = null;

/**
 * Carica il profilo dell'utente appena entrato.
 * @returns {Promise<{uid, nome, email} | null>} null se non autorizzato
 */
export async function caricaProfilo(utenteFirebase) {
  const uid = utenteFirebase.uid;
  try {
    const snap = await getDoc(doc(db, 'utenti', uid));
    if (!snap.exists() || snap.data().attivo !== true) {
      corrente = null;
      localStorage.removeItem(CHIAVE_PROFILO);
      return null;
    }
    corrente = { uid, nome: snap.data().nome, email: snap.data().email ?? utenteFirebase.email };
    localStorage.setItem(CHIAVE_PROFILO, JSON.stringify(corrente));
    return corrente;
  } catch (err) {
    if (err?.code === 'permission-denied') return null;
    // Senza rete e senza cache: usiamo l'ultimo profilo salvato sul dispositivo.
    const salvato = JSON.parse(localStorage.getItem(CHIAVE_PROFILO) ?? 'null');
    if (salvato?.uid === uid) {
      corrente = salvato;
      return corrente;
    }
    throw err;
  }
}

/** La "firma" da scrivere in ogni operazione: { uid, nome }. */
export function firmaUtente() {
  if (!corrente) throw new Error('Nessun utente collegato');
  return { uid: corrente.uid, nome: corrente.nome };
}

export function profiloCorrente() {
  return corrente;
}

export function dimenticaProfilo() {
  corrente = null;
  elenco = null;
}

/** Tutte le persone (per i filtri dello storico). */
export async function elencoUtenti() {
  if (!elenco) {
    const snap = await getDocs(collection(db, 'utenti'));
    elenco = snap.docs
      .map((d) => ({ uid: d.id, nome: d.data().nome, attivo: d.data().attivo }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  }
  return elenco;
}
