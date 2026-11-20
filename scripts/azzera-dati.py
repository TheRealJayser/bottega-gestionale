#!/usr/bin/env python3
# =====================================================================
#  CANCELLA TUTTI I DATI dalla console (Google Cloud Shell).
#
#  Fa la stessa cosa del pulsante "Cancella tutti i dati" dell'app, ma
#  senza dover entrare nell'app: cancella prodotti (con storico prezzi e
#  modifiche), codici, foto e movimenti. Gli account ("utenti") restano.
#  Alla fine segna l'azzeramento, così i telefoni svuotano la loro copia.
#
#  Prima di cancellare salva una copia di tutto in un file JSON nella
#  cartella da cui lo lanci.
#
#  Uso, nella cartella del progetto:
#    python3 scripts/azzera-dati.py            # mostra solo quanti dati ci sono
#    python3 scripts/azzera-dati.py --cancella # copia di sicurezza + cancellazione
# =====================================================================

import datetime
import json
import subprocess
import sys
import urllib.parse
import urllib.request

PROGETTO = json.load(open('.firebaserc'))['projects']['default']
BASE = f'https://firestore.googleapis.com/v1/projects/{PROGETTO}/databases/(default)/documents'
TOKEN = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()


def chiama(metodo, url, corpo=None):
    dati = json.dumps(corpo).encode() if corpo is not None else None
    richiesta = urllib.request.Request(url, data=dati, method=metodo, headers={
        'Authorization': f'Bearer {TOKEN}',
        'x-goog-user-project': PROGETTO,
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(richiesta) as r:
        return json.loads(r.read() or b'{}')


def elenca(collezione):
    """Tutti i documenti di una raccolta (dati completi, per la copia)."""
    documenti, pagina = [], ''
    while True:
        url = f'{BASE}/{collezione}?pageSize=300' + (f'&pageToken={urllib.parse.quote(pagina)}' if pagina else '')
        r = chiama('GET', url)
        documenti += r.get('documents', [])
        pagina = r.get('nextPageToken')
        if not pagina:
            return documenti


def gruppo(nome):
    """Tutti i documenti delle sottoraccolte con questo nome (es. storicoPrezzi)."""
    r = chiama('POST', f'{BASE}:runQuery', {'structuredQuery': {'from': [{'collectionId': nome, 'allDescendants': True}]}})
    return [x['document'] for x in r if 'document' in x]


raccolte = {
    'prodotti': elenca('prodotti'),
    'storicoPrezzi': gruppo('storicoPrezzi'),
    'modifiche': gruppo('modifiche'),
    'codici': elenca('codici'),
    'movimenti': elenca('movimenti'),
    'foto': elenca('foto'),
}
totale = sum(len(v) for v in raccolte.values())
print(f'Progetto: {PROGETTO}')
for nome, docs in raccolte.items():
    print(f'  {nome:<14} {len(docs):>6}')
print(f'  {"totale":<14} {totale:>6}')

if '--cancella' not in sys.argv:
    print('\nNiente è stato cancellato. Per cancellare: python3 scripts/azzera-dati.py --cancella')
    sys.exit(0)

ora = datetime.datetime.now(datetime.timezone.utc)
file_copia = f'backup-prima-della-cancellazione-{ora:%Y-%m-%d-%H%M}.json'
json.dump(raccolte, open(file_copia, 'w'))
print(f'\nCopia di sicurezza salvata in {file_copia}')

# Prodotti per ultimi.
nomi = [d['name'] for k in ['storicoPrezzi', 'modifiche', 'codici', 'movimenti', 'foto', 'prodotti'] for d in raccolte[k]]
for i in range(0, len(nomi), 400):
    r = chiama('POST', f'{BASE}:batchWrite', {'writes': [{'delete': n} for n in nomi[i:i + 400]]})
    falliti = [s for s in r.get('status', []) if s.get('code')]
    if falliti:
        sys.exit(f'Errore durante la cancellazione: {falliti[:3]}')
    print(f'Cancellati {min(i + 400, len(nomi))} di {len(nomi)}')

# Segna l'azzeramento: i dispositivi svuotano la loro copia locale.
istante = ora.isoformat().replace('+00:00', 'Z')
chiama('POST', f'{BASE}:commit', {'writes': [{
    'update': {
        'name': f'projects/{PROGETTO}/databases/(default)/documents/sistema/azzeramento',
        'fields': {
            'stato': {'stringValue': 'completato'},
            'utente': {'mapValue': {'fields': {'uid': {'stringValue': 'console'}, 'nome': {'stringValue': 'Amministratore'}}}},
            'iniziatoIl': {'timestampValue': istante},
            'completatoIl': {'timestampValue': istante},
        },
    },
    'updateTransforms': [{'fieldPath': 'completatoIl', 'setToServerValue': 'REQUEST_TIME'}],
}]})
print('\nFatto: magazzino vuoto. I dispositivi si svuoteranno da soli alla prossima apertura dell\'app.')
