// =====================================================================
//  Avvio di Firebase: un unico punto da cui tutti i servizi prendono
//  l'app, l'autenticazione e il database.
// =====================================================================

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config.js';

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
auth.languageCode = 'it'; // email di recupero password in italiano

// Cache locale persistente: l'app funziona anche senza rete e le
// operazioni fatte offline partono da sole quando la rete torna.
// Il "multiple tab manager" permette di avere l'app aperta in più schede.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
