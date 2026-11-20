// =====================================================================
//  IMPORTAZIONE ed ESPORTAZIONE (CSV ed Excel) e BACKUP COMPLETO.
//
//  Colonne riconosciute (l'ordine non conta, maiuscole e accenti nemmeno):
//    Nome · Codice · Categoria · Prezzo vendita · Prezzo acquisto ·
//    Quantità · Unità · Scorta minima · Passo · Fornitore · Note
//  Le foto NON sono nei file CSV/Excel (solo nel backup completo).
// =====================================================================

import * as prodotti from './prodotti.js';
import { rettificaA, cercaMovimenti } from './movimenti.js';
import { leggiFotoGrezza } from './foto.js';
import { creaCsv, leggiCsv, scaricaFile } from '../util/csv.js';
import { dataPerFile, euroSemplice, leggiEuro } from '../util/formato.js';
import { formattaQuantita, infoUnita, leggiQuantita } from '../util/unita.js';
import { codiceAmmesso, pulisciCodice } from '../util/codici.js';
import { normalizza } from '../util/testo.js';

const URL_SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const INTESTAZIONI = ['Nome', 'Codice', 'Categoria', 'Prezzo vendita', 'Prezzo acquisto',
  'Quantità', 'Unità', 'Scorta minima', 'Passo', 'Fornitore', 'Note'];

const ALIAS = {
  nome: ['nome', 'prodotto', 'descrizione', 'articolo'],
  ean: ['codice', 'ean', 'codiceabarre', 'codicebarre', 'barcode', 'ean13'],
  categoria: ['categoria', 'reparto'],
  prezzoVendita: ['prezzovendita', 'prezzo', 'prezzodivendita'],
  prezzoAcquisto: ['prezzoacquisto', 'prezzodiacquisto', 'costo'],
  quantita: ['quantita', 'qta', 'giacenza'],
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

/** Legge un file CSV o Excel e restituisce le righe come array di array di testo. */
async function leggiTabella(file) {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const XLSX = await caricaSheetJs();
    const libro = XLSX.read(await file.arrayBuffer());
    const foglio = libro.Sheets[libro.SheetNames[0]];
    return XLSX.utils.sheet_to_json(foglio, { header: 1, raw: true, defval: '' })
      .map((r) => r.map((v) => (v == null ? '' : String(v))))
      .filter((r) => r.some((v) => v.trim() !== ''));
  }
  return leggiCsv(await file.text());
}

/**
 * Analizza un file e prepara le operazioni, senza scrivere nulla.
 * @returns {Promise<{nuovi: any[], aggiornati: any[], uguali: number, errori: string[], colonne: string[]}>}
 */
