"""Point the staging app at a given image and open its Informes origin.

Touches ONLY the staging app. Refuses to run if the name, the dataset or the
port are not the staging ones, and never prints the service key, the Django URL
or any other secret: it reports just the fields it changes.

    python3 scripts/staging/update-staging-informes.py <digest sha256:...> <origen>
"""
import copy, importlib.util, json, os, sys

APP = 'mpc-cloud-staging-informes'
DATASET = '/mnt/data/mpc-cloud-staging-informes-20261110'
PUERTO = '127.0.0.1:8181:8080'
IMAGEN = 'ghcr.io/edgarfigueirasmpc/mpc-cloud'

digest, origen = sys.argv[1], sys.argv[2]
assert digest.startswith('sha256:') and len(digest) == 71, 'digest completo, con sha256:'
assert origen.startswith(('https://', 'http://localhost')), 'origen https, o localhost para el túnel'

spec = importlib.util.spec_from_file_location('rpc', os.path.join(os.path.dirname(__file__), 'nas-rpc.py'))
rpc = importlib.util.module_from_spec(spec); spec.loader.exec_module(rpc)

config = rpc.call('app.config', APP)
assert set(config['services']) == {'initialize', 'mpc-cloud'}, config['services'].keys()
for nombre, servicio in config['services'].items():
    fuentes = {v['source'] for v in servicio.get('volumes', [])}
    assert fuentes == {DATASET}, f'{nombre}: dataset inesperado {fuentes}'
assert config['services']['mpc-cloud'].get('ports') == [PUERTO], 'puerto inesperado: ¿es realmente staging?'

nuevo = copy.deepcopy(config)
antes = {}
for nombre, servicio in nuevo['services'].items():
    antes[nombre] = servicio['image']
    servicio['image'] = f'{IMAGEN}@{digest}'
entorno = nuevo['services']['mpc-cloud'].setdefault('environment', {})
antes_origen = entorno.get('INFORMES_ORIGIN', '(no estaba)')
entorno['INFORMES_ORIGIN'] = origen

resultado = rpc.call('app.update', APP, {'custom_compose_config': nuevo}, job=True)
print(json.dumps({
    'app': resultado['id'], 'estado': resultado['state'],
    'imagen_antes': antes, 'imagen_ahora': f'{IMAGEN}@{digest}',
    'INFORMES_ORIGIN_antes': antes_origen, 'INFORMES_ORIGIN_ahora': origen,
    'dataset': DATASET, 'puerto': PUERTO,
}, indent=1, ensure_ascii=False))
