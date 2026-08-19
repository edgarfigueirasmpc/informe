#!/usr/bin/env bash
#
# Levanta el servidor de desarrollo.
#
#   ./arrancar.sh              el servidor de desarrollo, en el puerto 5173
#   ./arrancar.sh test         las pruebas
#   ./arrancar.sh run build    cualquier otra cosa, tal cual se le pasa a npm
#
# Existe porque en este equipo Node no está en el PATH del sistema, sino dentro
# de un entorno de conda. El script lo busca solo, así que no hace falta activar
# nada antes.

set -euo pipefail

cd "$(dirname "$0")"

ENTORNO=informe
MINIMO=20

# Devuelve el directorio donde vive un `node` utilizable, si lo encuentra.
buscar_node() {
  if command -v node >/dev/null 2>&1; then
    dirname "$(command -v node)"
    return 0
  fi

  local base
  for base in "$HOME/miniforge3" "$HOME/mambaforge" "$HOME/miniconda3" \
              "$HOME/anaconda3" "$HOME/opt/miniconda3" \
              "/opt/homebrew/Caskroom/miniconda/base" \
              "/usr/local/Caskroom/miniconda/base"; do
    if [ -x "$base/envs/$ENTORNO/bin/node" ]; then
      echo "$base/envs/$ENTORNO/bin"
      return 0
    fi
  done

  return 1
}

if ! BIN="$(buscar_node)"; then
  cat >&2 <<AYUDA
No encuentro Node por ninguna parte.

Ni en el PATH ni en un entorno de conda llamado «$ENTORNO». Para crearlo:

  conda create -y -n $ENTORNO -c conda-forge nodejs=22

Y vuelve a lanzar este script; no hace falta que actives el entorno a mano.
AYUDA
  exit 1
fi

export PATH="$BIN:$PATH"

VERSION="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$VERSION" -lt "$MINIMO" ]; then
  echo "Node $VERSION es demasiado viejo; hace falta $MINIMO o más." >&2
  exit 1
fi

echo "Node $(node -v) · $BIN"

if [ ! -d node_modules ]; then
  echo "Primera vez: instalando dependencias…"
  npm install
fi

if [ "$#" -eq 0 ]; then
  echo "Abriendo http://localhost:5173  (Ctrl+C para parar)"
  exec npm run dev
fi

exec npm "$@"
