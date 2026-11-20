// =====================================================================
//  AVVIO DELL'APP E NAVIGAZIONE TRA LE SCHERMATE
//
//  Indirizzi (dopo il #):
//    #/prodotti                  elenco
//    #/prodotto/ID               scheda prodotto
//    #/prodotto/ID/modifica      modifica
//    #/nuovo?ean=CODICE          nuovo prodotto
//    #/scansione                 scansione con fotocamera / lettore
//    #/riordino                  prodotti da riordinare
//    #/movimenti?prodotto=ID     storico movimenti
//    #/altro                     account, import/export, backup
// =====================================================================

import { h, riempi, avviso, conferma } from './ui/dom.js';
import { icona } from './ui/icone.js';
import { registraServiceWorker } from './ui/installazione.js';
import { avviaLettoreTastiera, impostaGestoreCodici } from './ui/lettore-tastiera.js';
import { mostraAccesso, mostraCaricamento, mostraNonAutorizzato } from './ui/vista-accesso.js';
import { mostraElenco } from './ui/vista-elenco.js';
import { mostraScheda } from './ui/vista-scheda.js';
import { mostraModulo } from './ui/vista-modulo.js';
import { mostraScansione } from './ui/vista-scansione.js';
import { mostraMovimenti } from './ui/vista-movimenti.js';
import { mostraRiordino } from './ui/vista-riordino.js';
import { mostraAltro } from './ui/vista-altro.js';
import { osservaAccesso } from './servizi/auth.js';
import { caricaProfilo, dimenticaProfilo, profiloCorrente } from './servizi/utenti.js';
import * as prodotti from './servizi/prodotti.js';
import { suErroreScrittura, suStatoScritture } from './servizi/scritture.js';

const radice = document.getElementById('app');
let contenuto = null;      // <main> dove si disegnano le schermate
let pulisciVista = null;   // funzione di chiusura della schermata attuale
let elementiNav = [];
let badgeRiordino = null;
let indicatoreStato = null;

// ---------------------------------------------------------------------
//  Navigazione
// ---------------------------------------------------------------------

export function naviga(indirizzo, { sostituisci = false } = {}) {
  if (sostituisci) location.replace(indirizzo);
  else location.hash = indirizzo;
}

/** Cosa fare con un codice letto dal lettore USB fuori dai campi di testo. */
async function gestoreCodicePredefinito(codice) {
  const p = prodotti.perCodiceABarre(codice);
  if (p) {
    naviga(`#/prodotto/${p.id}`);
    return;
  }
  const si = await conferma(`Il codice ${codice} non è in magazzino. Vuoi inserire un nuovo prodotto?`, {
    titolo: 'Codice non trovato', testoOk: 'Inserisci prodotto',
  });
  if (si) naviga(`#/nuovo?ean=${encodeURIComponent(codice)}`);
}

