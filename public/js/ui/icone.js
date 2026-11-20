// =====================================================================
//  Icone SVG disegnate a tratto (24×24). Nessun file esterno.
// =====================================================================

const TRACCIATI = {
  cerca: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.6-4.6"/>',
  scansiona: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13.5 8v8M17 8v8"/>',
  magazzino: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  riordino: '<path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
  storico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  altro: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  piu: '<path d="M12 5v14M5 12h14"/>',
  meno: '<path d="M5 12h14"/>',
  foto: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  immagine: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  indietro: '<path d="M15 18l-6-6 6-6"/>',
  avanti: '<path d="M9 18l6-6-6-6"/>',
  modifica: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  torcia: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  chiudi: '<path d="M18 6L6 18M6 6l12 12"/>',
  avviso: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  offline: '<path d="M1 1l22 22M16.7 16.7A5 5 0 0 1 18 17H7a5 5 0 0 1-1-9.9M9 5.3A7 7 0 0 1 19 9a4 4 0 0 1 3 5.5"/>',
  sincro: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  ok: '<path d="M20 6L9 17l-5-5"/>',
  scarica: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  carica: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  archivio: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>',
  annulla: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  esci: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  utente: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  tastiera: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  condividi: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
};

/** Restituisce un elemento <svg> con l'icona richiesta. */
export function icona(nome, classe = '') {
  const span = document.createElement('span');
  span.className = `icona ${classe}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TRACCIATI[nome] ?? ''}</svg>`;
  return span;
}
