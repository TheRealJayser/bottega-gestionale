// =====================================================================
//  LETTURA DEI CODICI A BARRE CON LA FOTOCAMERA
//
//  - Chrome su Android ha un lettore integrato (BarcodeDetector).
//  - Safari su iPhone (e quindi ogni browser su iPhone) non ce l'ha:
//    in quel caso carichiamo la libreria ZXing (WebAssembly), che offre
//    la stessa interfaccia. Viene scaricata solo la prima volta.
//  - La fotocamera funziona solo su HTTPS (Firebase Hosting lo è).
// =====================================================================

import { pulisciCodice } from '../util/codici.js';

const URL_LIBRERIA = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.4/dist/iife/ponyfill.js';
const FORMATI = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
const INTERVALLO_MS = 120;

let promessaRilevatore = null;

function caricaScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous'; // così il service worker può salvarlo per l'uso offline
    s.onload = ok;
    s.onerror = () => ko(new Error('Impossibile scaricare il lettore di codici. Controlla la connessione.'));
    document.head.append(s);
  });
}

/** Crea (una sola volta) il rilevatore più adatto al browser. */
export function preparaRilevatore() {
  promessaRilevatore ??= (async () => {
    if ('BarcodeDetector' in window) {
      try {
        const supportati = await window.BarcodeDetector.getSupportedFormats();
        if (supportati.includes('ean_13')) {
          return new window.BarcodeDetector({ formats: FORMATI.filter((f) => supportati.includes(f)) });
        }
      } catch { /* si passa alla libreria */ }
    }
    await caricaScript(URL_LIBRERIA);
    return new window.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMATI });
  })().catch((err) => {
    promessaRilevatore = null; // si potrà riprovare
    throw err;
  });
  return promessaRilevatore;
}

/** Traduce gli errori della fotocamera in frasi comprensibili. */
function messaggioFotocamera(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permesso per la fotocamera negato. Consentilo nelle impostazioni del browser (icona del lucchetto accanto all\'indirizzo) e riprova.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nessuna fotocamera trovata su questo dispositivo.';
    case 'NotReadableError':
      return 'La fotocamera è usata da un\'altra app. Chiudila e riprova.';
    default:
      return err?.message ?? 'Fotocamera non disponibile.';
  }
}

/**
 * Lettore collegato a un elemento <video>.
 * onCodice(codice, formato) viene chiamata a ogni codice visto
 * (anche più volte di fila: chi la usa decide come filtrare).
 */
export class LettoreFotocamera {
  constructor(video, onCodice) {
    this.video = video;
    this.onCodice = onCodice;
    this.flusso = null;
    this.attivo = false;
    this.timer = null;
    this.torciaAccesa = false;
    video.setAttribute('playsinline', ''); // necessario su iPhone
    video.muted = true;
  }

  async avvia() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('La fotocamera richiede una connessione sicura (https).');
    }
    const rilevatore = await preparaRilevatore();
    try {
      this.flusso = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (err) {
      throw new Error(messaggioFotocamera(err));
    }
    this.video.srcObject = this.flusso;
    await this.video.play().catch(() => {});
    this.attivo = true;

    const ciclo = async () => {
      if (!this.attivo) return;
      if (this.video.readyState >= 2) {
        try {
          const trovati = await rilevatore.detect(this.video);
          if (this.attivo && trovati.length) {
            const { rawValue, format } = trovati[0];
            this.onCodice(pulisciCodice(rawValue), format);
          }
        } catch { /* fotogramma non leggibile: si va avanti */ }
      }
      this.timer = setTimeout(ciclo, INTERVALLO_MS);
    };
    ciclo();
  }

  /** La fotocamera ha la torcia? */
  haTorcia() {
    const traccia = this.flusso?.getVideoTracks()[0];
    return !!traccia?.getCapabilities?.().torch;
  }

  async alternaTorcia() {
    const traccia = this.flusso?.getVideoTracks()[0];
    if (!traccia) return false;
    this.torciaAccesa = !this.torciaAccesa;
    await traccia.applyConstraints({ advanced: [{ torch: this.torciaAccesa }] }).catch(() => {
      this.torciaAccesa = false;
    });
    return this.torciaAccesa;
  }

  ferma() {
    this.attivo = false;
    clearTimeout(this.timer);
    this.flusso?.getTracks().forEach((t) => t.stop());
    this.flusso = null;
    this.video.srcObject = null;
  }
}
