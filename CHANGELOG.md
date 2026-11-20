# Novità

Tutti gli aggiornamenti del Gestionale Bottega, dal più recente.

## Versione 1.1.0 — 20 novembre 2026

### Nuovo
- **Import del file Excel dell'inventario** così com'è, con le colonne `ean · codice · descrizione · pezzi · costo un · costo tot`:
  - i prodotti già in magazzino vengono riconosciuti dall'EAN e i loro pezzi aggiornati con un conteggio (registrato nello storico); quelli nuovi vengono inseriti;
  - se lo stesso EAN compare in più righe, i pezzi vengono **sommati**;
  - le righe vuote o di totale vengono saltate;
  - il *costo un* diventa il prezzo di acquisto (arrotondato al centesimo); se manca, si calcola da *costo tot* ÷ *pezzi*;
  - per i prodotti nuovi, che nel file non hanno il prezzo di vendita, si può indicare un **ricarico in %** sul costo (arrotondato ai 5 centesimi), oppure lasciarli "Prezzo da impostare";
  - prima di importare compare un riepilogo con l'anteprima dei prodotti.
- **Codice articolo** del fornitore (la colonna "codice" dell'inventario): nella scheda, nel modulo, nella ricerca e negli export.
- I prodotti senza prezzo di vendita mostrano **"Prezzo da impostare"** invece di 0,00 €.

### Grafica nuova in stile iPhone
- Colori, caratteri e materiali traslucidi come in iOS, con tema chiaro e scuro.
- Titoli grandi che si rimpiccioliscono nella barra in alto scorrendo.
- Elenchi raggruppati con freccia, interruttori iOS, controlli segmentati.
- Finestre come **fogli che salgono dal basso** (si chiudono anche trascinandole giù); sul computer finestre centrate.
- **Animazioni**: passaggio tra le schermate (avanti e indietro come su iPhone), quantità che "rimbalza" quando cambia, notifiche dall'alto, pulsanti "a molla".
- Sul computer: barra laterale come su iPad e Mac.
- Chi ha attivato "Riduci movimento" sul telefono non vede le animazioni.

### Da sapere
- Le **regole del database sono cambiate** (per il codice articolo): pubblicare con `firebase deploy` (tutto), non solo `--only hosting`.

## Versione 1.0.1 — 20 novembre 2026

### Corretto
- **Storico su iPhone:** i campi *Dal* e *Al* uscivano dal riquadro e, quando erano vuoti, non mostravano niente. Ora sono affiancati, della stessa larghezza e altezza degli altri campi, e da vuoti mostrano la scritta **"Scegli…"**.

## Versione 1.0.0 — 20 novembre 2026

Prima versione pubblicata su Firebase (`bottega-gabriele.web.app`).

- Accesso con email e password; possono entrare solo le persone abilitate.
- Elenco del magazzino con ricerca per nome o codice, filtro per categoria, ordinamento e prodotti archiviati.
- Prodotti a pezzi, a chili e a litri, con prezzo di vendita e di acquisto, scorta minima, fornitore, note e foto.
- Scheda prodotto con pulsanti rapidi **−/+**, carico, scarico e conteggio.
- Lettura dei codici a barre con la fotocamera (anche su iPhone) e con lettore USB/Bluetooth; codici interni per i prodotti senza EAN.
- Elenco **Da riordinare** diviso per fornitore, da condividere o esportare in CSV.
- **Storico movimenti** con filtri per prodotto, persona e periodo, ed export CSV.
- Storico dei prezzi e registro delle modifiche di ogni prodotto.
- Import da CSV ed Excel, export in CSV ed Excel, backup completo con foto e movimenti.
- Funziona senza rete: le operazioni partono quando la connessione torna.
- Installabile sulla schermata Home e sul computer, tema chiaro e scuro.
- Script `scripts/abilita-utente.sh` per abilitare o disattivare una persona.
