// =====================================================================
//  Piccoli strumenti per costruire l'interfaccia senza framework.
// =====================================================================

/**
 * Crea un elemento HTML.
 *   h('button', { class: 'grande', onclick: fai }, 'Salva')
 * Gli attributi "on..." diventano eventi; i figli possono essere testi,
 * elementi, array, null/false (ignorati).
 */
export function h(tag, attributi = {}, ...figli) {
  const el = document.createElement(tag);
  for (const [chiave, valore] of Object.entries(attributi ?? {})) {
    if (valore == null || valore === false) continue;
    if (chiave === 'class') el.className = valore;
    else if (chiave === 'dataset') Object.assign(el.dataset, valore);
    else if (chiave === 'style' && typeof valore === 'object') Object.assign(el.style, valore);
    else if (chiave.startsWith('on') && typeof valore === 'function') {
      el.addEventListener(chiave.slice(2).toLowerCase(), valore);
    } else if (['value', 'checked', 'selected', 'disabled', 'hidden'].includes(chiave)) {
      el[chiave] = valore;
    } else if (valore === true) el.setAttribute(chiave, '');
    else el.setAttribute(chiave, String(valore));
  }
  aggiungi(el, figli);
  return el;
}

export function aggiungi(el, figli) {
  for (const figlio of [figli].flat(Infinity)) {
    if (figlio == null || figlio === false) continue;
    el.append(figlio instanceof Node ? figlio : document.createTextNode(String(figlio)));
  }
  return el;
}

/** Sostituisce il contenuto di un elemento. */
export function riempi(el, ...figli) {
  el.replaceChildren();
  return aggiungi(el, figli);
}

/** Esegue `fn` al massimo una volta ogni `ms` millisecondi (ultima chiamata vince). */
export function rallenta(fn, ms = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** true su schermi larghi (computer). */
export const schermoLargo = () => window.matchMedia('(min-width: 900px)').matches;

/** true su dispositivi touch (telefono/tablet). */
export const dispositivoTouch = () => window.matchMedia('(pointer: coarse)').matches;

// ---------- Avvisi in basso (toast) ----------

let contenitoreAvvisi;

/**
 * Mostra un breve messaggio.
 * @param {string} testo
 * @param {'info'|'ok'|'errore'} tipo
 * @param {{azione?: string, suAzione?: () => void, durata?: number}} opzioni
 */
export function avviso(testo, tipo = 'info', { azione, suAzione, durata } = {}) {
  if (!contenitoreAvvisi) {
    contenitoreAvvisi = h('div', { class: 'avvisi', 'aria-live': 'polite' });
    document.body.append(contenitoreAvvisi);
  }
  const el = h('div', { class: `avviso avviso-${tipo}`, role: tipo === 'errore' ? 'alert' : 'status' },
    h('span', {}, testo),
    azione && h('button', {
      class: 'avviso-azione',
      onclick: () => { suAzione?.(); togliAvviso(el); },
    }, azione),
  );
  contenitoreAvvisi.append(el);
  let timer = setTimeout(() => togliAvviso(el), durata ?? (tipo === 'errore' ? 8000 : 3500));
  // Si può mandare via con un tocco o scorrendo, come le notifiche.
  let inizio = null;
  el.addEventListener('pointerdown', (e) => { inizio = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!inizio || e.target.closest('button')) return;
    const dx = e.clientX - inizio.x;
    const dy = e.clientY - inizio.y;
    inizio = null;
    if (Math.abs(dx) > 40 || dy < -20 || (Math.abs(dx) < 6 && Math.abs(dy) < 6)) {
      clearTimeout(timer);
      togliAvviso(el);
    }
  });
}

/** Toglie un avviso con l'animazione di uscita. */
function togliAvviso(el) {
  if (!el.isConnected || el.classList.contains('esce')) return;
  el.classList.add('esce');
  dopoAnimazione(el, () => el.remove(), 400);
}

/** Esegue `fatto` alla fine dell'animazione CSS (o dopo `massimo` ms). */
export function dopoAnimazione(el, fatto, massimo = 500) {
  let finito = false;
  const fine = () => { if (!finito) { finito = true; fatto(); } };
  el.addEventListener('animationend', (e) => { if (e.target === el) fine(); }, { once: false });
  setTimeout(fine, movimentoRidotto() ? 0 : massimo);
}

/** L'utente ha chiesto meno animazioni nelle impostazioni del telefono? */
export const movimentoRidotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Finestre di dialogo ----------

/**
 * Apre una finestra modale e restituisce una promessa con il valore del
 * pulsante premuto (null se chiusa con Esc o con la X).
 * @param {{titolo: string, corpo?: Node|Node[], pulsanti?: Array<{testo: string,
 *   valore: any, classe?: string, prima?: () => (boolean|Promise<boolean>)}>,
 *   larga?: boolean}} opzioni
 *   `prima` (facoltativa) viene chiamata prima di chiudere: se restituisce
 *   false la finestra resta aperta (es. dati non validi).
 */
