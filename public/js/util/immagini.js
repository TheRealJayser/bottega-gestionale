// =====================================================================
//  Ridimensionamento e compressione delle foto, tutto nel browser.
//  Obiettivo: lato lungo ~600 px, formato WebP (o JPEG dove WebP non
//  è disponibile, es. Safari su iPhone), peso sotto i 100 KB.
// =====================================================================

const LATO_MAX = 600;
const PESO_MAX = 100 * 1024;
const QUALITA = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

/** Carica un file immagine in un elemento <img> (rispetta l'orientamento EXIF). */
function caricaImmagine(file) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Il file non è un\'immagine leggibile')); };
    img.src = url;
  });
}

function esporta(canvas, formato, qualita) {
  return new Promise((ok) => canvas.toBlob(ok, formato, qualita));
}

/**
 * @param {File|Blob} file foto scattata o scelta
 * @returns {Promise<{blob: Blob, formato: string, larghezza: number, altezza: number}>}
 */
export async function comprimiFoto(file) {
  const img = await caricaImmagine(file);
  let scala = Math.min(1, LATO_MAX / Math.max(img.naturalWidth, img.naturalHeight));

  // Proviamo WebP; se il browser non lo sa creare (restituisce PNG) usiamo JPEG.
  let formato = 'image/webp';

  for (let giro = 0; giro < 4; giro++) {
    const larghezza = Math.max(1, Math.round(img.naturalWidth * scala));
    const altezza = Math.max(1, Math.round(img.naturalHeight * scala));
    const canvas = document.createElement('canvas');
    canvas.width = larghezza;
    canvas.height = altezza;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // sfondo bianco per le immagini trasparenti
    ctx.fillRect(0, 0, larghezza, altezza);
    ctx.drawImage(img, 0, 0, larghezza, altezza);

    for (const q of QUALITA) {
      let blob = await esporta(canvas, formato, q);
      if (!blob || blob.type !== formato) {
        formato = 'image/jpeg';
        blob = await esporta(canvas, formato, q);
      }
      if (blob && blob.size <= PESO_MAX) {
        return { blob, formato, larghezza, altezza };
      }
    }
    scala *= 0.8; // ancora troppo pesante: rimpiccioliamo e riproviamo
  }
  throw new Error('Non è stato possibile comprimere la foto sotto i 100 KB');
}
