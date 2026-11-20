// =====================================================================
//  Versione dell'app e installazione come PWA.
// =====================================================================

/** Da aumentare a ogni pubblicazione (deve combaciare con sw.js). */
export const VERSIONE_APP = '1.2.0';

let promptSalvato = null;

// Chrome/Edge su Android e computer: il browser propone l'installazione.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptSalvato = e;
});
window.addEventListener('appinstalled', () => { promptSalvato = null; });

/** L'evento per installare l'app, se il browser lo offre. */
export function promptInstallazione() {
  return promptSalvato;
}

/** Registra il service worker (avvio veloce e funzionamento offline). */
export function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker non registrato', err));
  });
}
