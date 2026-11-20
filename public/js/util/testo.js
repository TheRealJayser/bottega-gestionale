// =====================================================================
//  Funzioni sul testo usate dalla ricerca.
// =====================================================================

/** "Pecorino Romano DOP" → "pecorino romano dop"; toglie gli accenti. */
export function normalizza(testo) {
  return String(testo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Divide una ricerca in parole: "peco rom" → ["peco", "rom"]. */
export function parole(testo) {
  return normalizza(testo).split(' ').filter(Boolean);
}
