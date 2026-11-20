// =====================================================================
//  DA RIORDINARE: prodotti sotto la scorta minima, divisi per fornitore.
// =====================================================================

import { h, riempi, avviso } from './dom.js';
import { icona } from './icone.js';
import * as prodotti from '../servizi/prodotti.js';
import { creaCsv, scaricaFile } from '../util/csv.js';
import { dataPerFile } from '../util/formato.js';
import { formattaQuantita } from '../util/unita.js';

export function mostraRiordino(contenitore) {
  const corpo = h('div', {});

  function testoElenco(gruppi) {
    return gruppi.map(([fornitore, lista]) =>
      `${fornitore}\n` + lista.map((p) =>
        `- ${p.nome}: ${formattaQuantita(p.quantita, p.unita)} (minimo ${formattaQuantita(p.sogliaMinima, p.unita)})`).join('\n'),
    ).join('\n\n');
  }

  function disegna() {
    const lista = prodotti.daRiordinare()
      .sort((a, b) => (a.quantita / a.sogliaMinima) - (b.quantita / b.sogliaMinima));

    if (!lista.length) {
      riempi(corpo, h('div', { class: 'vuoto' },
        icona('ok', 'grande'),
        h('p', {}, 'Niente da riordinare.'),
        h('p', { class: 'nota' }, 'Qui compaiono i prodotti con una scorta minima impostata e quantità uguale o inferiore.'),
      ));
      return;
    }

    const gruppi = new Map();
    lista.forEach((p) => {
      const f = p.fornitore || 'Senza fornitore';
      if (!gruppi.has(f)) gruppi.set(f, []);
      gruppi.get(f).push(p);
    });
    const ordinati = [...gruppi.entries()].sort(([a], [b]) => a.localeCompare(b, 'it'));

    riempi(corpo,
      h('div', { class: 'riga-azioni' },
        h('p', { class: 'conteggio' }, `${lista.length} prodotti da riordinare`),
        h('div', {},
          h('button', { class: 'pulsante secondario piccolo', onclick: async () => {
            const testo = `Da riordinare (${new Date().toLocaleDateString('it-IT')})\n\n${testoElenco(ordinati)}`;
            if (navigator.share) {
              navigator.share({ title: 'Da riordinare', text: testo }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(testo);
              avviso('Elenco copiato: puoi incollarlo in un messaggio', 'ok');
            }
          } }, icona('condividi'), 'Condividi'),
          h('button', { class: 'pulsante secondario piccolo', onclick: () => {
            const righe = [['Fornitore', 'Prodotto', 'Codice', 'Quantità', 'Scorta minima', 'Unità']];
            ordinati.forEach(([f, l]) => l.forEach((p) => righe.push([
              f, p.nome, p.ean ?? '', formattaQuantita(p.quantita, p.unita, false),
              formattaQuantita(p.sogliaMinima, p.unita, false), p.unita,
            ])));
            scaricaFile(creaCsv(righe), `da-riordinare-${dataPerFile()}.csv`, 'text/csv;charset=utf-8');
          } }, icona('scarica'), 'CSV'),
        ),
      ),
      ordinati.map(([fornitore, l]) => h('div', { class: 'riquadro gruppo-riordino' },
        h('h2', {}, fornitore),
        h('ul', { class: 'elenco-riordino' }, l.map((p) => h('li', {},
          h('a', { href: `#/prodotto/${p.id}` }, p.nome),
          h('span', { class: `riga-quantita bassa ${p.quantita < 0 ? 'negativa' : ''}` },
            formattaQuantita(p.quantita, p.unita),
            h('small', {}, ` / min ${formattaQuantita(p.sogliaMinima, p.unita)}`)),
        ))),
      )),
    );
  }

  riempi(contenitore,
    h('section', { class: 'vista vista-riordino' },
      h('header', { class: 'scheda-testa' }, h('h1', {}, 'Da riordinare')),
      corpo,
    ),
  );
  disegna();
  return prodotti.suCambio(disegna);
}
