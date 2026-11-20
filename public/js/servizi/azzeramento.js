// =====================================================================
//  CANCELLA TUTTI I DATI
//
//  Cancella davvero dal server: prodotti (con storico prezzi e registro
//  modifiche), codici a barre, foto e storico movimenti. Gli account
//  (raccolta "utenti") restano.
//
//  Come funziona (le regole lo impongono):
//  1. si scrive sistema/azzeramento con stato "in corso" a nome di chi
//     cancella: solo allora le regole permettono le cancellazioni, e solo
//     a quella persona;
//  2. si cancella tutto a gruppi di 400;
//  3. si segna "completato" con l'ora del server: gli altri dispositivi
//     lo vedono e svuotano la loro copia locale.
// =====================================================================

import {
  collection, doc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { firmaUtente } from './utenti.js';

const PER_GRUPPO = 400;

/**
 * @param {(testo: string, fatti?: number, totale?: number) => void} avanzamento
 * @returns {Promise<number>} documenti cancellati
 */
export async function cancellaTuttiIDati(avanzamento) {
  if (!navigator.onLine) throw new Error('Serve la connessione a Internet.');
  const firma = firmaUtente();
  const rifAzzeramento = doc(db, 'sistema', 'azzeramento');

  avanzamento?.('Preparazione…');
  await setDoc(rifAzzeramento, {
    stato: 'in corso', utente: firma, iniziatoIl: serverTimestamp(), completatoIl: null,
  });

  // Elenco di tutto ciò che va cancellato (letto dal server, non dalla copia locale).
  const daCancellare = [];
  const elenco = (snap) => snap.docs.forEach((d) => daCancellare.push(d.ref));

  const snapProdotti = await getDocs(collection(db, 'prodotti'));
  let letti = 0;
  for (const p of snapProdotti.docs) {
    elenco(await getDocs(collection(p.ref, 'storicoPrezzi')));
    elenco(await getDocs(collection(p.ref, 'modifiche')));
    if (p.data().haFoto) daCancellare.push(doc(db, 'foto', p.id));
    avanzamento?.(`Raccolta dei dati: prodotto ${++letti} di ${snapProdotti.size}`);
  }
  elenco(await getDocs(collection(db, 'movimenti')));
  elenco(await getDocs(collection(db, 'codici')));
  elenco(snapProdotti); // i prodotti per ultimi

  // Cancellazione a gruppi.
  let fatti = 0;
  for (let i = 0; i < daCancellare.length; i += PER_GRUPPO) {
    const batch = writeBatch(db);
    daCancellare.slice(i, i + PER_GRUPPO).forEach((r) => batch.delete(r));
    await batch.commit();
    fatti = Math.min(i + PER_GRUPPO, daCancellare.length);
    avanzamento?.('Cancellazione…', fatti, daCancellare.length);
  }

  await updateDoc(rifAzzeramento, { stato: 'completato', completatoIl: serverTimestamp() });
  localStorage.removeItem('bottega.ultimoBackup');
  // Questo dispositivo (come gli altri) svuota la copia locale appena il
  // server conferma l'azzeramento: lo fa prodotti.js.
  return daCancellare.length;
}
