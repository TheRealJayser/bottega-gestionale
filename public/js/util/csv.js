// =====================================================================
//  Lettura e scrittura di file CSV compatibili con Excel italiano
//  (separatore punto e virgola, UTF-8 con BOM).
// =====================================================================

/** Converte una tabella (array di array) in testo CSV. */
export function creaCsv(righe, separatore = ';') {
  const cella = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + righe.map((r) => r.map(cella).join(separatore)).join('\r\n');
}

/**
 * Legge un testo CSV e restituisce un array di righe (array di stringhe).
 * Riconosce da solo il separatore (; , o tabulazione) dalla prima riga.
 */
export function leggiCsv(testo) {
  testo = testo.replace(/^﻿/, '');
  const primaRiga = testo.split(/\r?\n/, 1)[0] ?? '';
  const conta = (c) => primaRiga.split(c).length - 1;
  const separatore = [';', '\t', ','].sort((a, b) => conta(b) - conta(a))[0];

  const righe = [];
  let riga = [];
  let campo = '';
  let traVirgolette = false;

  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (traVirgolette) {
      if (c === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i++; } else { traVirgolette = false; }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      traVirgolette = true;
    } else if (c === separatore) {
      riga.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      righe.push(riga); riga = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  return righe.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Fa scaricare un file al browser. */
export function scaricaFile(contenuto, nomeFile, tipo) {
  const blob = contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