function instrada() {
  if (!contenuto) return;
  const [percorso, ricerca = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parti = percorso.split('/').filter(Boolean);
  const parametri = new URLSearchParams(ricerca);
  const contesto = { naviga, parametri, ripristinaGestore: () => impostaGestoreCodici(gestoreCodicePredefinito) };

  pulisciVista?.();
  pulisciVista = null;
  impostaGestoreCodici(gestoreCodicePredefinito);
  document.title = 'Bottega';

  let sezione = 'prodotti';
  let disegna;
  switch (parti[0] ?? 'prodotti') {
    case 'prodotti':
      disegna = () => mostraElenco(contenuto, contesto);
      break;
    case 'prodotto':
      disegna = parti[2] === 'modifica'
        ? () => mostraModulo(contenuto, { ...contesto, id: parti[1] })
        : () => mostraScheda(contenuto, { ...contesto, id: parti[1] });
      break;
    case 'nuovo':
      disegna = () => mostraModulo(contenuto, { ...contesto, ean: parametri.get('ean') });
      break;
    case 'scansione':
      sezione = 'scansione';
      disegna = () => mostraScansione(contenuto, contesto);
      break;
    case 'riordino':
      sezione = 'riordino';
      disegna = () => mostraRiordino(contenuto, contesto);
      break;
    case 'movimenti':
      sezione = 'movimenti';
      disegna = () => mostraMovimenti(contenuto, contesto);
      break;
    case 'altro':
      sezione = 'altro';
      disegna = () => mostraAltro(contenuto, contesto);
      break;
    default:
      naviga('#/prodotti', { sostituisci: true });
      return;
  }

  elementiNav.forEach((a) => a.toggleAttribute('aria-current', a.dataset.sezione === sezione));
  window.scrollTo(0, 0);
  try {
    pulisciVista = disegna() ?? null;
  } catch (err) {
    console.error(err);
    riempi(contenuto, h('div', { class: 'vuoto' }, h('p', {}, 'Si è verificato un errore: ' + err.message),
      h('a', { href: '#/prodotti' }, 'Torna all\'elenco')));
  }
}

// ---------------------------------------------------------------------
//  Struttura fissa: barra in alto, menu, area contenuti
// ---------------------------------------------------------------------

function montaStruttura() {
  const voce = (sezione, indirizzo, nomeIcona, testo, extra) => {
    const a = h('a', { href: indirizzo, class: `nav-voce nav-${sezione}`, dataset: { sezione } },
      icona(nomeIcona), h('span', {}, testo), extra);
    elementiNav.push(a);
    return a;
  };
  elementiNav = [];
  badgeRiordino = h('span', { class: 'badge', hidden: true });
  indicatoreStato = h('span', { class: 'stato-rete', role: 'status' });
  contenuto = h('main', { id: 'contenuto', tabindex: '-1' });

  radice.classList.add('con-struttura');
  riempi(radice,
    h('header', { class: 'barra-alta' },
      h('a', { href: '#/prodotti', class: 'marchio' }, h('img', { src: 'icone/icona.svg', alt: '', width: 28, height: 28 }), 'Bottega'),
      indicatoreStato,
      h('span', { class: 'utente-attivo' }, profiloCorrente()?.nome ?? ''),
    ),
    h('nav', { class: 'navigazione', 'aria-label': 'Menu principale' },
      voce('prodotti', '#/prodotti', 'magazzino', 'Magazzino'),
      voce('riordino', '#/riordino', 'riordino', 'Riordino', badgeRiordino),
      voce('scansione', '#/scansione', 'scansiona', 'Scansiona'),
      voce('movimenti', '#/movimenti', 'storico', 'Storico'),
      voce('altro', '#/altro', 'altro', 'Altro'),
    ),
    contenuto,
  );
}

let scrittureInAttesa = 0;

function aggiornaIndicatori() {
  if (!indicatoreStato) return;
  const daRiordinare = prodotti.daRiordinare().length;
  badgeRiordino.hidden = daRiordinare === 0;
  badgeRiordino.textContent = daRiordinare > 99 ? '99+' : String(daRiordinare);

  const stato = prodotti.statoSincronizzazione();
  let classe = '';
  let testo = '';
  let nomeIcona = null;
  if (stato.errore) { classe = 'errore'; testo = 'Errore'; nomeIcona = 'avviso'; }
  else if (!navigator.onLine) { classe = 'offline'; testo = scrittureInAttesa ? `Offline · ${scrittureInAttesa} da inviare` : 'Offline'; nomeIcona = 'offline'; }
  else if (scrittureInAttesa) { classe = 'invio'; testo = `Invio ${scrittureInAttesa}…`; nomeIcona = 'sincro'; }
  indicatoreStato.className = `stato-rete ${classe}`;
  indicatoreStato.title = stato.errore ?? '';
  riempi(indicatoreStato, nomeIcona && icona(nomeIcona, 'piccola'), testo);
}

// ---------------------------------------------------------------------
//  Avvio
// ---------------------------------------------------------------------

registraServiceWorker();
avviaLettoreTastiera();
window.addEventListener('hashchange', instrada);
window.addEventListener('online', aggiornaIndicatori);
window.addEventListener('offline', aggiornaIndicatori);
prodotti.suCambio(aggiornaIndicatori);
suStatoScritture(({ inAttesa }) => { scrittureInAttesa = inAttesa; aggiornaIndicatori(); });
suErroreScrittura((messaggio) => avviso(messaggio, 'errore', { durata: 10_000 }));

// Avvisa se si chiude la pagina con operazioni non ancora inviate
// (restano comunque salvate sul dispositivo e partiranno alla riapertura).
window.addEventListener('beforeunload', (e) => {
  if (scrittureInAttesa > 0 && navigator.onLine) e.preventDefault();
});

mostraCaricamento(radice);

osservaAccesso(async (utente) => {
  pulisciVista?.();
  pulisciVista = null;
  radice.classList.remove('con-struttura');

  if (!utente) {
    prodotti.fermaSincronizzazione();
    dimenticaProfilo();
    contenuto = null;
    indicatoreStato = null;
    mostraAccesso(radice);
    return;
  }

  mostraCaricamento(radice, 'Accesso in corso…');
  let profilo;
  try {
    profilo = await caricaProfilo(utente);
  } catch (err) {
    console.error(err);
    riempi(radice, h('main', { class: 'accesso' }, h('div', { class: 'accesso-scheda' },
      h('h1', {}, 'Impossibile avviare'),
      h('p', {}, 'Controlla la connessione a Internet e riprova.'),
      h('button', { class: 'pulsante primario', onclick: () => location.reload() }, 'Riprova'))));
    return;
  }
  if (!profilo) {
    mostraNonAutorizzato(radice, utente.email);
    return;
  }

  montaStruttura();
  prodotti.avviaSincronizzazione();
  aggiornaIndicatori();
  instrada();
});
