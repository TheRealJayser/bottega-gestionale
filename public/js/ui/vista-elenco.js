// =====================================================================
//  ELENCO PRODOTTI: ricerca istantanea, filtri, ordinamento.
//  La ricerca lavora sulla copia in memoria: nessuna lettura dal server.
// =====================================================================

import { h, riempi, rallenta, schermoLargo, conferma } from './dom.js';
import { icona } from './icone.js';
import * as prodotti from '../servizi/prodotti.js';
import { euro } from '../util/formato.js';
import { formattaQuantita, prezzoPer } from '../util/unita.js';
import { parole } from '../util/testo.js';
import { pulisciCodice, sembraCodice } from '../util/codici.js';

const CHIAVE_FILTRI = 'bottega.filtriElenco';
const RIGHE_INIZIALI = 150;

const ORDINAMENTI = {
  nome: { etichetta: 'Nome (A-Z)', confronta: (a, b) => a.nome.localeCompare(b.nome, 'it') },
  quantitaSu: { etichetta: 'Quantità (poca prima)', confronta: (a, b) => a.quantita - b.quantita },
  quantitaGiu: { etichetta: 'Quantità (tanta prima)', confronta: (a, b) => b.quantita - a.quantita },
  prezzoSu: { etichetta: 'Prezzo (basso prima)', confronta: (a, b) => a.prezzoVendita - b.prezzoVendita },
  prezzoGiu: { etichetta: 'Prezzo (alto prima)', confronta: (a, b) => b.prezzoVendita - a.prezzoVendita },
  recenti: { etichetta: 'Modificati di recente', confronta: (a, b) => (b.modificatoIl ?? 0) - (a.modificatoIl ?? 0) },
};

function leggiFiltri() {
  try {
    return { testo: '', categoria: '', ordine: 'nome', archiviati: false,
      ...JSON.parse(sessionStorage.getItem(CHIAVE_FILTRI) ?? '{}') };
  } catch {
    return { testo: '', categoria: '', ordine: 'nome', archiviati: false };
  }
}

/** Filtra e ordina un elenco di prodotti secondo i filtri. */
export function filtraProdotti(lista, { testo, categoria, ordine }) {
  const cercate = parole(testo);
  let r = lista;
  if (categoria) r = r.filter((p) => p.categoria === categoria);
  if (cercate.length) {
    r = r.filter((p) => cercate.every((w) => p.nomeRicerca?.includes(w) || p.ean?.startsWith(w)));
  }
  return [...r].sort(ORDINAMENTI[ordine]?.confronta ?? ORDINAMENTI.nome.confronta);
}

export function sottoScorta(p) {
  return p.sogliaMinima > 0 && p.quantita <= p.sogliaMinima;
}

