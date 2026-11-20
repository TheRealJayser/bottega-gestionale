// =====================================================================
//  Unità di misura.
//
//  Nel database le quantità sono SEMPRE numeri interi nell'unità più
//  piccola: pezzi per "pz", grammi per "kg", millilitri per "l".
//  Così le somme sono sempre esatte (niente 0,1 + 0,2 = 0,30000000004).
//  Queste funzioni convertono tra il valore salvato e quello mostrato.
// =====================================================================

export const UNITA = {
  pz: { etichetta: 'Pezzi',       simbolo: 'pz', fattore: 1,    decimali: 0, passo: 1 },
  kg: { etichetta: 'Chilogrammi', simbolo: 'kg', fattore: 1000, decimali: 3, passo: 100 },
  l:  { etichetta: 'Litri',       simbolo: 'l',  fattore: 1000, decimali: 3, passo: 100 },
};

export function infoUnita(unita) {
  return UNITA[unita] ?? UNITA.pz;
}

/** Valore salvato → numero leggibile (1250, "kg") → 1.25 */
export function inUnita(valore, unita) {
  return valore / infoUnita(unita).fattore;
}

/** 1250, "kg" → "1,25 kg" ; 3, "pz" → "3 pz" */
export function formattaQuantita(valore, unita, conSimbolo = true) {
  const u = infoUnita(unita);
  const numero = (valore / u.fattore).toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: u.decimali,
  });
  return conSimbolo ? `${numero} ${u.simbolo}` : numero;
}

/** Con segno, per i movimenti: "+1,25 kg", "−3 pz". */
export function formattaDelta(delta, unita) {
  const segno = delta > 0 ? '+' : '−';
  return segno + formattaQuantita(Math.abs(delta), unita);
}

/** Valore salvato → testo per un campo di inserimento: 1250, "kg" → "1,25" */
export function perCampo(valore, unita) {
  if (valore == null) return '';
  return formattaQuantita(valore, unita, false).replace(/\./g, '');
}

/**
 * Testo scritto da una persona → valore salvato.
 * "1,25" kg → 1250 ; "3" pz → 3.
 * Restituisce null se vuoto, NaN se non valido (es. "1,5" pezzi).
 */
export function leggiQuantita(testo, unita) {
  const u = infoUnita(unita);
  let s = String(testo ?? '').trim().replace(/\s/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  const numero = parseFloat(s);
  if (u.decimali === 0 && !Number.isInteger(numero)) return NaN;
  return Math.round(numero * u.fattore);
}

/** "€/kg", "€/pz", "€/l" */
export function prezzoPer(unita) {
  return `€/${infoUnita(unita).simbolo}`;
}

/** Suffisso dopo un prezzo già con "€": "/kg", "/l"; nulla per i pezzi. */
export function perUnita(unita) {
  return unita === 'pz' ? '' : `/${infoUnita(unita).simbolo}`;
}
