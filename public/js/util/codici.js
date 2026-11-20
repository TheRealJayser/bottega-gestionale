// =====================================================================
//  Codici a barre: pulizia, controllo e generazione di codici interni.
// =====================================================================

/**
 * Pulisce un codice letto da fotocamera, lettore o tastiera.
 * I codici UPC-A americani (12 cifre) diventano EAN-13 aggiungendo uno
 * zero davanti: così lo stesso prodotto ha sempre lo stesso codice,
 * qualunque sia il lettore usato.
 */
export function pulisciCodice(testo) {
  let c = String(testo ?? '').trim().replace(/\s+/g, '');
  if (/^\d{12}$/.test(c)) c = '0' + c;
  return c;
}

/** Il codice si può salvare? (cifre, lettere, trattino; max 40) */
export function codiceAmmesso(codice) {
  return /^[0-9A-Za-z-]{1,40}$/.test(codice);
}

/** Sembra un codice a barre (e non un nome da cercare)? */
export function sembraCodice(testo) {
  return /^\d{6,14}$/.test(String(testo ?? '').trim());
}

/** Cifra di controllo GS1 (EAN-8, EAN-13, GTIN-14). */
export function cifraControllo(senzaUltima) {
  let somma = 0;
  const cifre = senzaUltima.split('').reverse();
  cifre.forEach((c, i) => { somma += Number(c) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (somma % 10)) % 10;
}

/** true se è un EAN-8/EAN-13/GTIN-14 con cifra di controllo corretta. */
export function eanCorretto(codice) {
  if (!/^(\d{8}|\d{13}|\d{14})$/.test(codice)) return false;
  return cifraControllo(codice.slice(0, -1)) === Number(codice.at(-1));
}

/**
 * Genera un codice EAN-13 interno (prefisso 20, riservato all'uso
 * dentro il negozio) che non sia già usato.
 * @param {(codice: string) => boolean} giaUsato
 */
export function generaCodiceInterno(giaUsato) {
  for (let tentativo = 0; tentativo < 1000; tentativo++) {
    let base = '20';
    for (let i = 0; i < 10; i++) base += Math.floor(Math.random() * 10);
    const codice = base + cifraControllo(base);
    if (!giaUsato(codice)) return codice;
  }
  throw new Error('Impossibile generare un codice libero');
}