export function apriFinestra({ titolo, corpo, pulsanti = [], larga = false }) {
  return new Promise((risolvi) => {
    const dialogo = h('dialog', { class: `finestra ${larga ? 'finestra-larga' : ''}` });
    let chiusa = false;
    // Chiusura con animazione: sul telefono il foglio scende, sul
    // computer la finestra si rimpicciolisce e sparisce.
    const chiudi = (valore) => {
      if (chiusa) return;
      chiusa = true;
      risolvi(valore);
      // (se lo si stava trascinando, scende da dove l'ha lasciato il dito)
      dialogo.classList.remove('trascina', 'torna');
      dialogo.classList.add('in-chiusura');
      dopoAnimazione(dialogo, () => { dialogo.close(); dialogo.remove(); }, 380);
    };
    // Il pulsante principale è di tipo "submit": così Invio in un campo lo preme.
    const principale = pulsanti.find((p) => p.classe?.includes('primario')) ?? pulsanti.at(-1);
    const modulo = h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        if (principale) await premi(principale);
      },
    });
    const premi = async (p) => {
      if (p.prima && !(await p.prima())) return;
      chiudi(p.valore);
    };
    const testa = h('header', { class: 'finestra-testa' },
      h('h2', {}, titolo),
      h('button', { type: 'button', class: 'pulsante-icona', 'aria-label': 'Chiudi', onclick: () => chiudi(null) }, '✕'),
    );
    riempi(modulo,
      h('div', { class: 'maniglia', 'aria-hidden': 'true' }),
      testa,
      h('div', { class: 'finestra-corpo' }, corpo),
      pulsanti.length > 0 && h('footer', { class: 'finestra-piede' },
        pulsanti.map((p) => h('button', {
          type: p === principale ? 'submit' : 'button',
          class: `pulsante ${p.classe ?? ''}`,
          onclick: p === principale ? null : () => premi(p),
        }, p.testo)),
      ),
    );
    dialogo.append(modulo);
    dialogo.addEventListener('cancel', (e) => { e.preventDefault(); chiudi(null); });
    // Tocco sullo sfondo scuro: chiude (come fuori da un foglio iOS).
    dialogo.addEventListener('click', (e) => {
      if (e.target !== dialogo) return;
      const r = dialogo.getBoundingClientRect();
      const fuori = e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right;
      if (fuori) chiudi(null);
    });
    trascinaPerChiudere(dialogo, testa, () => chiudi(null));
    document.body.append(dialogo);
    dialogo.showModal();
    // Primo campo pronto per scrivere (sul computer: sul telefono la
    // tastiera coprirebbe il foglio mentre sale).
    if (!dispositivoTouch()) dialogo.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  });
}

/** Sul telefono il foglio si chiude trascinandolo verso il basso dalla testata. */
function trascinaPerChiudere(dialogo, maniglia, chiudi) {
  let inizioY = null;
  let ultimo = 0;
  let tempo = 0;
  let velocita = 0;
  maniglia.addEventListener('pointerdown', (e) => {
    if (schermoLargo() || e.target.closest('button')) return;
    inizioY = e.clientY;
    tempo = performance.now();
    ultimo = 0;
    velocita = 0;
    dialogo.classList.remove('torna');
    dialogo.classList.add('trascina');
    maniglia.setPointerCapture(e.pointerId);
  });
  maniglia.addEventListener('pointermove', (e) => {
    if (inizioY == null) return;
    const dy = e.clientY - inizioY;
    // Verso l'alto resiste (effetto elastico), verso il basso segue il dito.
    const y = dy > 0 ? dy : dy / 6;
    const ora = performance.now();
    velocita = (y - ultimo) / Math.max(1, ora - tempo);
    ultimo = y;
    tempo = ora;
    dialogo.style.transform = `translateY(${y}px)`;
  });
  const lascia = () => {
    if (inizioY == null) return;
    inizioY = null;
    dialogo.classList.remove('trascina');
    if (ultimo > dialogo.offsetHeight * 0.3 || velocita > 0.6) {
      chiudi();
    } else {
      dialogo.classList.add('torna');
      dialogo.style.transform = '';
    }
  };
  maniglia.addEventListener('pointerup', lascia);
  maniglia.addEventListener('pointercancel', lascia);
}

/** Chiede conferma. Restituisce true/false. */
export async function conferma(messaggio, { titolo = 'Conferma', testoOk = 'Conferma', pericolo = false } = {}) {
  const r = await apriFinestra({
    titolo,
    corpo: h('p', {}, messaggio),
    pulsanti: [
      { testo: 'Annulla', valore: false, classe: 'secondario' },
      { testo: testoOk, valore: true, classe: pericolo ? 'pericolo primario' : 'primario' },
    ],
  });
  return r === true;
}

// ---------- Segnali per le scansioni ----------

let audio;

/** Breve suono: acuto se ok, grave se errore. */
export function bip(ok = true) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.frequency.value = ok ? 1400 : 300;
    vol.gain.value = 0.15;
    osc.connect(vol).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + (ok ? 0.08 : 0.25));
  } catch { /* audio non disponibile: pazienza */ }
  navigator.vibrate?.(ok ? 50 : [80, 60, 80]);
}

/** Campo di modulo con etichetta e messaggio di errore. */
export function campo(etichetta, controllo, { aiuto, id } = {}) {
  const idCampo = id ?? controllo.id ?? `c-${Math.random().toString(36).slice(2, 8)}`;
  controllo.id = idCampo;
  return h('div', { class: 'campo' },
    h('label', { for: idCampo }, etichetta),
    controllo,
    aiuto && h('small', { class: 'aiuto' }, aiuto),
    h('small', { class: 'errore-campo', 'aria-live': 'polite' }),
  );
}

/** Mostra (o toglie, con testo vuoto) l'errore sotto un campo. */
export function erroreCampo(controllo, testo) {
  const box = controllo.closest('.campo')?.querySelector('.errore-campo');
  if (box) box.textContent = testo ?? '';
  controllo.toggleAttribute('aria-invalid', !!testo);
  if (testo) controllo.focus();
}
