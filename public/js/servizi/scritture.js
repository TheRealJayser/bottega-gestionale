// =====================================================================
//  Invio delle scritture a Firestore.
//
//  IMPORTANTE: senza rete, la promessa di batch.commit() resta in
//  attesa finché la rete non torna. Per questo l'interfaccia NON la
//  aspetta: l'operazione viene applicata subito in locale e inviata in
//  sottofondo. Qui teniamo il conto delle operazioni in attesa e
//  avvisiamo l'interfaccia se il server ne rifiuta qualcuna.
// =====================================================================

const ascoltatoriStato = new Set();
const ascoltatoriErrori = new Set();
let inAttesa = 0;

/** Chiama `cb({ inAttesa })` quando cambia il numero di operazioni in attesa. */
export function suStatoScritture(cb) {
  ascoltatoriStato.add(cb);
  cb({ inAttesa });
  return () => ascoltatoriStato.delete(cb);
}

/** Chiama `cb(messaggio)` quando un'operazione viene rifiutata. */
export function suErroreScrittura(cb) {
  ascoltatoriErrori.add(cb);
  return () => ascoltatoriErrori.delete(cb);
}

export function scrittureInAttesa() {
  return inAttesa;
}

function notificaStato() {
  ascoltatoriStato.forEach((cb) => cb({ inAttesa }));
}

/**
 * Invia un batch. Restituisce una promessa che diventa true quando il
 * server conferma, false se rifiuta (non genera mai eccezioni). Chi
 * vuole può aspettarla (es. l'importazione); gli errori vengono
 * comunque segnalati all'interfaccia.
 * @param {import('firebase/firestore').WriteBatch} batch
 * @param {string} descrizione es. "Scarico di Pecorino"
 * @param {() => void} [annulla] da chiamare se il server rifiuta
 */
export function invia(batch, descrizione, annulla) {
  inAttesa++;
  notificaStato();
  return batch.commit()
    .then(() => true)
    .catch((err) => {
      console.error(descrizione, err);
      annulla?.();
      const motivo = err?.code === 'permission-denied'
        ? 'operazione non permessa (dati non validi o codice già usato)'
        : (err?.message ?? 'errore sconosciuto');
      ascoltatoriErrori.forEach((cb) => cb(`${descrizione}: NON salvato — ${motivo}`));
      return false;
    })
    .finally(() => {
      inAttesa--;
      notificaStato();
    });
}
