// =====================================================================
//  IMPORTAZIONE ed ESPORTAZIONE (CSV ed Excel) e BACKUP COMPLETO.
//
//  Colonne riconosciute (l'ordine non conta, maiuscole e accenti nemmeno):
//    Nome/Descrizione · Codice a barre (EAN) · Codice articolo ·
//    Categoria · Prezzo vendita · Prezzo acquisto/Costo un · Costo tot ·
//    Quantità/Pezzi · Unità · Scorta minima · Passo · Fornitore · Note
//  Va bene anche il file dell'inventario con le colonne
//    ean · codice · descrizione · pezzi · costo un · costo tot
//  (lì "codice" è il codice articolo del fornitore, perché c'è già "ean").
//  Le foto NON sono nei file CSV/Excel (solo nel backup completo).
// =====================================================================

import * as prodotti from './prodotti.js';
import { rettificaA, cercaMovimenti } from './movimenti.js';
import { leggiFotoGrezza } from './foto.js';
import { creaCsv, leggiCsv, scaricaFile } from '../util/csv.js';
import { dataPerFile, euroSemplice } from '../util/formato.js';
import { formattaQuantita, infoUnita, leggiQuantita } from '../util/unita.js';
import { codiceAmmesso, pulisciCodice } from '../util/codici.js';
import { normalizza } from '../util/testo.js';

const URL_SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const INTESTAZIONI = ['Nome', 'Codice', 'Codice articolo', 'Categoria', 'Prezzo vendita', 'Prezzo acquisto',
  'Quantità', 'Unità', 'Scorta minima', 'Passo', 'Fornitore', 'Note'];

const ALIAS = {
  nome: ['nome', 'prodotto', 'descrizione', 'articolo', 'descrizionearticolo'],
  ean: ['ean', 'ean13', 'codiceabarre', 'codicebarre', 'barcode', 'gtin'],
  codiceArticolo: ['codicearticolo', 'codarticolo', 'codart', 'codicefornitore', 'codfornitore', 'codiceinterno'],
  categoria: ['categoria', 'reparto'],
  prezzoVendita: ['prezzovendita', 'prezzo', 'prezzodivendita', 'vendita'],
  prezzoAcquisto: ['prezzoacquisto', 'prezzodiacquisto', 'costo', 'costoun', 'costounitario', 'costounit', 'costopz'],
  costoTotale: ['costotot', 'costototale', 'totale', 'importo'],
  quantita: ['quantita', 'qta', 'qt', 'giacenza', 'pezzi', 'pz', 'esistenza', 'inventario'],
  unita: ['unita', 'um', 'unitadimisura'],
  sogliaMinima: ['scortaminima', 'sogliaminima', 'soglia', 'minimo'],
  passo: ['passo'],
  fornitore: ['fornitore'],
  note: ['note', 'nota'],
};

const UNITA_TESTO = {
  pz: 'pz', pezzi: 'pz', pezzo: 'pz', n: 'pz', nr: 'pz', '': 'pz',
  kg: 'kg', chilogrammi: 'kg', chili: 'kg', kilo: 'kg',
  l: 'l', lt: 'l', litri: 'l', litro: 'l',
};

const chiaveIntestazione = (t) => normalizza(t).replace(/[^a-z0-9]/g, '');

let sheetjs = null;
const caricaSheetJs = async () => (sheetjs ??= await import(URL_SHEETJS));

// ---------------------------------------------------------------------
//  IMPORTAZIONE
// ---------------------------------------------------------------------

/**
 * Legge un file CSV o Excel e restituisce le righe come array di celle.
 * Dall'Excel i numeri arrivano come numeri veri (non come testo
 * formattato), così "1,42" o "8017331095294" non vengono storpiati.
 */
async function leggiTabella(file) {
  if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) {
    const XLSX = await caricaSheetJs();
    const libro = XLSX.read(await file.arrayBuffer());
    const foglio = libro.Sheets[libro.SheetNames[0]];
    return XLSX.utils.sheet_to_json(foglio, { header: 1, raw: true, defval: '' })
      .map((r) => r.map((v) => (v == null ? '' : v)))
      .filter((r) => r.some((v) => String(v).trim() !== ''));
  }
  return leggiCsv(await file.text());
}