export async function analizzaFile(file) {
  const tabella = await leggiTabella(file);
  if (tabella.length < 2) throw new Error('Il file è vuoto o ha solo l\'intestazione.');

  // Quale colonna corrisponde a quale campo.
  const colonne = {};
  tabella[0].forEach((titolo, i) => {
    const k = chiaveIntestazione(titolo);
    for (const [campo, alias] of Object.entries(ALIAS)) {
      if (alias.includes(k) && colonne[campo] === undefined) colonne[campo] = i;
    }
  });
  if (colonne.nome === undefined && colonne.ean === undefined) {
    throw new Error('Non trovo né la colonna "Nome" né la colonna "Codice". Controlla la prima riga del file.');
  }

  const risultato = { nuovi: [], aggiornati: [], uguali: 0, errori: [], colonne: Object.keys(colonne) };
  const codiciVisti = new Set();
  const perNome = new Map(prodotti.tutti({ archiviati: true }).map((p) => [normalizza(p.nome), p]));

  tabella.slice(1).forEach((riga, indice) => {
    const numero = indice + 2; // numero di riga come in Excel
    const val = (campo) => (colonne[campo] === undefined ? undefined : String(riga[colonne[campo]] ?? '').trim());
    const errore = (testo) => risultato.errori.push(`Riga ${numero}: ${testo}`);

    // Codice
    const ean = val('ean') !== undefined ? (pulisciCodice(val('ean')) || null) : undefined;
    if (ean && !codiceAmmesso(ean)) return errore(`codice "${ean}" non valido`);
    if (ean && codiciVisti.has(ean)) return errore(`codice ${ean} ripetuto nel file`);
    if (ean) codiciVisti.add(ean);

    // Prodotto esistente: per codice, altrimenti per nome identico.
    let esistente = ean ? prodotti.perCodiceABarre(ean) : null;
    if (!esistente && !ean && val('nome')) esistente = perNome.get(normalizza(val('nome'))) ?? null;

    // Unità (serve per leggere le quantità)
    let unita = esistente?.unita ?? 'pz';
    if (val('unita') !== undefined && val('unita') !== '') {
      const u = UNITA_TESTO[normalizza(val('unita')).replace(/\./g, '')];
      if (!u) return errore(`unità "${val('unita')}" non riconosciuta (usa pz, kg o l)`);
      if (esistente && u !== esistente.unita && esistente.quantita !== 0) {
        return errore(`non si può cambiare l'unità di "${esistente.nome}" con quantità diversa da zero`);
      }
      unita = u;
    }

    const dati = {};
    if (val('nome') !== undefined && val('nome') !== '') dati.nome = val('nome').slice(0, 200);
    if (ean !== undefined) dati.ean = ean;
    if (val('categoria') !== undefined) dati.categoria = val('categoria').slice(0, 100);
    if (val('fornitore') !== undefined) dati.fornitore = val('fornitore').slice(0, 200);
    if (val('note') !== undefined) dati.note = val('note').slice(0, 2000);
    if (val('unita') !== undefined) dati.unita = unita;

    for (const campo of ['prezzoVendita', 'prezzoAcquisto']) {
      if (val(campo) === undefined) continue;
      const prezzo = leggiEuro(val(campo));
      if (Number.isNaN(prezzo)) return errore(`prezzo "${val(campo)}" non valido`);
      if (campo === 'prezzoVendita' && prezzo == null) continue; // vuoto: non si tocca
      dati[campo] = prezzo;
    }
    for (const campo of ['sogliaMinima', 'passo']) {
      if (val(campo) === undefined || val(campo) === '') continue;
      const q = leggiQuantita(val(campo), unita);
      if (Number.isNaN(q) || q < 0) return errore(`${campo === 'passo' ? 'passo' : 'scorta minima'} "${val(campo)}" non valida`);
      if (campo === 'passo' && q === 0) continue;
      dati[campo] = q;
    }
    let quantita;
    if (val('quantita') !== undefined && val('quantita') !== '') {
      quantita = leggiQuantita(val('quantita'), unita);
      if (Number.isNaN(quantita)) return errore(`quantità "${val('quantita')}" non valida per l'unità ${unita}`);
    }

    if (!esistente) {
      if (!dati.nome) return errore('manca il nome del prodotto');
      if (dati.prezzoVendita == null) dati.prezzoVendita = 0;
      if (!dati.passo) dati.passo = infoUnita(unita).passo;
      risultato.nuovi.push({ dati, quantita: quantita ?? 0, riga: numero });
      return;
    }

    // Esistente: cosa cambia davvero?
    const cambiaAnagrafica = Object.entries(dati).some(([k, v]) => (esistente[k] ?? null) !== (v ?? null));
    const cambiaQuantita = quantita !== undefined && quantita !== esistente.quantita;
    if (!cambiaAnagrafica && !cambiaQuantita) { risultato.uguali++; return; }
    risultato.aggiornati.push({
      id: esistente.id, nome: esistente.nome, dati: cambiaAnagrafica ? dati : null,
      quantita: cambiaQuantita ? quantita : undefined, riga: numero,
    });
  });

  return risultato;
}

/**
 * Esegue le operazioni preparate da analizzaFile().
 * Aspetta la conferma del server per ognuna (serve la connessione).
 * @param {(fatti: number, totale: number) => void} avanzamento
 * @returns {Promise<{riusciti: number, falliti: number}>}
 */
export async function eseguiImportazione({ nuovi, aggiornati }, avanzamento) {
  const lavori = [
    ...nuovi.map((n) => async () => prodotti.crea(n.dati, n.quantita).conferma),
    ...aggiornati.map((a) => async () => {
      const esiti = [];
      if (a.dati) esiti.push(prodotti.aggiorna(a.id, a.dati) ?? true);
      if (a.quantita !== undefined) esiti.push(rettificaA(a.id, a.quantita, 'Importazione da file') ?? true);
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
      p.nome, p.ean ?? '', p.categoria, euroSemplice(p.prezzoVendita), euroSemplice(p.prezzoAcquisto),
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
        p.nome, p.ean ?? '', p.categoria, p.prezzoVendita / 100,
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
  foglio['!cols'] = [{ wch: 34 }, { wch: 15 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
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
