// =====================================================================
//  ALTRO: account, installazione, importazione/esportazione, backup,
//  stato della sincronizzazione.
// =====================================================================

import { h, riempi, avviso, conferma, apriFinestra, erroreCampo } from './dom.js';
import { icona } from './icone.js';
import { esci, inviaRecuperoPassword } from '../servizi/auth.js';
import { profiloCorrente } from '../servizi/utenti.js';
import * as prodotti from '../servizi/prodotti.js';
import { scrittureInAttesa } from '../servizi/scritture.js';
import {
  analizzaFile, backupCompleto, eseguiImportazione, esportaCsv, esportaExcel, prezzoConRicarico, ultimoBackup,
} from '../servizi/importa-esporta.js';
import { cancellaTuttiIDati } from '../servizi/azzeramento.js';
import { data, euro } from '../util/formato.js';
import { formattaQuantita } from '../util/unita.js';
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
    const { nuovi, aggiornati, uguali, errori, unite, saltate, senzaPrezzo } = analisi;
    const totale = nuovi.length + aggiornati.length;

    // Ricarico per i prodotti nuovi senza prezzo di vendita (il file
    // dell'inventario ha solo il costo).
    const ricarico = h('input', {
      type: 'text', inputmode: 'decimal', placeholder: 'es. 40', autocomplete: 'off',
      value: localStorage.getItem('bottega.ricaricoImport') ?? '',
    });
    const esempioRicarico = h('small', { class: 'aiuto' });
    const leggiRicarico = () => {
      const v = parseFloat(String(ricarico.value).replace(',', '.'));
      return v > 0 && v < 1000 ? v : 0;
    };
    const conCosto = nuovi.find((n) => n.dati.prezzoVendita == null && n.dati.prezzoAcquisto != null);
    const aggiornaEsempio = () => {
      const r = leggiRicarico();
      esempioRicarico.textContent = !r
        ? 'Lascia vuoto per mettere i prezzi di vendita a mano: i prodotti compariranno come "Prezzo da impostare".'
        : conCosto
          ? `Esempio: ${conCosto.dati.nome} costa ${euro(conCosto.dati.prezzoAcquisto)} → in vendita a ${euro(prezzoConRicarico(conCosto.dati.prezzoAcquisto, r))} (arrotondato ai 5 centesimi).`
          : '';
    };
    ricarico.addEventListener('input', aggiornaEsempio);
    aggiornaEsempio();

    const voce = (numero, testo, classe = '') => h('li', { class: classe },
      h('span', {}, testo), h('strong', {}, numero));
    const anteprima = [
      ...nuovi.slice(0, 4).map((n) => h('li', {},
        h('span', { class: 'etichetta-nuovo' }, 'Nuovo'),
        h('span', { class: 'anteprima-nome' }, n.dati.nome),
        h('span', { class: 'anteprima-dato' }, formattaQuantita(n.quantita, n.dati.unita ?? 'pz')))),
      ...aggiornati.slice(0, 3).map((a) => h('li', {},
        h('span', { class: 'etichetta-agg' }, 'Agg.'),
        h('span', { class: 'anteprima-nome' }, a.nome),
        h('span', { class: 'anteprima-dato' }, a.quantita !== undefined
          ? `${formattaQuantita(a.prima, a.unita, false)} → ${formattaQuantita(a.quantita, a.unita)}`
          : 'dati'))),
    ];

    const scelta = await apriFinestra({
      titolo: 'Importazione',
      larga: true,
      corpo: [
        h('p', { class: 'nota' }, file.name),
        h('ul', { class: 'riepilogo-import' },
          voce(nuovi.length, 'Prodotti nuovi'),
          voce(aggiornati.length, 'Prodotti da aggiornare'),
          voce(uguali, 'Già uguali (ignorati)'),
          unite > 0 && voce(unite, 'Righe doppie unite (pezzi sommati)'),
          saltate > 0 && voce(saltate, 'Righe vuote o di totale (saltate)'),
          errori.length > 0 && voce(errori.length, 'Righe con errori (ignorate)', 'errore'),
        ),
        anteprima.length > 0 && h('div', {},
          h('p', { class: 'titoletto' }, 'Anteprima'),
          h('ul', { class: 'anteprima-import' }, anteprima)),
        senzaPrezzo > 0 && h('div', { class: 'campo riquadro-ricarico' },
          h('label', {}, `Prezzo di vendita per ${senzaPrezzo} prodotti nuovi`),
          h('div', { class: 'con-unita' }, h('span', { class: 'prefisso' }, 'Costo +'), ricarico, h('span', {}, '%')),
          esempioRicarico),
        aggiornati.some((a) => a.quantita !== undefined) && h('p', { class: 'nota' },
          'Le quantità diverse verranno corrette con un conteggio (registrato nello storico).'),
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
    const percentuale = leggiRicarico();
    if (senzaPrezzo > 0) localStorage.setItem('bottega.ricaricoImport', percentuale ? String(percentuale).replace('.', ',') : '');

    const barra = h('progress', { max: totale, value: 0 });
    const testo = h('p', {}, `0 di ${totale}`);
    const finestra = h('div', { class: 'avanzamento' }, h('p', {}, 'Importazione in corso, non chiudere l\'app…'), barra, testo);
    document.body.append(finestra);
    const esito = await eseguiImportazione(analisi, (fatti) => {
      barra.value = fatti;
      testo.textContent = `${fatti} di ${totale}`;
    }, { ricarico: percentuale });
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

  // ---------- Cancella tutti i dati (doppia conferma) ----------
  async function cancellaTutto() {
    if (!navigator.onLine) { avviso('Per cancellare i dati serve la connessione a Internet.', 'errore'); return; }
    if (scrittureInAttesa()) { avviso('Ci sono operazioni non ancora inviate: aspetta che partano e riprova.', 'errore'); return; }
    const lista = prodotti.tutti({ archiviati: true });

    // Prima conferma: cosa si perde.
    const prima = await apriFinestra({
      titolo: 'Cancellare tutti i dati?',
      corpo: [
        h('p', {}, 'Verranno cancellati dal server, per tutti i dispositivi:'),
        h('ul', { class: 'riepilogo-import' },
          h('li', {}, h('span', {}, 'Prodotti (anche archiviati)'), h('strong', {}, lista.length)),
          h('li', {}, h('span', {}, 'Foto'), h('strong', {}, lista.filter((p) => p.haFoto).length)),
          h('li', {}, h('span', {}, 'Storico movimenti, prezzi e modifiche'), h('strong', {}, 'tutto')),
        ),
        h('p', {}, 'Restano solo gli account di chi usa l\'app.'),
        h('p', { class: 'nota errore' }, h('strong', {}, 'Non si può annullare.'), ' Se vuoi tenere una copia, scarica prima un backup.'),
      ],
      pulsanti: [
        { testo: 'Annulla', valore: null, classe: 'secondario' },
        { testo: 'Continua', valore: 'ok', classe: 'pericolo primario' },
      ],
    });
    if (prima !== 'ok') return;

    // Seconda conferma: scrivere la parola.
    const parola = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'CANCELLA' });
    const seconda = await apriFinestra({
      titolo: 'Conferma definitiva',
      corpo: [
        h('p', {}, 'Per cancellare davvero tutto scrivi ', h('strong', {}, 'CANCELLA'), ' qui sotto.'),
        h('div', { class: 'campo' }, parola, h('small', { class: 'errore-campo' })),
      ],
      pulsanti: [
        { testo: 'Annulla', valore: null, classe: 'secondario' },
        {
          testo: 'Cancella tutto', valore: 'ok', classe: 'pericolo primario',
          prima: () => {
            if (parola.value.trim().toUpperCase() === 'CANCELLA') return true;
            erroreCampo(parola, 'Scrivi CANCELLA per confermare.');
            return false;
          },
        },
      ],
    });
    if (seconda !== 'ok') return;

    const testo = h('p', {}, 'Preparazione…');
    const barra = h('progress', { max: 1, value: 0 });
    const pannello = h('div', { class: 'avanzamento' }, h('p', {}, 'Cancellazione in corso, non chiudere l\'app…'), barra, testo);
    document.body.append(pannello);
    try {
      const quanti = await cancellaTuttiIDati((t, fatti, totale) => {
        testo.textContent = totale ? `${t} ${fatti} di ${totale}` : t;
        if (totale) { barra.max = totale; barra.value = fatti; }
      });
      avviso(`Dati cancellati (${quanti} documenti). Il magazzino è vuoto.`, 'ok', { durata: 8000 });
    } catch (err) {
      console.error(err);
      avviso('Cancellazione non completata: ' + (err?.code === 'permission-denied'
        ? 'permesso negato (le regole del database sono aggiornate?)' : err.message) + '. Puoi riprovare.', 'errore', { durata: 12000 });
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
          h('p', { class: 'nota' }, 'Va bene direttamente il file Excel dell\'inventario, con le colonne ean · codice · descrizione · pezzi · costo un · costo tot. I prodotti già presenti vengono riconosciuti dal codice EAN e i loro pezzi vengono aggiornati; quelli nuovi vengono inseriti.'),
          h('details', { class: 'nota' }, h('summary', {}, 'Altre colonne riconosciute'),
            h('p', {}, 'Nome, Codice articolo, Categoria, Prezzo vendita, Prezzo acquisto, Quantità, Unità (pz/kg/l), Scorta minima, Passo, Fornitore, Note. L\'ordine non conta e bastano Descrizione (o EAN) più le colonne da aggiornare.')),
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

        h('div', { class: 'riquadro zona-pericolosa' },
          h('h2', {}, 'Cancella tutti i dati'),
          h('p', { class: 'nota' }, 'Svuota il magazzino per tutti: prodotti, foto e storici. Utile per ripartire da zero, per esempio prima di importare l\'inventario. Chiede due conferme.'),
          h('button', { class: 'pulsante pericolo', onclick: cancellaTutto }, 'Cancella tutti i dati'),
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
