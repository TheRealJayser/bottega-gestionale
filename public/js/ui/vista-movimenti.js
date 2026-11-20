// =====================================================================
//  STORICO MOVIMENTI con filtri per prodotto, persona e periodo.
// =====================================================================

import { h, riempi, avviso } from './dom.js';
import { rigaMovimento } from './componenti.js';
import * as prodotti from '../servizi/prodotti.js';
import { cercaMovimenti, TIPI } from '../servizi/movimenti.js';
import { elencoUtenti } from '../servizi/utenti.js';
import { creaCsv, scaricaFile } from '../util/csv.js';
import { data, dataPerFile, ora } from '../util/formato.js';
import { formattaQuantita } from '../util/unita.js';

/** "2026-11-20" (ora italiana) → Date a mezzanotte locale. */
const giorno = (testo) => (testo ? new Date(`${testo}T00:00:00`) : null);
const piuUnGiorno = (d) => (d ? new Date(d.getTime() + 86_400_000) : null);
const inTestoData = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function mostraMovimenti(contenitore, { parametri }) {
  const selProdotto = h('select', { 'aria-label': 'Prodotto' });
  const selPersona = h('select', { 'aria-label': 'Persona' }, h('option', { value: '' }, 'Tutte le persone'));
  const da = h('input', { type: 'date', 'aria-label': 'Dal giorno' });
  const a = h('input', { type: 'date', 'aria-label': 'Al giorno' });
  const elenco = h('ul', { class: 'elenco-storico grande' });
  const piede = h('div', { class: 'piede-elenco' });
  const riepilogo = h('p', { class: 'conteggio' });

  let righe = [];
  let cursore = null;
  let finito = true;
  let ricercaInCorso = 0;

  // Prodotti in ordine alfabetico (anche gli archiviati: hanno uno storico).
  const opzioniProdotti = () => {
    const lista = prodotti.tutti({ archiviati: true }).sort((x, y) => x.nome.localeCompare(y.nome, 'it'));
    riempi(selProdotto,
      h('option', { value: '' }, 'Tutti i prodotti'),
      lista.map((p) => h('option', { value: p.id, selected: p.id === parametri.get('prodotto') }, p.nome + (p.archiviato ? ' (archiviato)' : ''))),
    );
  };
  opzioniProdotti();

  elencoUtenti()
    .then((utenti) => utenti.forEach((u) => selPersona.append(h('option', { value: u.uid }, u.nome))))
    .catch(() => {});

  const scorciatoia = (testo, giorni) => h('button', {
    type: 'button', class: 'pulsante secondario piccolo',
    onclick: () => {
      const oggi = new Date();
      a.value = inTestoData(oggi);
      da.value = inTestoData(new Date(oggi.getTime() - (giorni - 1) * 86_400_000));
      cerca();
    },
  }, testo);

  async function cerca(altri = false) {
    const numero = ++ricercaInCorso;
    if (!altri) { righe = []; cursore = null; riempi(elenco); }
    riempi(piede, h('div', { class: 'rotella piccola' }));
    try {
      const risultato = await cercaMovimenti({
        idProdotto: selProdotto.value || undefined,
        uid: selPersona.value || undefined,
        da: giorno(da.value),
        a: piuUnGiorno(giorno(a.value)),
        cursore: altri ? cursore : null,
      });
      if (numero !== ricercaInCorso) return; // è partita una ricerca più nuova
      righe.push(...risultato.righe);
      cursore = risultato.cursore;
      finito = risultato.finito;
      risultato.righe.forEach((m) => elenco.append(rigaMovimento(m, { mostraProdotto: true })));
      riepilogo.textContent = righe.length
        ? `${righe.length} movimenti${finito ? '' : ' (ce ne sono altri)'}`
        : '';
      riempi(piede,
        !righe.length && h('p', { class: 'nota' }, 'Nessun movimento con questi filtri.'),
        !finito && h('button', { class: 'pulsante secondario', onclick: () => cerca(true) }, 'Carica altri'),
      );
    } catch (err) {
      console.error(err);
      if (numero !== ricercaInCorso) return;
      riempi(piede, h('p', { class: 'nota errore' },
        err?.code === 'failed-precondition'
          ? 'Il database sta preparando gli indici per questo filtro: riprova tra qualche minuto.'
          : 'Storico non disponibile (serve la connessione).'));
    }
  }

  function esporta() {
    if (!righe.length) { avviso('Nessun movimento da esportare', 'info'); return; }
    const tabella = [['Data', 'Ora', 'Prodotto', 'Tipo', 'Quantità', 'Unità', 'Persona', 'Nota']];
    righe.forEach((m) => tabella.push([
      data(m.data), ora(m.data), m.nomeProdotto, TIPI[m.tipo],
      formattaQuantita(m.delta, m.unita, false), m.unita, m.utente?.nome ?? '', m.nota ?? '',
    ]));
    scaricaFile(creaCsv(tabella), `movimenti-${dataPerFile()}.csv`, 'text/csv;charset=utf-8');
  }

  [selProdotto, selPersona, da, a].forEach((c) => c.addEventListener('change', () => cerca()));

  riempi(contenitore,
    h('section', { class: 'vista vista-movimenti' },
      h('header', { class: 'scheda-testa' }, h('h1', {}, 'Storico movimenti')),
      h('div', { class: 'riquadro filtri-storico' },
        selProdotto,
        selPersona,
        h('div', { class: 'periodo' },
          h('label', {}, 'Dal ', da),
          h('label', {}, 'al ', a),
        ),
        h('div', { class: 'scorciatoie' },
          scorciatoia('Oggi', 1), scorciatoia('7 giorni', 7), scorciatoia('30 giorni', 30),
          h('button', { type: 'button', class: 'pulsante-link', onclick: () => { da.value = ''; a.value = ''; cerca(); } }, 'Tutto il periodo'),
        ),
      ),
      h('div', { class: 'riga-azioni' }, riepilogo,
        h('button', { class: 'pulsante secondario piccolo', onclick: esporta }, 'Esporta CSV')),
      elenco,
      piede,
    ),
  );

  cerca();
}
