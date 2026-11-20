// =====================================================================
//  Schermata di accesso (email e password).
// =====================================================================

import { h, riempi, avviso, campo, erroreCampo } from './dom.js';
import { accedi, inviaRecuperoPassword, esci } from '../servizi/auth.js';

export function mostraAccesso(contenitore) {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, inputmode: 'email' });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const pulsante = h('button', { type: 'submit', class: 'pulsante primario grande' }, 'Entra');

  const modulo = h('form', {
    class: 'accesso-modulo',
    onsubmit: async (e) => {
      e.preventDefault();
      erroreCampo(password, '');
      pulsante.disabled = true;
      pulsante.textContent = 'Accesso in corso…';
      try {
        await accedi(email.value, password.value);
        // Il resto lo fa app.js quando riceve l'accesso.
      } catch (err) {
        erroreCampo(password, err.message);
        pulsante.disabled = false;
        pulsante.textContent = 'Entra';
      }
    },
  },
    campo('Email', email),
    campo('Password', password),
    pulsante,
    h('button', {
      type: 'button',
      class: 'pulsante-link',
      onclick: async () => {
        if (!email.value.trim()) {
          erroreCampo(email, 'Scrivi prima la tua email, poi premi di nuovo qui.');
          return;
        }
        try {
          await inviaRecuperoPassword(email.value);
          avviso('Ti abbiamo inviato un\'email per scegliere una nuova password. Controlla anche lo spam.', 'ok', { durata: 8000 });
        } catch (err) {
          erroreCampo(email, err.message);
        }
      },
    }, 'Password dimenticata?'),
  );

  riempi(contenitore,
    h('main', { class: 'accesso' },
      h('div', { class: 'accesso-scheda' },
        h('img', { src: 'icone/icona.svg', alt: '', class: 'accesso-logo', width: 72, height: 72 }),
        h('h1', {}, 'Bottega'),
        h('p', { class: 'sottotitolo' }, 'Magazzino e prezzi'),
        modulo,
      ),
    ),
  );
}

/** Mostrata a chi entra con un account non abilitato. */
export function mostraNonAutorizzato(contenitore, email) {
  riempi(contenitore,
    h('main', { class: 'accesso' },
      h('div', { class: 'accesso-scheda' },
        h('h1', {}, 'Accesso non abilitato'),
        h('p', {}, `L'account ${email ?? ''} non è abilitato a usare il gestionale.`),
        h('p', { class: 'sottotitolo' }, 'Chiedi a chi gestisce l\'app di aggiungerti tra gli utenti.'),
        h('button', { class: 'pulsante primario', onclick: () => esci() }, 'Esci'),
      ),
    ),
  );
}

/** Schermata d'attesa durante l'avvio. */
export function mostraCaricamento(contenitore, testo = 'Caricamento…') {
  riempi(contenitore,
    h('main', { class: 'accesso' },
      h('div', { class: 'caricamento' }, h('div', { class: 'rotella' }), h('p', {}, testo)),
    ),
  );
}
