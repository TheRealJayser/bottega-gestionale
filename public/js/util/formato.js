// =====================================================================
//  Formattazione di date e prezzi in italiano.
//  Le date sono sempre mostrate con l'ora italiana (Europe/Rome).
// =====================================================================

const FUSO = 'Europe/Rome';

const fmtData = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO,
});
const fmtOra = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit', minute: '2-digit', timeZone: FUSO,
});
const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** "20/11/2026" */
export function data(ms) {
  return ms == null ? '—' : fmtData.format(new Date(ms));
}

/** "10:32" */
export function ora(ms) {
  return ms == null ? '—' : fmtOra.format(new Date(ms));
}

/** "20/11/2026 alle 10:32" */
export function dataOra(ms) {
  return ms == null ? '—' : `${data(ms)} alle ${ora(ms)}`;
}

/** "Inserito da Viviana il 20/11/2026 alle 10:32" */
export function firma(verbo, utente, ms) {
  const chi = utente?.nome ?? 'sconosciuto';
  return `${verbo} da ${chi} il ${dataOra(ms)}`;
}

/** Centesimi → "3,50 €". */
export function euro(centesimi) {
  return centesimi == null ? '—' : fmtEuro.format(centesimi / 100);
}

/** Centesimi → "3,50" (per i campi di inserimento e i CSV). */
export function euroSemplice(centesimi) {
  if (centesimi == null) return '';
  return (centesimi / 100).toFixed(2).replace('.', ',');
}

/**
 * Legge un prezzo scritto da una persona e lo restituisce in centesimi.
 * Accetta "3,50", "3.50", "€ 3,5", "1.234,50".
 * Restituisce null se il testo è vuoto, NaN se non è un prezzo valido.
 */
export function leggiEuro(testo) {
  let s = String(testo ?? '').trim().replace(/[€\s]/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

/** Data per i nomi dei file: "2026-11-20". */
export function dataPerFile(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
