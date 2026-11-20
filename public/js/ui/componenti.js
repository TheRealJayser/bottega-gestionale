// =====================================================================
//  Pezzi d'interfaccia usati da più schermate.
// =====================================================================

import { h, apriFinestra, campo, erroreCampo, avviso } from './dom.js';
import { icona } from './icone.js';
import { dataOra, euro } from '../util/formato.js';
import { formattaDelta, formattaQuantita, infoUnita, leggiQuantita, perCampo, UNITA } from '../util/unita.js';
import { TIPI } from '../servizi/movimenti.js';
import { comprimiFoto } from '../util/immagini.js';

/** Una riga dello storico movimenti. */
export function rigaMovimento(m, { mostraProdotto = false } = {}) {
  return h('li', { class: `movimento movimento-${m.tipo}` },
    h('span', { class: 'movimento-delta' }, formattaDelta(m.delta, m.unita)),
    h('span', { class: 'movimento-testo' },
      h('strong', {}, mostraProdotto
        ? h('a', { href: `#/prodotto/${m.idProdotto}` }, m.nomeProdotto)
        : TIPI[m.tipo]),
      h('small', {},
        mostraProdotto ? `${TIPI[m.tipo]} · ` : '',
        `${m.utente?.nome ?? '?'} · ${dataOra(m.data)}`,
        m.nota ? ` · ${m.nota}` : ''),
    ),
  );
}

const NOMI_CAMPI = {
  nome: 'Nome',
  ean: 'Codice a barre',
  categoria: 'Categoria',
  prezzoVendita: 'Prezzo di vendita',
  prezzoAcquisto: 'Prezzo di acquisto',
  unita: 'Unità di misura',
  sogliaMinima: 'Scorta minima',
  passo: 'Passo pulsanti +/−',
  fornitore: 'Fornitore',
  note: 'Note',
  foto: 'Foto',
};

/** Rende leggibile il valore di un campo nello storico modifiche. */
export function valoreLeggibile(campoNome, valore, unita) {
  if (valore == null || valore === '') return '(vuoto)';
  switch (campoNome) {
    case 'prezzoVendita':
    case 'prezzoAcquisto': return euro(valore);
    case 'sogliaMinima':
    case 'passo': return formattaQuantita(valore, unita);
    case 'unita': return UNITA[valore]?.etichetta ?? valore;
    default: return String(valore);
  }
}

const AZIONI = {
  inserimento: 'Inserito',
  modifica: 'Modificato',
  foto: 'Foto',
  archiviazione: 'Archiviato',
  ripristino: 'Ripristinato',
};

/** Una voce del registro modifiche. */
export function rigaModifica(m, unita) {
  return h('li', { class: 'modifica' },
    h('strong', {}, `${AZIONI[m.azione] ?? m.azione} da ${m.utente?.nome ?? '?'}`),
    h('small', {}, ` il ${dataOra(m.data)}`),
    m.campi?.length > 0 && h('ul', {},
      m.campi.map((c) => h('li', {},
        `${NOMI_CAMPI[c.campo] ?? c.campo}: `,
        h('span', { class: 'vecchio' }, valoreLeggibile(c.campo, c.vecchio, unita)),
        ' → ',
        h('span', { class: 'nuovo' }, valoreLeggibile(c.campo, c.nuovo, unita)),
      )),
    ),
  );
}

/** Una voce dello storico prezzi. */
export function rigaPrezzo(v) {
  return h('li', { class: 'prezzo-storico' },
    h('span', {}, v.tipo === 'vendita' ? 'Vendita' : 'Acquisto'),
    h('span', {}, h('span', { class: 'vecchio' }, euro(v.vecchio)), ' → ', h('strong', {}, euro(v.nuovo))),
    h('small', {}, `${v.utente?.nome ?? '?'} · ${dataOra(v.data)}`),
  );
}

/**
 * Finestra per carico / scarico / rettifica con quantità a scelta.
 * @returns {Promise<{tipo, quantita, nota} | null>} quantita in unità minima
 *   (per la rettifica è la NUOVA quantità totale)
 */
