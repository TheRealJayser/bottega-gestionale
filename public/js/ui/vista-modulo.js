// =====================================================================
//  MODULO PRODOTTO: inserimento di un nuovo prodotto o modifica.
// =====================================================================

import { h, riempi, avviso, campo, erroreCampo, dispositivoTouch } from './dom.js';
import { icona } from './icone.js';
import { selettoreFoto } from './componenti.js';
import { scansionaUnCodice } from './finestra-scanner.js';
import * as prodotti from '../servizi/prodotti.js';
import { eliminaFoto, leggiFoto, salvaFoto } from '../servizi/foto.js';
import { euroSemplice, leggiEuro } from '../util/formato.js';
import { infoUnita, leggiQuantita, perCampo, UNITA } from '../util/unita.js';
import { codiceAmmesso, eanCorretto, generaCodiceInterno, pulisciCodice } from '../util/codici.js';

export function mostraModulo(contenitore, { id, ean, naviga }) {
  const esistente = id ? prodotti.perId(id) : null;
  if (id && !esistente) {
    riempi(contenitore, h('div', { class: 'vuoto' }, h('p', {}, 'Prodotto non trovato.')));
    return;
  }
  const nuovo = !esistente;
  const v = esistente ?? { unita: 'pz', passo: 1, sogliaMinima: 0, ean: ean ? pulisciCodice(ean) : '' };

  // ---------- Campi ----------
  const nome = h('input', { type: 'text', maxlength: 200, required: true, value: v.nome ?? '', autocomplete: 'off', autocapitalize: 'sentences' });
  const codice = h('input', { type: 'text', maxlength: 40, value: v.ean ?? '', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Scansiona o scrivi' });
  const avvisoCodice = h('small', { class: 'aiuto' });
  const codiceArticolo = h('input', { type: 'text', maxlength: 40, value: v.codiceArticolo ?? '', autocomplete: 'off', placeholder: 'Facoltativo' });
  const categoria = h('input', { type: 'text', maxlength: 100, value: v.categoria ?? '', list: 'elenco-categorie', autocomplete: 'off', autocapitalize: 'sentences' });
  const unita = h('select', {}, Object.entries(UNITA).map(([k, u]) => h('option', { value: k, selected: k === v.unita }, u.etichetta)));
  const prezzoVendita = h('input', { type: 'text', inputmode: 'decimal', value: euroSemplice(v.prezzoVendita), placeholder: '0,00', autocomplete: 'off' });
  const prezzoAcquisto = h('input', { type: 'text', inputmode: 'decimal', value: euroSemplice(v.prezzoAcquisto), placeholder: 'Facoltativo', autocomplete: 'off' });
  const quantitaIniziale = h('input', { type: 'text', inputmode: 'decimal', value: '', placeholder: '0', autocomplete: 'off' });
  const soglia = h('input', { type: 'text', inputmode: 'decimal', value: v.sogliaMinima ? perCampo(v.sogliaMinima, v.unita) : '', placeholder: 'Nessun avviso', autocomplete: 'off' });
  const passo = h('input', { type: 'text', inputmode: 'decimal', value: perCampo(v.passo, v.unita), autocomplete: 'off' });
  const fornitore = h('input', { type: 'text', maxlength: 200, value: v.fornitore ?? '', list: 'elenco-fornitori', autocomplete: 'off', autocapitalize: 'words' });
  const note = h('textarea', { rows: 3, maxlength: 2000 }, v.note ?? '');
  let passoToccato = !nuovo;
  passo.addEventListener('input', () => { passoToccato = true; });

  // In modifica l'unità si può cambiare solo a quantità zero
  // (altrimenti 3 pezzi diventerebbero 3 grammi).
  if (!nuovo && esistente.quantita !== 0) unita.disabled = true;

  // Etichette che cambiano con l'unità di misura.
  const simboli = [];
  const conUnita = (input, prezzo = false) => {
    const s = h('span', {});
    simboli.push({ s, prezzo });
    return h('div', { class: 'con-unita' }, input, s);
  };
  const aggiornaUnita = () => {
    const u = infoUnita(unita.value);
    simboli.forEach(({ s, prezzo }) => { s.textContent = prezzo ? `€/${u.simbolo}` : u.simbolo; });
    if (!passoToccato) passo.value = perCampo(u.passo, unita.value);
  };
  unita.addEventListener('change', aggiornaUnita);

  // ---------- Codice a barre ----------
  const controllaCodice = () => {
    const c = pulisciCodice(codice.value);
    erroreCampo(codice, '');
    avvisoCodice.textContent = '';
    if (!c) return true;
    if (!codiceAmmesso(c)) { erroreCampo(codice, 'Il codice può contenere solo cifre, lettere e trattini.'); return false; }
    const altro = prodotti.perCodiceABarre(c);
    if (altro && altro.id !== id) {
      erroreCampo(codice, `Codice già usato da "${altro.nome}"${altro.archiviato ? ' (archiviato)' : ''}.`);
      return false;
    }
    if (/^\d{8}$|^\d{13}$/.test(c) && !eanCorretto(c)) {
      avvisoCodice.textContent = '⚠ La cifra di controllo non torna: verifica di averlo scritto bene.';
    }
    return true;
  };
  codice.addEventListener('change', controllaCodice);

  const pulsantiCodice = h('div', { class: 'pulsanti-codice' },
    h('button', { type: 'button', class: 'pulsante secondario', onclick: async () => {
      const letto = await scansionaUnCodice();
      if (letto) { codice.value = letto; controllaCodice(); }
    } }, icona('scansiona'), 'Scansiona'),
    h('button', { type: 'button', class: 'pulsante secondario', title: 'Per prodotti senza codice (sfusi, fatti in bottega)', onclick: () => {
      codice.value = generaCodiceInterno((c) => !!prodotti.perCodiceABarre(c));
      controllaCodice();
    } }, 'Genera codice interno'),
  );

  // ---------- Foto ----------
  let fotoNuova = null;        // foto compressa scelta ora
  let togliFoto = false;       // l'utente ha tolto la foto esistente
  const anteprima = h('div', { class: 'anteprima-foto' });
  const disegnaAnteprima = async () => {
    if (fotoNuova) {
      const url = URL.createObjectURL(fotoNuova.blob);
      riempi(anteprima,
        h('img', { src: url, alt: 'Anteprima', onload: () => URL.revokeObjectURL(url) }),
        h('small', {}, `${fotoNuova.larghezza}×${fotoNuova.altezza} px, ${Math.round(fotoNuova.blob.size / 1024)} KB`),
        h('button', { type: 'button', class: 'pulsante-link pericolo', onclick: () => { fotoNuova = null; disegnaAnteprima(); } }, 'Togli'),
      );
    } else if (esistente?.haFoto && !togliFoto) {
      riempi(anteprima, h('div', { class: 'rotella piccola' }));
      const f = await leggiFoto(id).catch(() => null);
      if (fotoNuova || togliFoto) return;
      riempi(anteprima,
        f ? h('img', { src: f.url, alt: 'Foto attuale' }) : h('small', {}, 'Foto presente (non visibile offline)'),
        h('button', { type: 'button', class: 'pulsante-link pericolo', onclick: () => { togliFoto = true; disegnaAnteprima(); } }, 'Togli foto'),
      );
    } else {
      riempi(anteprima, h('small', { class: 'nota' }, 'Nessuna foto'));
    }
  };

  // ---------- Salvataggio ----------
  const pulsanteSalva = h('button', { type: 'submit', class: 'pulsante primario grande' }, nuovo ? 'Inserisci prodotto' : 'Salva modifiche');

  function leggiModulo() {
    [nome, codice, prezzoVendita, prezzoAcquisto, quantitaIniziale, soglia, passo].forEach((c) => erroreCampo(c, ''));
    const u = unita.value;
    const dati = {
      nome: nome.value.trim(),
      ean: pulisciCodice(codice.value) || null,
      codiceArticolo: codiceArticolo.value.trim(),
      categoria: categoria.value.trim(),
      unita: u,
      prezzoVendita: leggiEuro(prezzoVendita.value),
      prezzoAcquisto: leggiEuro(prezzoAcquisto.value),
      sogliaMinima: leggiQuantita(soglia.value, u) ?? 0,
      passo: leggiQuantita(passo.value, u),
      fornitore: fornitore.value.trim(),
      note: note.value.trim(),
    };
    const q = nuovo ? (leggiQuantita(quantitaIniziale.value, u) ?? 0) : 0;
    const decimale = infoUnita(u).decimali ? 'es. 0,250' : 'un numero intero';

    // I controlli partono dal fondo così il cursore finisce sul primo errore.
    let ok = true;
    if (!dati.passo || Number.isNaN(dati.passo) || dati.passo <= 0) { erroreCampo(passo, `Scrivi una quantità maggiore di zero (${decimale})`); ok = false; }
    if (Number.isNaN(dati.sogliaMinima) || dati.sogliaMinima < 0) { erroreCampo(soglia, `Scrivi ${decimale}, oppure lascia vuoto`); ok = false; }
    if (nuovo && (Number.isNaN(q) || q < 0)) { erroreCampo(quantitaIniziale, `Scrivi ${decimale}`); ok = false; }
    if (Number.isNaN(dati.prezzoAcquisto)) { erroreCampo(prezzoAcquisto, 'Prezzo non valido, es. 2,40'); ok = false; }
    if (dati.prezzoVendita == null || Number.isNaN(dati.prezzoVendita)) { erroreCampo(prezzoVendita, 'Scrivi il prezzo, es. 3,50'); ok = false; }
    if (!controllaCodice()) ok = false;
    if (!dati.nome) { erroreCampo(nome, 'Il nome è obbligatorio'); ok = false; }
    return ok ? { dati, q } : null;
  }

  async function salva(e) {
    e.preventDefault();
    const letto = leggiModulo();
    if (!letto) return;
    pulsanteSalva.disabled = true;
    try {
      let idProdotto = id;
      if (nuovo) {
        idProdotto = prodotti.crea(letto.dati, letto.q).id;
      } else {
        prodotti.aggiorna(id, letto.dati);
      }
      if (fotoNuova) await salvaFoto(idProdotto, fotoNuova); // solo salvataggio locale
      else if (togliFoto) eliminaFoto(idProdotto);
      avviso(nuovo ? 'Prodotto inserito' : 'Modifiche salvate', 'ok');
      naviga(`#/prodotto/${idProdotto}`, { sostituisci: true });
    } catch (err) {
      console.error(err);
      avviso('Errore: ' + err.message, 'errore');
      pulsanteSalva.disabled = false;
    }
  }

  // ---------- Disegno ----------
  riempi(contenitore,
    h('section', { class: 'vista vista-modulo' },
      h('header', { class: 'scheda-testa con-indietro' },
        h('button', { type: 'button', class: 'pulsante-indietro', onclick: () => history.back() }, icona('indietro'), 'Annulla'),
        h('h1', {}, nuovo ? 'Nuovo prodotto' : 'Modifica prodotto'),
      ),
      h('datalist', { id: 'elenco-categorie' }, prodotti.categorie().map((c) => h('option', { value: c }))),
      h('datalist', { id: 'elenco-fornitori' }, prodotti.fornitori().map((c) => h('option', { value: c }))),
      h('form', { class: 'modulo', onsubmit: salva, novalidate: true },
        h('fieldset', {},
          h('legend', {}, 'Prodotto'),
          campo('Nome *', nome),
          h('div', { class: 'campo' },
            h('label', { for: 'campo-codice' }, 'Codice a barre (EAN)'),
            Object.assign(codice, { id: 'campo-codice' }),
            pulsantiCodice,
            avvisoCodice,
            h('small', { class: 'errore-campo' }),
          ),
          campo('Codice articolo', codiceArticolo, { aiuto: 'Il codice del fornitore o del grossista (colonna "codice" dell\'inventario).' }),
          campo('Categoria', categoria),
          campo('Unità di misura', unita, {
            aiuto: unita.disabled ? 'Per cambiare unità la quantità deve essere zero (fai prima un conteggio a 0).' : 'Affettati, frutta e verdura: Chilogrammi.',
          }),
        ),
        h('fieldset', {},
          h('legend', {}, 'Prezzi'),
          h('div', { class: 'due-colonne' },
            campo('Prezzo di vendita *', conUnita(prezzoVendita, true)),
            campo('Prezzo di acquisto', conUnita(prezzoAcquisto, true)),
          ),
        ),
        h('fieldset', {},
          h('legend', {}, 'Magazzino'),
          h('div', { class: 'due-colonne' },
            nuovo && campo('Quantità iniziale', conUnita(quantitaIniziale)),
            campo('Scorta minima', conUnita(soglia), { aiuto: 'Sotto questa quantità il prodotto va in "Riordino".' }),
            campo('Passo dei pulsanti +/−', conUnita(passo), { aiuto: 'Quanto aggiunge o toglie un tocco.' }),
          ),
        ),
        h('fieldset', {},
          h('legend', {}, 'Altro'),
          campo('Fornitore', fornitore),
          campo('Note', note),
          h('div', { class: 'campo' },
            h('label', {}, 'Foto'),
            anteprima,
            selettoreFoto((foto) => { fotoNuova = foto; togliFoto = false; disegnaAnteprima(); }),
          ),
        ),
        h('div', { class: 'azioni-modulo' }, pulsanteSalva),
      ),
    ),
  );

  aggiornaUnita();
  disegnaAnteprima();
  if (v.ean) controllaCodice();
  if (!dispositivoTouch() || nuovo) nome.focus();
}
