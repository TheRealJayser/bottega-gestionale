// =====================================================================
//  SCANSIONE
//  - "Apri scheda": legge un codice e apre il prodotto (o il modulo di
//    inserimento se il codice non esiste).
//  - "Scansione continua": registra carichi o scarichi uno dopo l'altro
//    senza cambiare schermata. Funziona con la fotocamera e con il
//    lettore USB/Bluetooth (campo "Codice").
// =====================================================================

import { h, riempi, avviso, bip, dispositivoTouch } from './dom.js';
import { icona } from './icone.js';
import { LettoreFotocamera } from './scanner.js';
import { impostaGestoreCodici } from './lettore-tastiera.js';
import * as prodotti from '../servizi/prodotti.js';
import { registraMovimento } from '../servizi/movimenti.js';
import { formattaDelta, formattaQuantita } from '../util/unita.js';
import { pulisciCodice } from '../util/codici.js';
import { ora } from '../util/formato.js';

const CHIAVE_IMPOSTAZIONI = 'bottega.scansione';
/** Lo stesso codice viene ricontato solo dopo che è sparito dall'inquadratura per questo tempo. */
const PAUSA_STESSO_CODICE_MS = 1200;

export function mostraScansione(contenitore, { naviga, ripristinaGestore }) {
  const impostazioni = {
    modo: 'scheda', tipo: 'scarico', moltiplicatore: 1,
    ...JSON.parse(sessionStorage.getItem(CHIAVE_IMPOSTAZIONI) ?? '{}'),
  };
  const salvaImpostazioni = () => sessionStorage.setItem(CHIAVE_IMPOSTAZIONI, JSON.stringify(impostazioni));

  const video = h('video', { class: 'video-scanner', autoplay: true, muted: true, playsinline: true });
  const lampo = h('div', { class: 'lampo' });
  const messaggio = h('p', { class: 'nota stato-camera' });
  const pulsanteCamera = h('button', { class: 'pulsante primario', onclick: () => avviaCamera() }, icona('foto'), 'Avvia fotocamera');
  const pulsanteTorcia = h('button', { class: 'pulsante-icona torcia', hidden: true, 'aria-label': 'Torcia', onclick: async () => {
    const accesa = await lettore.alternaTorcia();
    pulsanteTorcia.classList.toggle('attivo', accesa);
  } }, icona('torcia'));
  const registro = h('ol', { class: 'registro-scansioni' });
  const campoCodice = h('input', {
    type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Codice (lettore USB o a mano)',
    enterkeyhint: 'go',
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const c = pulisciCodice(campoCodice.value);
        campoCodice.value = '';
        if (c) gestisciCodice(c);
      }
    },
  });

  // ---------- Pannello impostazioni ----------
  const pannelloContinua = h('div', { class: 'pannello-continua' });
  const schedeModo = h('div', { class: 'schede-tipo', role: 'tablist' });
  for (const [modo, testo] of [['scheda', 'Apri scheda'], ['continua', 'Scansione continua']]) {
    schedeModo.append(h('button', { type: 'button', role: 'tab', dataset: { modo }, onclick: () => {
      impostazioni.modo = modo; salvaImpostazioni(); disegnaImpostazioni();
    } }, testo));
  }
  const schedeTipo = h('div', { class: 'schede-tipo piccole' });
  for (const [tipo, testo] of [['scarico', '− Scarico'], ['carico', '+ Carico']]) {
    schedeTipo.append(h('button', { type: 'button', dataset: { tipo }, onclick: () => {
      impostazioni.tipo = tipo; salvaImpostazioni(); disegnaImpostazioni();
    } }, testo));
  }
  const selMolt = h('select', { 'aria-label': 'Quantità per scansione', onchange: () => {
    impostazioni.moltiplicatore = Number(selMolt.value); salvaImpostazioni();
  } }, [1, 2, 3, 4, 5, 6, 10, 12, 24].map((n) => h('option', { value: n, selected: n === impostazioni.moltiplicatore }, `× ${n}`)));

  riempi(pannelloContinua,
    schedeTipo,
    h('label', { class: 'riga-molt' }, 'Ogni scansione vale ', selMolt, ' il passo del prodotto'),
    h('small', { class: 'aiuto' }, 'Per i pezzi il passo di solito è 1; per i prodotti a peso è quello impostato nella scheda.'),
  );

  function disegnaImpostazioni() {
    schedeModo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === impostazioni.modo)));
    schedeTipo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tipo === impostazioni.tipo)));
    pannelloContinua.hidden = impostazioni.modo !== 'continua';
    registro.hidden = impostazioni.modo !== 'continua';
  }

  riempi(contenitore,
    h('section', { class: 'vista vista-scansione' },
      h('header', { class: 'scheda-testa' }, h('h1', {}, 'Scansiona')),
      schedeModo,
      h('div', { class: 'scanner-cornice' }, video, h('div', { class: 'mirino' }), lampo, pulsanteTorcia,
        h('div', { class: 'scanner-avvio' }, pulsanteCamera)),
      messaggio,
      h('div', { class: 'campo campo-codice' }, h('label', {}, icona('tastiera'), ' Codice'), campoCodice),
      pannelloContinua,
      registro,
    ),
  );
  disegnaImpostazioni();

  // ---------- Fotocamera ----------
  let ultimoCodice = null;
  let ultimaVista = 0;

  const lettore = new LettoreFotocamera(video, (codice) => {
    const adesso = performance.now();
    const giaVisto = codice === ultimoCodice && adesso - ultimaVista < PAUSA_STESSO_CODICE_MS;
    ultimoCodice = codice;
    ultimaVista = adesso;
    if (!giaVisto) gestisciCodice(codice);
  });

  async function avviaCamera() {
    pulsanteCamera.disabled = true;
    messaggio.textContent = 'Avvio della fotocamera…';
    messaggio.classList.remove('errore');
    try {
      await lettore.avvia();
      pulsanteCamera.closest('.scanner-avvio').hidden = true;
      pulsanteTorcia.hidden = !lettore.haTorcia();
      messaggio.textContent = 'Inquadra il codice a barre.';
    } catch (err) {
      messaggio.textContent = err.message;
      messaggio.classList.add('errore');
      pulsanteCamera.disabled = false;
    }
  }

  function segnale(ok) {
    bip(ok);
    lampo.className = `lampo ${ok ? 'ok' : 'ko'}`;
    setTimeout(() => { lampo.className = 'lampo'; }, 350);
  }

  // ---------- Cosa fare con un codice ----------
  function gestisciCodice(codice) {
    const p = prodotti.perCodiceABarre(codice);

    if (impostazioni.modo === 'scheda') {
      segnale(!!p);
      lettore.ferma();
      if (p) naviga(`#/prodotto/${p.id}`);
      else naviga(`#/nuovo?ean=${encodeURIComponent(codice)}`);
      return;
    }

    // Scansione continua
    if (!p) {
      segnale(false);
      aggiungiAlRegistro(h('li', { class: 'scansione sconosciuta' },
        h('span', {}, `${ora(Date.now())} · Codice ${codice} non trovato`),
        h('a', { href: `#/nuovo?ean=${encodeURIComponent(codice)}`, class: 'pulsante secondario piccolo' }, 'Inserisci'),
      ));
      return;
    }
    if (p.archiviato) {
      segnale(false);
      aggiungiAlRegistro(h('li', { class: 'scansione sconosciuta' },
        h('span', {}, `${p.nome}: prodotto archiviato`),
        h('a', { href: `#/prodotto/${p.id}`, class: 'pulsante secondario piccolo' }, 'Apri')));
      return;
    }

    const delta = (impostazioni.tipo === 'carico' ? 1 : -1) * p.passo * impostazioni.moltiplicatore;
    registraMovimento(p.id, impostazioni.tipo, delta, 'Scansione continua');
    segnale(true);
    const dopo = prodotti.perId(p.id).quantita;

    const voce = h('li', { class: `scansione ${impostazioni.tipo}` },
      h('span', { class: 'movimento-delta' }, formattaDelta(delta, p.unita)),
      h('span', { class: 'scansione-testo' },
        h('a', { href: `#/prodotto/${p.id}` }, p.nome),
        h('small', {}, `${ora(Date.now())} · ora ${formattaQuantita(dopo, p.unita)}`)),
      h('button', {
        class: 'pulsante-icona', 'aria-label': 'Annulla questa scansione', title: 'Annulla',
        onclick: (e) => {
          registraMovimento(p.id, 'rettifica', -delta, 'Annullata scansione');
          e.currentTarget.closest('li').classList.add('annullata');
          e.currentTarget.remove();
          avviso('Scansione annullata', 'info');
        },
      }, icona('annulla')),
    );
    aggiungiAlRegistro(voce);
  }

  function aggiungiAlRegistro(voce) {
    registro.prepend(voce);
    while (registro.children.length > 50) registro.lastChild.remove();
  }

  // Il lettore USB, anche fuori dal campo, finisce qui.
  impostaGestoreCodici(gestisciCodice);

  // Sul telefono la fotocamera parte da sola; sul computer si usa
  // di solito il lettore USB, quindi mettiamo il cursore nel campo.
  if (dispositivoTouch()) avviaCamera();
  else campoCodice.focus();

  return () => {
    lettore.ferma();
    ripristinaGestore();
  };
}