export async function chiediMovimento(prodotto, tipoIniziale = 'carico') {
  const u = infoUnita(prodotto.unita);
  let tipo = tipoIniziale;

  const etichettaQuantita = h('label', {});
  const quantita = h('input', {
    type: 'text',
    inputmode: u.decimali ? 'decimal' : 'numeric',
    autocomplete: 'off',
    class: 'campo-grande',
  });
  const nota = h('input', { type: 'text', maxlength: 500, placeholder: 'Facoltativa' });
  const campoQuantita = h('div', { class: 'campo' },
    etichettaQuantita,
    h('div', { class: 'con-unita' }, quantita, h('span', {}, u.simbolo)),
    h('small', { class: 'aiuto' }, `Attuale: ${formattaQuantita(prodotto.quantita, prodotto.unita)}`),
    h('small', { class: 'errore-campo' }),
  );

  const schede = h('div', { class: 'schede-tipo', role: 'tablist' });
  const aggiornaTipo = () => {
    schede.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tipo === tipo)));
    etichettaQuantita.textContent = tipo === 'rettifica'
      ? 'Quantità contata (nuovo totale)'
      : `Quantità da ${tipo === 'carico' ? 'aggiungere' : 'togliere'}`;
    if (tipo === 'rettifica' && !quantita.value) quantita.value = perCampo(prodotto.quantita, prodotto.unita);
    quantita.focus();
  };
  for (const t of ['carico', 'scarico', 'rettifica']) {
    schede.append(h('button', {
      type: 'button', role: 'tab', dataset: { tipo: t },
      onclick: () => { tipo = t; aggiornaTipo(); },
    }, TIPI[t]));
  }

  let valore = null;
  const promessa = apriFinestra({
    titolo: prodotto.nome,
    corpo: [schede, campoQuantita, campo('Nota', nota)],
    pulsanti: [
      { testo: 'Annulla', valore: null, classe: 'secondario' },
      {
        testo: 'Registra', valore: 'ok', classe: 'primario',
        prima: () => {
          valore = leggiQuantita(quantita.value, prodotto.unita);
          if (valore == null || Number.isNaN(valore)) {
            erroreCampo(quantita, u.decimali ? 'Scrivi un numero, es. 0,250' : 'Scrivi un numero intero');
            return false;
          }
          if (tipo !== 'rettifica' && valore <= 0) {
            erroreCampo(quantita, 'La quantità deve essere maggiore di zero');
            return false;
          }
          if (tipo === 'rettifica' && valore === prodotto.quantita) {
            erroreCampo(quantita, 'È uguale alla quantità attuale: non c\'è niente da rettificare');
            return false;
          }
          return true;
        },
      },
    ],
  });
  aggiornaTipo(); // la finestra è già aperta: impostiamo la scheda iniziale
  const risultato = await promessa;
  if (risultato !== 'ok') return null;
  return { tipo, quantita: valore, nota: nota.value };
}

/**
 * Pulsanti "Scatta foto" / "Scegli file". Chiama onFoto(fotoCompressa).
 */
export function selettoreFoto(onFoto, { testoScatta = 'Scatta foto' } = {}) {
  const gestisci = async (input) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const foto = await comprimiFoto(file);
      onFoto(foto);
    } catch (err) {
      avviso(err.message, 'errore');
    }
  };
  const scatta = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: (e) => gestisci(e.target) });
  const scegli = h('input', { type: 'file', accept: 'image/*', hidden: true,
    onchange: (e) => gestisci(e.target) });
  return h('div', { class: 'pulsanti-foto' },
    scatta, scegli,
    h('button', { type: 'button', class: 'pulsante secondario', onclick: () => scatta.click() },
      icona('foto'), testoScatta),
    h('button', { type: 'button', class: 'pulsante secondario', onclick: () => scegli.click() },
      icona('immagine'), 'Scegli file'),
  );
}
