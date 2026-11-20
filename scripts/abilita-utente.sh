#!/usr/bin/env bash
# =====================================================================
#  Abilita (o disabilita) una persona a usare il gestionale.
#
#  Prima crea l'account in: Console Firebase → Authentication →
#  Utenti → Aggiungi utente (email + password provvisoria).
#  Poi, da Google Cloud Shell (già collegato al tuo account Google):
#
#     bash scripts/abilita-utente.sh gabriele@esempio.it "Gabriele"
#     bash scripts/abilita-utente.sh viviana@esempio.it "Viviana" disattiva
#
#  Lo script trova l'UID dell'account e crea/aggiorna il documento
#  utenti/{uid} con nome, email e attivo = true (o false).
# =====================================================================
set -euo pipefail

PROGETTO="bottega-gabriele"
EMAIL="${1:?Uso: abilita-utente.sh EMAIL NOME [disattiva]}"
NOME="${2:?Manca il nome da mostrare (es. Gabriele)}"
ATTIVO=true
[[ "${3:-}" == "disattiva" ]] && ATTIVO=false

TOKEN="$(gcloud auth print-access-token)"

UID_UTENTE="$(curl -sS -X POST \
  "https://identitytoolkit.googleapis.com/v1/projects/${PROGETTO}/accounts:lookup" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-goog-user-project: ${PROGETTO}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": [\"${EMAIL}\"]}" \
  | python3 -c 'import sys, json; u = json.load(sys.stdin).get("users") or []; print(u[0]["localId"] if u else "")')"

if [[ -z "${UID_UTENTE}" ]]; then
  echo "Nessun account con email ${EMAIL}. Crealo prima in Authentication → Utenti." >&2
  exit 1
fi

ORA="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DATI="$(python3 -c 'import json, sys; print(json.dumps({"fields": {
  "nome": {"stringValue": sys.argv[1]},
  "email": {"stringValue": sys.argv[2]},
  "attivo": {"booleanValue": sys.argv[3] == "true"},
  "creatoIl": {"timestampValue": sys.argv[4]}}}))' "${NOME}" "${EMAIL}" "${ATTIVO}" "${ORA}")"

curl -sS -X PATCH \
  "https://firestore.googleapis.com/v1/projects/${PROGETTO}/databases/(default)/documents/utenti/${UID_UTENTE}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-goog-user-project: ${PROGETTO}" \
  -H "Content-Type: application/json" \
  -d "${DATI}" > /dev/null

echo "Fatto: ${NOME} <${EMAIL}> (uid ${UID_UTENTE}) — attivo = ${ATTIVO}"
