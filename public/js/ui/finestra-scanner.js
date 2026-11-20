// =====================================================================
//  Finestra che legge UN codice con la fotocamera e lo restituisce
//  (usata nel modulo prodotto per compilare il codice a barre).
// =====================================================================

import { h, apriFinestra, bip } from './dom.js';
import { LettoreFotocamera } from './scanner.js';

/** @returns {Promise<string|null>} il codice letto, o null se annullato */
export async function scansionaUnCodice() {
  const video = h('video', { class: 'video-scanner', autoplay: true, muted: true, playsinline: true });
  const messaggio = h('p', { class: 'nota' }, 'Avvio della fotocamera…');
  let lettore;
  let codiceLetto = null;
  let chiudiFinestra;

  const promessa = apriFinestra({
    titolo: 'Inquadra il codice a barre',
    corpo: [h('div', { class: 'scanner-cornice' }, video, h('div', { class: 'mirino' })), messaggio],
    pulsanti: [{ testo: 'Annulla', valore: null, classe: 'secondario' }],
  });
  // Riferimento al pulsante "Annulla" per chiudere da codice quando leggiamo.
  const dialogo = document.querySelector('dialog.finestra:last-of-type');
  chiudiFinestra = () => dialogo?.querySelector('.finestra-piede button')?.click();

  lettore = new LettoreFotocamera(video, (codice) => {
    if (codiceLetto) return;
    codiceLetto = codice;
    bip(true);
    chiudiFinestra();
  });
  lettore.avvia()
    .then(() => { messaggio.textContent = 'Tieni il codice dentro il riquadro.'; })
    .catch((err) => { messaggio.textContent = err.message; messaggio.classList.add('errore'); });

  await promessa;
  lettore.ferma();
  return codiceLetto;
}
