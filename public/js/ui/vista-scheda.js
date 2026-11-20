// =====================================================================
//  SCHEDA PRODOTTO: quantità con carico/scarico rapido, dettagli, foto,
//  storici (movimenti, prezzi, modifiche).
// =====================================================================

import { h, riempi, avviso, conferma, apriFinestra } from './dom.js';
import { icona } from './icone.js';
import { chiediMovimento, rigaModifica, rigaMovimento, rigaPrezzo, selettoreFoto } from './componenti.js';
import * as prodotti from '../servizi/prodotti.js';
import { registraMovimento, rettificaA, ascoltaUltimiMovimenti } from '../servizi/movimenti.js';
import { storicoModifiche, storicoPrezzi } from '../servizi/storici.js';
import { eliminaFoto, leggiFoto, salvaFoto } from '../servizi/foto.js';
import { euro, firma } from '../util/formato.js';
import { formattaDelta, formattaQuantita, prezzoPer, UNITA } from '../util/unita.js';
import { sottoScorta } from './vista-elenco.js';

export function mostraScheda(contenitore, { id, naviga }) {
  let p = prodotti.perId(id);
  const sezione = h('section', { class: 'vista vista-scheda' });
  riempi(contenitore, sezione);

  if (!p) {
    // Forse l'elenco non è ancora arrivato: aspettiamo e riproviamo.
    riempi(sezione, h('div', { class: 'caricamento' }, h('div', { class: 'rotella' })));
    let annullato = false;
    prodotti.attendiPronto().then(() => {
      if (annullato) return;
      if (prodotti.perId(id)) mostraScheda(contenitore, { id, naviga });
      else riempi(sezione, h('div', { class: 'vuoto' }, h('p', {}, 'Prodotto non trovato.'),
        h('a', { href: '#/prodotti' }, 'Torna all\'elenco')));
    });
    return () => { annullato = true; };
  }

  // ---------- Struttura (costruita una volta, aggiornata a pezzi) ----------
  const titolo = h('h1', {});
  const etichettaArchiviato = h('p', { class: 'etichetta-archiviato', hidden: true }, 'Prodotto archiviato');
  const fotoBox = h('div', { class: 'scheda-foto' });
  const valoreQuantita = h('div', { class: 'quantita-valore' });
  const avvisoScorta = h('p', { class: 'avviso-scorta', hidden: true });
  const meno = h('button', { class: 'pulsante-tondo meno', onclick: () => rapido(-1) });
  const piu = h('button', { class: 'pulsante-tondo piu', onclick: () => rapido(+1) });
  const dettagli = h('dl', { class: 'dettagli' });
  const firme = h('div', { class: 'firme' });
  const pulsanteArchivia = h('button', { class: 'pulsante secondario', onclick: archivia });
  const contenutoStorico = h('div', { class: 'storico-contenuto' });
  const schedeStorico = h('div', { class: 'schede-tipo', role: 'tablist' });

  riempi(sezione,
    h('header', { class: 'scheda-testa' },
      h('button', { class: 'pulsante-icona', 'aria-label': 'Indietro', onclick: () => history.length > 1 ? history.back() : naviga('#/prodotti') },
        icona('indietro')),
      titolo,
      h('a', { class: 'pulsante secondario', href: `#/prodotto/${id}/modifica` }, icona('modifica'), h('span', { class: 'solo-largo' }, 'Modifica')),
    ),
    etichettaArchiviato,
    h('div', { class: 'scheda-griglia' },
      h('div', { class: 'scheda-colonna' },
        h('div', { class: 'riquadro quantita' },
          h('div', { class: 'quantita-riga' }, meno, valoreQuantita, piu),
          avvisoScorta,
          h('div', { class: 'quantita-azioni' },
            h('button', { class: 'pulsante secondario', onclick: () => personalizzato('carico') }, 'Carico…'),
            h('button', { class: 'pulsante secondario', onclick: () => personalizzato('scarico') }, 'Scarico…'),
            h('button', { class: 'pulsante secondario', onclick: () => personalizzato('rettifica') }, 'Conteggio…'),
          ),
        ),
        fotoBox,
      ),
      h('div', { class: 'scheda-colonna' },
        h('div', { class: 'riquadro' }, dettagli, firme),
        h('div', { class: 'riquadro storico' },
          schedeStorico,
          contenutoStorico,
        ),
        h('div', { class: 'azioni-fondo' }, pulsanteArchivia),
      ),
    ),
  );

  // ---------- Aggiornamento dei dati ----------
  let haFotoMostrata = null;

  function aggiorna() {
    p = prodotti.perId(id);
    if (!p) return;
    const u = UNITA[p.unita];
    titolo.textContent = p.nome;
    document.title = `${p.nome} — Bottega`;
    etichettaArchiviato.hidden = !p.archiviato;
    valoreQuantita.textContent = formattaQuantita(p.quantita, p.unita);
    valoreQuantita.classList.toggle('negativa', p.quantita < 0);
    riempi(meno, '−', formattaQuantita(p.passo, p.unita, false));
    riempi(piu, '+', formattaQuantita(p.passo, p.unita, false));
    meno.setAttribute('aria-label', `Togli ${formattaQuantita(p.passo, p.unita)}`);
    piu.setAttribute('aria-label', `Aggiungi ${formattaQuantita(p.passo, p.unita)}`);

    const basso = sottoScorta(p);
    avvisoScorta.hidden = !basso && p.quantita >= 0;
    avvisoScorta.textContent = p.quantita < 0
      ? 'Quantità negativa: probabilmente manca un carico. Controlla e fai un conteggio.'
      : `Sotto la scorta minima (${formattaQuantita(p.sogliaMinima, p.unita)}): da riordinare.`;

    const riga = (nome, valore) => [h('dt', {}, nome), h('dd', {}, valore)];
    riempi(dettagli,
      riga('Prezzo di vendita', `${euro(p.prezzoVendita)} ${prezzoPer(p.unita)}`),
      riga('Prezzo di acquisto', p.prezzoAcquisto != null ? `${euro(p.prezzoAcquisto)} ${prezzoPer(p.unita)}` : '—'),
      riga('Categoria', p.categoria || '—'),
      riga('Codice a barre', p.ean || '—'),
      riga('Unità', u?.etichetta ?? p.unita),
      riga('Scorta minima', p.sogliaMinima ? formattaQuantita(p.sogliaMinima, p.unita) : 'nessun avviso'),
      riga('Fornitore', p.fornitore || '—'),
      p.note && riga('Note', p.note),
    );
    riempi(firme,
      h('p', {}, firma('Inserito', p.creatoDa, p.creatoIl)),
      h('p', {}, firma('Ultima modifica', p.modificatoDa, p.modificatoIl)),
    );
    pulsanteArchivia.replaceChildren(icona('archivio'), p.archiviato ? 'Ripristina prodotto' : 'Archivia prodotto');

    if (haFotoMostrata !== p.haFoto) disegnaFoto();
  }

  // ---------- Foto (scaricata solo qui, all'apertura della scheda) ----------
  async function disegnaFoto() {
    haFotoMostrata = p.haFoto;
    const scelta = selettoreFoto(async (foto) => {
      try {
        await salvaFoto(id, foto); // aspetta solo il salvataggio locale
        avviso('Foto salvata', 'ok');
        disegnaFoto();
      } catch (err) {
        avviso('Foto non salvata: ' + err.message, 'errore');
      }
    }, { testoScatta: p.haFoto ? 'Nuova foto' : 'Scatta foto' });

    if (!p.haFoto) {
      riempi(fotoBox, h('div', { class: 'foto-vuota' }, icona('immagine', 'grande'), h('p', {}, 'Nessuna foto')), scelta);
      return;
    }
    riempi(fotoBox, h('div', { class: 'foto-vuota' }, h('div', { class: 'rotella' })), scelta);
    try {
      const foto = await leggiFoto(id);
      if (!p.haFoto || !sezione.isConnected) return;
      if (!foto) {
        riempi(fotoBox, h('div', { class: 'foto-vuota' }, h('p', {}, 'Foto non ancora disponibile')), scelta);
        return;
      }
      const img = h('img', { src: foto.url, alt: p.nome, class: 'foto-prodotto', onclick: () => ingrandisci(foto.url) });
      riempi(fotoBox,
        img,
        foto.caricataDa && h('small', { class: 'firma-foto' }, firma('Foto aggiunta', foto.caricataDa, foto.caricataIl)),
        scelta,
        h('button', {
          type: 'button', class: 'pulsante-link pericolo',
          onclick: async () => {
            if (await conferma('Vuoi togliere la foto di questo prodotto?', { testoOk: 'Togli foto', pericolo: true })) {
              eliminaFoto(id);
            }
          },
        }, 'Togli foto'),
      );
    } catch (err) {
      riempi(fotoBox, h('div', { class: 'foto-vuota' }, h('p', {}, 'Foto non disponibile senza connessione')), scelta);
    }
  }

  function ingrandisci(url) {
    apriFinestra({ titolo: p.nome, corpo: h('img', { src: url, alt: p.nome, class: 'foto-grande' }), larga: true });
  }

  // ---------- Movimenti ----------
  function rapido(segno) {
    const delta = segno * p.passo;
    registraMovimento(id, segno > 0 ? 'carico' : 'scarico', delta);
    const ora = prodotti.perId(id).quantita;
    avviso(`${formattaDelta(delta, p.unita)} — ora ${formattaQuantita(ora, p.unita)}`, 'ok', { durata: 1500 });
  }

  async function personalizzato(tipo) {
    const r = await chiediMovimento(p, tipo);
    if (!r) return;
    if (r.tipo === 'rettifica') rettificaA(id, r.quantita, r.nota);
    else registraMovimento(id, r.tipo, r.tipo === 'carico' ? r.quantita : -r.quantita, r.nota);
    avviso(`Registrato — ora ${formattaQuantita(prodotti.perId(id).quantita, p.unita)}`, 'ok');
  }

  async function archivia() {
    if (!p.archiviato) {
      const ok = await conferma(
        `"${p.nome}" sparirà dall'elenco, ma resterà nello storico. Potrai ripristinarlo mostrando gli archiviati.`,
        { titolo: 'Archiviare il prodotto?', testoOk: 'Archivia', pericolo: true });
      if (!ok) return;
    }
    prodotti.impostaArchiviato(id, !p.archiviato);
  }

  // ---------- Storici ----------
  let fermaMovimenti = null;
  let schedaStorico = 'movimenti';

  async function mostraStorico(quale) {
    schedaStorico = quale;
    fermaMovimenti?.();
    fermaMovimenti = null;
    schedeStorico.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.q === quale)));
    riempi(contenutoStorico, h('div', { class: 'rotella piccola' }));

    if (quale === 'movimenti') {
      fermaMovimenti = ascoltaUltimiMovimenti(id, 15, (righe, err) => {
        if (err) { riempi(contenutoStorico, h('p', { class: 'nota' }, 'Storico non disponibile senza connessione.')); return; }
        riempi(contenutoStorico,
          righe.length ? h('ul', { class: 'elenco-storico' }, righe.map((m) => rigaMovimento(m))) : h('p', { class: 'nota' }, 'Nessun movimento.'),
          h('a', { href: `#/movimenti?prodotto=${id}`, class: 'pulsante-link' }, 'Vedi tutto lo storico e filtra →'),
        );
      });
      return;
    }
    try {
      const righe = quale === 'prezzi' ? await storicoPrezzi(id) : await storicoModifiche(id);
      if (schedaStorico !== quale) return;
      riempi(contenutoStorico, righe.length
        ? h('ul', { class: 'elenco-storico' }, righe.map((r) => quale === 'prezzi' ? rigaPrezzo(r) : rigaModifica(r, p.unita)))
        : h('p', { class: 'nota' }, quale === 'prezzi' ? 'Il prezzo non è mai stato cambiato.' : 'Nessuna modifica.'));
    } catch {
      riempi(contenutoStorico, h('p', { class: 'nota' }, 'Storico non disponibile senza connessione.'));
    }
  }

  for (const [q, testo] of [['movimenti', 'Movimenti'], ['prezzi', 'Prezzi'], ['modifiche', 'Modifiche']]) {
    schedeStorico.append(h('button', { type: 'button', role: 'tab', dataset: { q }, onclick: () => mostraStorico(q) }, testo));
  }

  aggiorna();
  mostraStorico('movimenti');
  const smetti = prodotti.suCambio(aggiorna);

  return () => {
    smetti();
    fermaMovimenti?.();
  };
}
