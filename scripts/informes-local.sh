#!/usr/bin/env bash
# La arquitectura definitiva, en local: Informes en SU PROPIO ORIGEN hablando
# con MPC Cloud en otro. Django simulado, documentos temporales, nada de
# configuración de producción.
set -euo pipefail
cd "$(dirname "$0")/.."
CLOUD_REPO="${CLOUD_REPO:-../mpc-cloud}"
CLOUD_REPO="$(cd "$CLOUD_REPO" && pwd)"
command -v node >/dev/null || { echo 'Requiere Node 24 en PATH'; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)' || { echo 'Requiere Node 24 o superior'; exit 1; }

export PORT="${PORT:-8180}" FAKE_DJANGO_PORT="${FAKE_DJANGO_PORT:-8190}" INFORMES_PORT="${INFORMES_PORT:-8181}"
export INFORMES_ORIGIN="http://localhost:${INFORMES_PORT}"
# El navegador habla con Cloud por CORS y con el login delegado (aquí, el Django
# simulado, que en producción es datos.mpc1.es) para obtener el token.
MPC_CLOUD_API="http://localhost:${PORT}" MPC_LOGIN_API="http://localhost:${FAKE_DJANGO_PORT}" npm run build:publico
npm --prefix "$CLOUD_REPO" run build

DATA_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/informes-render.XXXXXX")"
export DATA_ROOT HOST=127.0.0.1
# Cloud deja de servir Informes: en la arquitectura definitiva lo sirve su dominio.
export INFORMES_STATIC_DIR=""

node scripts/servir-estatico.mjs dist-publico "$INFORMES_PORT" &
ESTATICO=$!
trap 'kill "$ESTATICO" 2>/dev/null || true; rm -rf "$DATA_ROOT"' EXIT

printf 'Informes: %s/ — MPC Cloud: http://localhost:%s (ana / secreto-123). Datos temporales: %s\n' \
  "$INFORMES_ORIGIN" "$PORT" "$DATA_ROOT"
cd "$CLOUD_REPO"
node --import tsx backend/test-support/serve-dev.ts
