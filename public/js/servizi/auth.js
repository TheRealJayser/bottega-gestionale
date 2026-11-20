// =====================================================================
//  Accesso e uscita (Firebase Authentication, email e password).
// =====================================================================

import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase.js';

/** Chiama `cb(utenteFirebase | null)` a ogni accesso/uscita. */
export function osservaAccesso(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function accedi(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    throw new Error(messaggioErrore(err));
  }
}

export function esci() {
  return signOut(auth);
}

export async function inviaRecuperoPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw new Error(messaggioErrore(err));
  }
}

/** Traduce gli errori di Firebase in frasi comprensibili. */
function messaggioErrore(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email o password non corretti.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'L\'indirizzo email non è valido.';
    case 'auth/missing-password':
      return 'Scrivi la password.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    case 'auth/network-request-failed':
      return 'Nessuna connessione a Internet.';
    case 'auth/user-disabled':
      return 'Questo account è stato disattivato.';
    default:
      return 'Errore di accesso: ' + (err?.message ?? 'sconosciuto');
  }
}
