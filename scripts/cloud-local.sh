#!/usr/bin/env bash
# Isolated integration stack. Simulated Django, temporary documents, no production configuration.
set -euo pipefail
cd "$(dirname "$0")/.."
CLOUD_REPO="${CLOUD_REPO:-../mpc-cloud}"
CLOUD_REPO="$(cd "$CLOUD_REPO" && pwd)"
command -v node >/dev/null || { echo 'Requiere Node 24 en PATH'; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)' || { echo 'Requiere Node 24 o superior'; exit 1; }
npm run build:cloud
npm --prefix "$CLOUD_REPO" run build
INFORMES_STATIC_DIR="$PWD/dist-cloud"
DATA_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/informes-cloud.XXXXXX")"
export INFORMES_STATIC_DIR DATA_ROOT
export HOST=127.0.0.1
export PORT="${PORT:-8180}" FAKE_DJANGO_PORT="${FAKE_DJANGO_PORT:-8190}"
trap 'rm -rf "$DATA_ROOT"' EXIT
printf 'Pruebas: http://localhost:%s/informes/ (ana / secreto-123). Datos temporales: %s\n' "$PORT" "$DATA_ROOT"
cd "$CLOUD_REPO"
node --import tsx backend/test-support/serve-dev.ts