const chiaviAlias = Object.entries(ALIAS);

/**
 * Quale colonna corrisponde a quale campo. "Codice" da solo è il codice a
 * barre, ma se nel file c'è anche una colonna EAN diventa il codice
 * articolo del fornitore (come nel file dell'inventario).
 */
function mappaColonne(intestazione) {
  const colonne = {};
  const chiavi = intestazione.map((t) => chiaveIntestazione(t));
  chiavi.forEach((k, i) => {
    for (const [campo, alias] of chiaviAlias) {
      if (alias.includes(k) && colonne[campo] === undefined) { colonne[campo] = i; break; }
    }
  });
  chiavi.forEach((k, i) => {
    if (k !== 'codice') return;
    if (colonne.ean === undefined) colonne.ean = i;
    else if (colonne.codiceArticolo === undefined) colonne.codiceArticolo = i;
  });
  return colonne;
}

/** La riga d'intestazione può non essere la prima: si cerca tra le prime 15. */
function trovaIntestazione(tabella) {
  let migliore = { indice: -1, colonne: {}, punti: 0 };
  tabella.slice(0, 15).forEach((riga, indice) => {
    const colonne = mappaColonne(riga);
    const punti = Object.keys(colonne).length;
    if (punti > migliore.punti && (colonne.nome !== undefined || colonne.ean !== undefined)) {
      migliore = { indice, colonne, punti };
    }
  });
  return migliore;
}

/** Testo di una cella (i numeri di Excel restano senza formattazione). */
function testoCella(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
  return String(v ?? '').trim();
}

/**
 * Prezzo da file → centesimi. Accetta numeri di Excel e testi come
 * "1,42", "€ 1.234,50", "0,3583" (si arrotonda al centesimo).
 * null se vuoto, NaN se non è un prezzo.
 */
