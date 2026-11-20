// =====================================================================
//  ALTRO: account, installazione, importazione/esportazione, backup,
//  stato della sincronizzazione.
// =====================================================================

import { h, riempi, avviso, conferma, apriFinestra } from './dom.js';
import { icona } from './icone.js';
import { esci, inviaRecuperoPassword } from '../servizi/auth.js';
import { profiloCorrente } from '../servizi/utenti.js';
import * as prodotti from '../servizi/prodotti.js';
import { scrittureInAttesa } from '../servizi/scritture.js';
import {
  analizzaFile, backupCompleto, eseguiImportazione, esportaCsv, esportaExcel, ultimoBackup,
} from '../servizi/importa-esporta.js';
import { data } from '../util/formato.js';
import { VERSIONE_APP, promptInstallazione } from './installazione.js';

export function mostraAltro(contenitore) {
  const profilo = profiloCorrente();
  const statoSync = h('p', { class: 'nota' });
  const aggiornaStato = () => {
    const s = prodotti.statoSincronizzazione();
    const attesa = scrittureInAttesa();
    statoSync.textContent = `${s.numero} prodotti sul dispositivo · ` +
      (s.errore ? s.errore : (navigator.onLine ? 'collegato' : 'senza connessione')) +
      (attesa ? ` · ${attesa} operazioni in attesa di invio` : '');
  };

  // ---------- Importazione ----------
  const inputFile = h('input', {
    type: 'file', hidden: true,
    accept: '.csv,.txt,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    onchange: async () => {
      const file = inputFile.files?.[0];
      inputFile.value = '';
      if (file) await importa(file);
    },
  });

  async function importa(file) {
    if (!navigator.onLine) {
      avviso('Per importare serve la connessione a Internet.', 'errore');
      return;
    }
    let analisi;
    try {
      avviso('Lettura del file…', 'info', { durata: 1500 });
      await prodotti.attendiPronto();
      analisi = await analizzaFile(file);
    } catch (err) {
      avviso(err.message, 'errore');
      return;
    }
    const { nuovi, aggiornati, uguali, errori } = analisi;
    const totale = nuovi.length + aggiornati.length;
    const scelta = await apriFinestra({
      titolo: 'Importazione',
      larga: true,
      corpo: [
        h('ul', { class: 'riepilogo-import' },
          h('li', {}, h('strong', {}, nuovi.length), ' prodotti nuovi'),
          h('li', {}, h('strong', {}, aggiornati.length), ' prodotti da aggiornare'),
          h('li', {}, h('strong', {}, uguali), ' già uguali (ignorati)'),
          h('li', { class: errori.length ? 'errore' : '' }, h('strong', {}, errori.length), ' righe con errori (ignorate)'),
        ),
        aggiornati.some((a) => a.quantita !== undefined) && h('p', { class: 'nota' },
          'Le quantità diverse verranno corrette con una rettifica (registrata nello storico).'),
        errori.length > 0 && h('details', {}, h('summary', {}, 'Vedi gli errori'),
          h('ul', { class: 'elenco-errori' }, errori.slice(0, 200).map((e) => h('li', {}, e)))),
        totale === 0 && h('p', {}, 'Non c\'è niente da importare.'),
      ],
      pulsanti: totale === 0
        ? [{ testo: 'Chiudi', valore: null, classe: 'primario' }]
        : [
          { testo: 'Annulla', valore: null, classe: 'secondario' },
          { testo: `Importa ${totale} prodotti`, valore: 'ok', classe: 'primario' },
        ],
    });
    if (scelta !== 'ok') return;

    const barra = h('progress', { max: totale, value: 0 });
    const testo = h('p', {}, `0 di ${totale}`);
    const finestra = h('div', { class: 'avanzamento' }, h('p', {}, 'Importazione in corso, non chiudere l\'app…'), barra, testo);
    document.body.append(finestra);
    const esito = await eseguiImportazione(analisi, (fatti) => {
      barra.value = fatti;
      testo.textContent = `${fatti} di ${totale}`;
    });
    finestra.remove();
    avviso(
      esito.falliti
        ? `Importati ${esito.riusciti} prodotti, ${esito.falliti} non riusciti.`
        : `Importazione completata: ${esito.riusciti} prodotti.`,
      esito.falliti ? 'errore' : 'ok',
      { durata: 8000 },
    );
  }

  // ---------- Backup ----------
  async function backup() {
    const conFoto = h('input', { type: 'checkbox', checked: true });
    const conMovimenti = h('input', { type: 'checkbox' });
    const numFoto = prodotti.tutti({ archiviati: true }).filter((p) => p.haFoto).length;
    const ok = await apriFinestra({
      titolo: 'Backup completo',
      corpo: [
        h('p', {}, 'Scarica un file con tutti i prodotti (anche gli archiviati). Conservalo su un altro dispositivo o in cloud.'),
        h('label', { class: 'spunta' }, conFoto, ` Includi le foto (${numFoto})`),
        h('label', { class: 'spunta' }, conMovimenti, ' Includi lo storico movimenti'),
        h('p', { class: 'nota' }, 'Foto e movimenti consumano letture del piano gratuito (una per foto e una per movimento): includili ogni tanto, non tutti i giorni.'),
      ],
      pulsanti: [
        { testo: 'Annulla', valore: false, classe: 'secondario' },
        { testo: 'Scarica backup', valore: true, classe: 'primario' },
      ],
    });
    if (!ok) return;
    const testo = h('p', {}, 'Preparazione…');
    const pannello = h('div', { class: 'avanzamento' }, h('p', {}, 'Backup in corso…'), testo);
    document.body.append(pannello);
    try {
      await backupCompleto({ conFoto: conFoto.checked, conMovimenti: conMovimenti.checked },
        (t) => { testo.textContent = t; });
      avviso('Backup scaricato', 'ok');
      disegna();
    } catch (err) {
      avviso('Backup non riuscito: ' + err.message, 'errore');
    } finally {
      pannello.remove();
    }
  }

  // ---------- Disegno ----------
  function disegna() {
    const ultimo = ultimoBackup();
    const giorniBackup = ultimo ? Math.floor((Date.now() - ultimo) / 86_400_000) : null;
    const iPhone = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

    riempi(contenitore,
      h('section', { class: 'vista vista-altro' },
        h('header', { class: 'scheda-testa' }, h('h1', {}, 'Altro')),

        h('div', { class: 'riquadro' },
          h('h2', {}, icona('utente'), ' Account'),
          h('p', {}, h('strong', {}, profilo?.nome ?? ''), h('br'), h('small', {}, profilo?.email ?? '')),
          h('div', { class: 'riga-pulsanti' },
            h('button', { class: 'pulsante secondario', onclick: async () => {
              try {
                await inviaRecuperoPassword(profilo.email);
                avviso(`Email per cambiare la password inviata a ${profilo.email}`, 'ok', { durata: 8000 });
              } catch (err) { avviso(err.message, 'errore'); }
            } }, 'Cambia password'),
            h('button', { class: 'pulsante secondario', onclick: async () => {
              const attesa = scrittureInAttesa();
              const msg = attesa
                ? `Ci sono ${attesa} operazioni non ancora inviate al server. Se esci ora potrebbero andare perse. Uscire comunque?`
                : 'Vuoi uscire dal tuo account su questo dispositivo?';
              if (await conferma(msg, { titolo: 'Esci', testoOk: 'Esci', pericolo: attesa > 0 })) esci();
            } }, icona('esci'), 'Esci'),
          ),
        ),

        !installata && h('div', { class: 'riquadro' },
          h('h2', {}, 'Installa come app'),
          promptInstallazione()
            ? h('button', { class: 'pulsante primario', onclick: async () => {
              const p = promptInstallazione();
              p.prompt();
              await p.userChoice;
              disegna();
            } }, 'Installa sul dispositivo')
            : h('p', { class: 'nota' }, iPhone
              ? 'Su iPhone: apri questa pagina con Safari, tocca il pulsante Condividi (il quadrato con la freccia) e scegli "Aggiungi alla schermata Home".'
              : 'Dal menu del browser scegli "Installa app" o "Aggiungi a schermata Home".'),
        ),

        h('div', { class: 'riquadro' },
          h('h2', {}, 'Importa prodotti'),
          h('p', { class: 'nota' }, 'File CSV o Excel con le colonne: Nome, Codice, Categoria, Prezzo vendita, Prezzo acquisto, Quantità, Unità (pz/kg/l), Scorta minima, Passo, Fornitore, Note. Bastano Nome (o Codice) e le colonne che vuoi aggiornare. I prodotti già presenti vengono riconosciuti dal codice a barre.'),
          inputFile,
          h('div', { class: 'riga-pulsanti' },
            h('button', { class: 'pulsante primario', onclick: () => inputFile.click() }, icona('carica'), 'Scegli file'),
            h('button', { class: 'pulsante-link', onclick: () => esportaCsv() }, 'Scarica un modello (l\'elenco attuale)'),
          ),
        ),

        h('div', { class: 'riquadro' },
          h('h2', {}, 'Esporta e backup'),
          h('div', { class: 'riga-pulsanti' },
            h('button', { class: 'pulsante secondario', onclick: () => esportaCsv() }, icona('scarica'), 'CSV'),
            h('button', { class: 'pulsante secondario', onclick: () => esportaExcel().catch((e) => avviso('Esportazione Excel non riuscita: ' + e.message, 'errore')) }, icona('scarica'), 'Excel'),
            h('button', { class: 'pulsante primario', onclick: backup }, icona('archivio'), 'Backup completo'),
          ),
          h('p', { class: `nota ${giorniBackup == null || giorniBackup > 30 ? 'errore' : ''}` },
            ultimo ? `Ultimo backup da questo dispositivo: ${data(ultimo)}` : 'Nessun backup fatto da questo dispositivo.',
            ' Il piano gratuito di Firebase non fa backup automatici: scaricane uno almeno una volta al mese.'),
        ),

        h('div', { class: 'riquadro' },
          h('h2', {}, icona('sincro'), ' Sincronizzazione'),
          statoSync,
          h('button', { class: 'pulsante-link', onclick: async () => {
            if (!navigator.onLine) { avviso('Serve la connessione a Internet.', 'errore'); return; }
            if (await conferma('Riscarica tutto l\'elenco dal server. Serve solo se qualcosa sembra non aggiornato.', { titolo: 'Risincronizza', testoOk: 'Risincronizza' })) {
              await prodotti.risincronizzaTutto();
              avviso('Elenco riscaricato', 'ok');
            }
          } }, 'Risincronizza tutto'),
        ),

        h('p', { class: 'nota versione' }, `Gestionale Bottega · versione ${VERSIONE_APP}`),
      ),
    );
    aggiornaStato();
  }

  disegna();
  const smetti = prodotti.suCambio(aggiornaStato);
  return () => smetti();
}
