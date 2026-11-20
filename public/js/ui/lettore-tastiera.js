// =====================================================================
//  LETTORE DI CODICI USB / BLUETOOTH
//
//  Questi lettori si comportano come una tastiera: "scrivono" il codice
//  molto velocemente e premono Invio. Qui intercettiamo queste sequenze
//  rapide quando il cursore NON è in un campo di testo, così si può
//  scansionare da qualsiasi schermata del computer.
//  (Nei campi di testo il codice arriva normalmente, seguito da Invio.)
// =====================================================================

import { pulisciCodice } from '../util/codici.js';

const PAUSA_MAX_MS = 60;   // tra un tasto e l'altro un lettore è molto più veloce di una persona
const LUNGHEZZA_MIN = 4;

let gestore = null;
let buffer = '';
let ultimoTasto = 0;

/** Imposta chi riceve i codici letti (sostituisce il precedente). */
export function impostaGestoreCodici(fn) {
  gestore = fn;
}

function inCampoDiTesto(el) {
  return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function avviaLettoreTastiera() {
  document.addEventListener('keydown', (e) => {
    if (inCampoDiTesto(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;

    const adesso = performance.now();
    if (adesso - ultimoTasto > PAUSA_MAX_MS) buffer = '';
    ultimoTasto = adesso;

    if (e.key === 'Enter') {
      if (buffer.length >= LUNGHEZZA_MIN && gestore) {
        e.preventDefault();
        gestore(pulisciCodice(buffer));
      }
      buffer = '';
    } else if (e.key.length === 1) {
      buffer += e.key;
    }
  });
}
