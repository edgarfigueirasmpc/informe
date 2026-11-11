#!/usr/bin/env python3
"""Private stdin/stdout transport for TrueNAS RPC over the existing SSH identity.
No credentials in remote command arguments. Callers must redact results before printing.
"""
import json, os, subprocess

def _destino():
    """Dónde está el NAS. Fuera del repositorio, que es público: no es un secreto,
    pero una dirección interna y un usuario de SSH no tienen por qué estar en internet."""
    valor = os.environ.get('NAS_SSH')
    if valor:
        return valor
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cloud-test', 'nas.private')
    try:
        with open(ruta) as f:
            return f.read().strip()
    except OSError:
        raise SystemExit('Falta el destino del NAS: exporta NAS_SSH=usuario@host, '
                         'o escríbelo en .cloud-test/nas.private (no versionado).')

HOST = _destino()
REMOTE = '''import json,sys
from truenas_api_client import Client
request=json.load(sys.stdin)
with Client() as client:
 result=client.call(request['method'], *request.get('args', []), **request.get('options', {}))
 print(json.dumps(result, default=str))
'''
def call(method, *args, **options):
    import shlex
    result = subprocess.run(['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',HOST,
        'python3 -c '+shlex.quote(REMOTE)], input=json.dumps({'method': method, 'args': args, 'options': options}),
        text=True,capture_output=True,check=True)
    return json.loads(result.stdout)
if __name__ == '__main__':
    raise SystemExit('Import this helper from a scoped staging script; do not print raw app configurations.')
