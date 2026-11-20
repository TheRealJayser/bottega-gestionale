// =====================================================================
//  Storico dei prezzi e registro delle modifiche di un prodotto.
//  Si leggono solo quando si apre la scheda (per risparmiare letture).
// =====================================================================

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from './firebase.js';

async function leggi(idProdotto, sottoraccolta, quanti) {
  const q = query(
    collection(db, 'prodotti', idProdotto, sottoraccolta),
    orderBy('data', 'desc'),
    limit(quanti),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const dati = d.data({ serverTimestamps: 'estimate' });
    return { id: d.id, ...dati, data: dati.data?.toMillis?.() ?? null };
  });
}

/** [{ tipo: 'vendita'|'acquisto', vecchio, nuovo, utente, data }] */
export function storicoPrezzi(idProdotto, quanti = 50) {
  return leggi(idProdotto, 'storicoPrezzi', quanti);
}

/** [{ azione, campi: [{campo, vecchio, nuovo}], utente, data }] */
export function storicoModifiche(idProdotto, quanti = 50) {
  return leggi(idProdotto, 'modifiche', quanti);
}