export function mostraElenco(contenitore, { naviga }) {
  const filtri = leggiFiltri();
  let mostraTutte = false;

  const salvaFiltri = () => sessionStorage.setItem(CHIAVE_FILTRI, JSON.stringify(filtri));

  // ---------- Barra di ricerca e filtri ----------
  const ricerca = h('input', {
    type: 'search',
    class: 'ricerca-campo',
    placeholder: 'Cerca per nome o codice…',
    value: filtri.testo,
    autocomplete: 'off',
    enterkeyhint: 'search',
    'aria-label': 'Cerca prodotto',
    oninput: rallenta(() => { filtri.testo = ricerca.value; mostraTutte = false; salvaFiltri(); disegna(); }, 120),
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); invio(); } },
  });

  const selCategoria = h('select', {
    'aria-label': 'Categoria',
    onchange: () => { filtri.categoria = selCategoria.value; salvaFiltri(); disegna(); },
  });
  const selOrdine = h('select', {
    'aria-label': 'Ordina per',
    onchange: () => { filtri.ordine = selOrdine.value; salvaFiltri(); disegna(); },
  }, Object.entries(ORDINAMENTI).map(([k, o]) => h('option', { value: k, selected: k === filtri.ordine }, o.etichetta)));
  const chkArchiviati = h('input', {
    type: 'checkbox',
    checked: filtri.archiviati,
    onchange: () => { filtri.archiviati = chkArchiviati.checked; salvaFiltri(); disegna(); },
  });

  const conteggio = h('p', { class: 'conteggio' });
  const lista = h('div', { class: 'tabella-prodotti', role: 'list' });

  riempi(contenitore,
    h('section', { class: 'vista vista-elenco' },
      h('div', { class: 'barra-strumenti' },
        h('div', { class: 'ricerca' },
          icona('cerca'),
          ricerca,
          h('button', {
            class: 'pulsante-icona',
            'aria-label': 'Scansiona codice',
            title: 'Scansiona codice',
            onclick: () => naviga('#/scansione'),
          }, icona('scansiona')),
        ),
        h('div', { class: 'filtri' },
          selCategoria,
          selOrdine,
          h('label', { class: 'spunta' }, chkArchiviati, ' Archiviati'),
        ),
      ),
      conteggio,
      lista,
      h('a', { href: '#/nuovo', class: 'fab', 'aria-label': 'Nuovo prodotto', title: 'Nuovo prodotto' }, icona('piu')),
    ),
  );

  if (schermoLargo()) ricerca.focus();

  // ---------- Invio nella ricerca (anche dal lettore USB) ----------
  async function invio() {
    const testo = ricerca.value.trim();
    if (!testo) return;
    const codice = pulisciCodice(testo);
    const trovato = prodotti.perCodiceABarre(codice);
    if (trovato) {
      ricerca.value = '';
      filtri.testo = '';
      salvaFiltri();
      naviga(`#/prodotto/${trovato.id}`);
      return;
    }
    const risultati = filtraProdotti(prodotti.tutti({ archiviati: filtri.archiviati }), filtri);
    if (risultati.length === 1) {
      naviga(`#/prodotto/${risultati[0].id}`);
      return;
    }
    if (sembraCodice(codice) && risultati.length === 0) {
      const si = await conferma(`Il codice ${codice} non è in magazzino. Vuoi inserire un nuovo prodotto?`, {
        titolo: 'Codice non trovato', testoOk: 'Inserisci prodotto',
      });
      if (si) {
        ricerca.value = '';
        filtri.testo = '';
        salvaFiltri();
        naviga(`#/nuovo?ean=${encodeURIComponent(codice)}`);
      }
    }
  }

  // ---------- Disegno dell'elenco ----------
  function aggiornaCategorie() {
    const cat = prodotti.categorie();
    if (filtri.categoria && !cat.includes(filtri.categoria)) cat.push(filtri.categoria);
    riempi(selCategoria,
      h('option', { value: '' }, 'Tutte le categorie'),
      cat.map((c) => h('option', { value: c, selected: c === filtri.categoria }, c)),
    );
  }

  function riga(p) {
    const basso = sottoScorta(p);
    return h('a', {
      href: `#/prodotto/${p.id}`,
      class: `riga-prodotto ${p.archiviato ? 'archiviato' : ''}`,
      role: 'listitem',
    },
      h('span', { class: `riga-foto ${p.haFoto ? 'con-foto' : ''}`, title: p.haFoto ? 'Ha una foto' : '' },
        icona(p.haFoto ? 'foto' : 'magazzino')),
      h('span', { class: 'riga-nome' },
        h('strong', {}, p.nome),
        h('small', {}, [p.categoria, p.ean].filter(Boolean).join(' · ') || ' '),
      ),
      h('span', { class: 'riga-fornitore solo-largo' }, p.fornitore || '—'),
      h('span', { class: 'riga-prezzo' },
        euro(p.prezzoVendita), p.unita !== 'pz' && h('small', {}, ` ${prezzoPer(p.unita)}`)),
      h('span', { class: `riga-quantita ${basso ? 'bassa' : ''} ${p.quantita < 0 ? 'negativa' : ''}` },
        basso && icona('avviso', 'piccola'),
        formattaQuantita(p.quantita, p.unita)),
    );
  }

  function disegna() {
    const stato = prodotti.statoSincronizzazione();
    aggiornaCategorie();

    if (!stato.pronto) {
      conteggio.textContent = '';
      riempi(lista, h('div', { class: 'caricamento' }, h('div', { class: 'rotella' }), h('p', {}, 'Caricamento prodotti…')));
      return;
    }

    const tuttiProdotti = prodotti.tutti({ archiviati: filtri.archiviati });
    const risultati = filtraProdotti(tuttiProdotti, filtri);

    if (tuttiProdotti.length === 0) {
      conteggio.textContent = '';
      riempi(lista, h('div', { class: 'vuoto' },
        icona('magazzino', 'grande'),
        h('p', {}, 'Il magazzino è vuoto.'),
        h('p', {}, h('a', { href: '#/nuovo' }, 'Inserisci il primo prodotto'),
          ' oppure importa un file CSV/Excel da ', h('a', { href: '#/altro' }, 'Altro'), '.'),
      ));
      return;
    }

    conteggio.textContent = risultati.length === tuttiProdotti.length
      ? `${risultati.length} prodotti`
      : `${risultati.length} di ${tuttiProdotti.length} prodotti`;

    const visibili = mostraTutte ? risultati : risultati.slice(0, RIGHE_INIZIALI);
    riempi(lista,
      h('div', { class: 'riga-intestazione solo-largo', 'aria-hidden': 'true' },
        h('span', {}), h('span', {}, 'Prodotto'), h('span', {}, 'Fornitore'),
        h('span', {}, 'Prezzo'), h('span', {}, 'Quantità')),
      visibili.map(riga),
      risultati.length === 0 && h('div', { class: 'vuoto' }, h('p', {}, 'Nessun prodotto corrisponde alla ricerca.')),
      risultati.length > visibili.length && h('button', {
        class: 'pulsante secondario mostra-altri',
        onclick: () => { mostraTutte = true; disegna(); },
      }, `Mostra tutti (${risultati.length})`),
    );
  }

  disegna();
  const smetti = prodotti.suCambio(disegna);
  return () => smetti();
}