function leggiPrezzoFile(v) {
  if (typeof v === 'number') return v >= 0 ? Math.round(v * 100) : NaN;
  let s = String(v ?? '').trim().replace(/[€\s]/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

/** Quantità da file → unità minima (i numeri di Excel vanno bene così). */
function leggiQuantitaFile(v, unita) {
  if (typeof v === 'number') {
    const u = infoUnita(unita);
    if (u.decimali === 0 && !Number.isInteger(Math.round(v * 1e6) / 1e6)) return NaN;
    return Math.round(v * u.fattore);
  }
  return leggiQuantita(v, unita);
}

/** Codice a barre da file: 0 o vuoto = nessun codice. */
function leggiCodiceFile(v) {
  const c = pulisciCodice(testoCella(v));
  return c && !/^0+$/.test(c) ? c : null;
}

/**
 * Prezzo di vendita calcolato dal costo con un ricarico in percentuale,
 * arrotondato ai 5 centesimi superiori (es. 1,42 € + 40% = 1,99 → 2,00 €).
 */
export function prezzoConRicarico(costo, ricarico) {
  if (costo == null || !(ricarico > 0)) return null;
  return Math.ceil((costo * (1 + ricarico / 100)) / 5 - 1e-9) * 5;
}

/**
 * Analizza un file e prepara le operazioni, senza scrivere nulla.
 * Le righe con lo stesso codice (o, senza codice, con la stessa
 * descrizione) vengono unite sommando i pezzi: in un inventario capita
 * di contare lo stesso prodotto in due scaffali.
 * @returns {Promise<{nuovi: any[], aggiornati: any[], uguali: number, errori: string[],
 *   unite: number, saltate: number, colonne: string[], senzaPrezzo: number}>}
 */
export async function analizzaFile(file) {
  const tabella = await leggiTabella(file);
  const { indice: rigaTitoli, colonne } = trovaIntestazione(tabella);
  if (rigaTitoli < 0) {
    throw new Error('Non trovo né la colonna "Descrizione" (o "Nome") né la colonna "EAN" (o "Codice"). Controlla la prima riga del file.');
  }
  if (tabella.length <= rigaTitoli + 1) throw new Error('Il file ha solo l\'intestazione, senza prodotti.');

  const errori = [];
  let saltate = 0;
  let unite = 0;

  // 1) Lettura delle righe, unendo i doppioni.
  const righe = [];
  const perChiave = new Map();
  tabella.slice(rigaTitoli + 1).forEach((riga, i) => {
    const numero = rigaTitoli + i + 2; // numero di riga come in Excel
    const cella = (campo) => (colonne[campo] === undefined ? undefined : riga[colonne[campo]]);
    const val = (campo) => (colonne[campo] === undefined ? undefined : testoCella(cella(campo)));
    const errore = (testo) => errori.push(`Riga ${numero}: ${testo}`);

    const ean = colonne.ean !== undefined ? leggiCodiceFile(cella('ean')) : undefined;
    const nome = val('nome');
    // Righe senza descrizione né codice: totali, separatori… si saltano.
    if (!ean && !nome) { saltate++; return; }
    if (ean && !codiceAmmesso(ean)) return errore(`codice "${ean}" non valido`);

    const r = { numero, ean, nome, cella, val, quantitaGrezza: [] };
    if (val('quantita') !== undefined && val('quantita') !== '') r.quantitaGrezza.push(cella('quantita'));

    const chiave = ean ? `ean:${ean}` : `nome:${normalizza(nome)}`;
    const primo = perChiave.get(chiave);
    if (primo) {
      primo.quantitaGrezza.push(...r.quantitaGrezza);
      primo.righeUnite.push(numero);
      unite++;
      return;
    }
    r.righeUnite = [];
    perChiave.set(chiave, r);
    righe.push(r);
  });

  // 2) Confronto con il magazzino.
  const risultato = {
    nuovi: [], aggiornati: [], uguali: 0, errori, unite, saltate,
    colonne: Object.keys(colonne), senzaPrezzo: 0,
  };
  const perNome = new Map(prodotti.tutti({ archiviati: true }).map((p) => [normalizza(p.nome), p]));

  for (const r of righe) {
    const { numero, ean, val, cella } = r;
    const errore = (testo) => errori.push(`Riga ${numero}: ${testo}`);

    // Prodotto esistente: per codice, altrimenti per descrizione identica.
    let esistente = ean ? prodotti.perCodiceABarre(ean) : null;
    if (!esistente && !ean && r.nome) esistente = perNome.get(normalizza(r.nome)) ?? null;

    // Unità (serve per leggere le quantità)
    let unita = esistente?.unita ?? 'pz';
    if (val('unita') !== undefined && val('unita') !== '') {
      const u = UNITA_TESTO[normalizza(val('unita')).replace(/\./g, '')];
      if (!u) { errore(`unità "${val('unita')}" non riconosciuta (usa pz, kg o l)`); continue; }
      if (esistente && u !== esistente.unita && esistente.quantita !== 0) {
        errore(`non si può cambiare l'unità di "${esistente.nome}" con quantità diversa da zero`);
        continue;
      }
      unita = u;
    }

    const dati = {};
    if (r.nome) dati.nome = r.nome.slice(0, 200);
    if (ean !== undefined) dati.ean = ean;
    if (val('codiceArticolo') !== undefined) dati.codiceArticolo = val('codiceArticolo').slice(0, 40);
    if (val('categoria') !== undefined) dati.categoria = val('categoria').slice(0, 100);
    if (val('fornitore') !== undefined) dati.fornitore = val('fornitore').slice(0, 200);
    if (val('note') !== undefined) dati.note = val('note').slice(0, 2000);
    if (val('unita') !== undefined) dati.unita = unita;

    // Quantità (sommata se il prodotto compariva più volte)
    let quantita;
    if (r.quantitaGrezza.length) {
      quantita = 0;
      for (const q of r.quantitaGrezza) {
        const v = leggiQuantitaFile(q, unita);
        if (v == null) continue;
        if (Number.isNaN(v)) { quantita = NaN; break; }
        quantita += v;
      }
      if (Number.isNaN(quantita)) { errore(`quantità "${testoCella(r.quantitaGrezza[0]).replace('.', ',')}" non valida per l'unità ${unita}${unita === 'pz' ? ' (i pezzi devono essere interi)' : ''}`); continue; }
    }

    // Prezzi. Senza "costo un" ma con "costo tot" e pezzi: costo = totale / pezzi.
    let valido = true;
    for (const campo of ['prezzoVendita', 'prezzoAcquisto']) {
      if (colonne[campo] === undefined) continue;
      const prezzo = leggiPrezzoFile(cella(campo));
      if (Number.isNaN(prezzo)) { errore(`prezzo "${val(campo)}" non valido`); valido = false; break; }
      if (prezzo == null) continue; // vuoto: non si tocca
      dati[campo] = prezzo;
    }
    if (!valido) continue;
    if (dati.prezzoAcquisto == null && colonne.costoTotale !== undefined && quantita > 0 && !r.righeUnite.length) {
      const totale = leggiPrezzoFile(cella('costoTotale'));
      if (totale > 0) dati.prezzoAcquisto = Math.round(totale / (quantita / infoUnita(unita).fattore));
    }

    for (const campo of ['sogliaMinima', 'passo']) {
      if (val(campo) === undefined || val(campo) === '') continue;
      const q = leggiQuantitaFile(cella(campo), unita);
      if (Number.isNaN(q) || q < 0) { errore(`${campo === 'passo' ? 'passo' : 'scorta minima'} "${val(campo)}" non valida`); valido = false; break; }
      if (campo === 'passo' && q === 0) continue;
      dati[campo] = q;
    }
    if (!valido) continue;

    const righeTesto = r.righeUnite.length ? `righe ${[numero, ...r.righeUnite].join(', ')}` : `riga ${numero}`;

    if (!esistente) {
      if (!dati.nome) { errore(`il codice ${ean} non è in magazzino e manca la descrizione`); continue; }
      if (!dati.passo) dati.passo = infoUnita(unita).passo;
      if (dati.prezzoVendita == null) risultato.senzaPrezzo++;
      risultato.nuovi.push({ dati, quantita: quantita ?? 0, riga: numero, righeTesto });
      continue;
    }

    // Esistente: cosa cambia davvero? (il nome non si sovrascrive se
    // differisce solo per maiuscole: chi l'ha sistemato a mano lo tiene)
    if (dati.nome && normalizza(dati.nome) === normalizza(esistente.nome)) delete dati.nome;
    // Riconosciuto dalla descrizione e senza codice nel file: il codice che ha resta.
    if (dati.ean === null && esistente.ean) delete dati.ean;
    const cambiaAnagrafica = Object.entries(dati).some(([k, v]) => (esistente[k] ?? null) !== (v ?? null)
      && !(k === 'codiceArticolo' && !v && !esistente[k]));
    const cambiaQuantita = quantita !== undefined && quantita !== esistente.quantita;
    if (!cambiaAnagrafica && !cambiaQuantita) { risultato.uguali++; continue; }
    risultato.aggiornati.push({
      id: esistente.id, nome: esistente.nome, dati: cambiaAnagrafica ? dati : null,
      quantita: cambiaQuantita ? quantita : undefined, prima: esistente.quantita,
      unita: esistente.unita, riga: numero, righeTesto,
    });
  }

  return risultato;
}

/**
 * Esegue le operazioni preparate da analizzaFile().
 * Aspetta la conferma del server per ognuna (serve la connessione).
 * @param {(fatti: number, totale: number) => void} avanzamento
 * @param {{ricarico?: number}} opzioni ricarico in % per i prodotti nuovi senza prezzo di vendita
 * @returns {Promise<{riusciti: number, falliti: number}>}
 */
export async function eseguiImportazione({ nuovi, aggiornati }, avanzamento, { ricarico = 0 } = {}) {
  const nota = 'Importazione da file';
  const lavori = [
    ...nuovi.map((n) => async () => {
      const dati = { ...n.dati };
      if (dati.prezzoVendita == null) dati.prezzoVendita = prezzoConRicarico(dati.prezzoAcquisto, ricarico) ?? 0;
      return prodotti.crea(dati, n.quantita).conferma;
    }),
    ...aggiornati.map((a) => async () => {
      const esiti = [];
      if (a.dati) esiti.push(prodotti.aggiorna(a.id, a.dati) ?? true);
      if (a.quantita !== undefined) esiti.push(rettificaA(a.id, a.quantita, nota) ?? true);
      return (await Promise.all(esiti)).every(Boolean);
    }),
  ];
  let fatti = 0;
  let riusciti = 0;
  const totale = lavori.length;

  // 4 alla volta: abbastanza veloce, senza sovraccaricare il telefono.
  const coda = [...lavori];
  const lavoratore = async () => {
    while (coda.length) {
      const lavoro = coda.shift();
      if (await lavoro().catch(() => false)) riusciti++;
      avanzamento?.(++fatti, totale);
    }
  };
  await Promise.all([lavoratore(), lavoratore(), lavoratore(), lavoratore()]);
  return { riusciti, falliti: totale - riusciti };
}

// ---------------------------------------------------------------------
//  ESPORTAZIONE
// ---------------------------------------------------------------------

function righeProdotti(conArchiviati) {
  return prodotti.tutti({ archiviati: conArchiviati })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
    .map((p) => [
      p.nome, p.ean ?? '', p.codiceArticolo ?? '', p.categoria, euroSemplice(p.prezzoVendita), euroSemplice(p.prezzoAcquisto),
      formattaQuantita(p.quantita, p.unita, false), p.unita,
      p.sogliaMinima ? formattaQuantita(p.sogliaMinima, p.unita, false) : '',
      formattaQuantita(p.passo, p.unita, false), p.fornitore, p.note,
    ]);
}

export function esportaCsv(conArchiviati = false) {
  const righe = [INTESTAZIONI, ...righeProdotti(conArchiviati)];
  scaricaFile(creaCsv(righe), `prodotti-${dataPerFile()}.csv`, 'text/csv;charset=utf-8');
}

export async function esportaExcel(conArchiviati = false) {
  const XLSX = await caricaSheetJs();
  // In Excel mettiamo numeri veri (non testo) per prezzi e quantità.
  const righe = prodotti.tutti({ archiviati: conArchiviati })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
    .map((p) => {
      const f = infoUnita(p.unita).fattore;
      return [
        p.nome, p.ean ?? '', p.codiceArticolo ?? '', p.categoria, p.prezzoVendita / 100,
        p.prezzoAcquisto == null ? '' : p.prezzoAcquisto / 100,
        p.quantita / f, p.unita, p.sogliaMinima ? p.sogliaMinima / f : '', p.passo / f,
        p.fornitore, p.note,
      ];
    });
  const foglio = XLSX.utils.aoa_to_sheet([INTESTAZIONI, ...righe]);
  // Il codice a barre come testo, così Excel non lo trasforma in 5,9E+12.
  righe.forEach((r, i) => {
    const cella = foglio[XLSX.utils.encode_cell({ r: i + 1, c: 1 })];
    if (cella) { cella.t = 's'; cella.v = String(r[1]); }
  });
  foglio['!cols'] = [{ wch: 34 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 30 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, foglio, 'Prodotti');
  XLSX.writeFile(libro, `prodotti-${dataPerFile()}.xlsx`);
}

/**
 * Backup completo in un file JSON: prodotti (anche archiviati) e, a
 * scelta, foto e storico movimenti. Foto e movimenti costano letture.
 */
export async function backupCompleto({ conFoto, conMovimenti }, avanzamento) {
  const lista = prodotti.tutti({ archiviati: true });
  const backup = {
    app: 'Gestionale Bottega',
    formato: 1,
    creatoIl: new Date().toISOString(),
    prodotti: lista,
  };

  if (conFoto) {
    backup.foto = {};
    const conFotoLista = lista.filter((p) => p.haFoto);
    let i = 0;
    for (const p of conFotoLista) {
      const f = await leggiFotoGrezza(p.id).catch(() => null);
      if (f) backup.foto[p.id] = f;
      avanzamento?.(`Foto ${++i} di ${conFotoLista.length}`);
    }
  }

  if (conMovimenti) {
    backup.movimenti = [];
    let cursore = null;
    for (;;) {
      const r = await cercaMovimenti({ cursore, quanti: 500 });
      backup.movimenti.push(...r.righe);
      avanzamento?.(`Movimenti: ${backup.movimenti.length}`);
      if (r.finito) break;
      cursore = r.cursore;
    }
  }

  scaricaFile(JSON.stringify(backup), `backup-bottega-${dataPerFile()}.json`, 'application/json');
  localStorage.setItem('bottega.ultimoBackup', String(Date.now()));
}

export function ultimoBackup() {
  const v = Number(localStorage.getItem('bottega.ultimoBackup'));
  return v || null;
}
