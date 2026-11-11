# Aceptación — 11 de noviembre de 2026 (Informes en su propio dominio)

Imagen `1.3.0-rc1`, `sha256:705af5ab9bbddcfc0c03b3057e6f747378b0b12a5060bdce167c595210a746c3`,
desde `mpc-cloud@a6e7c12` e `informe@6387456`, ambos árboles limpios.

| Comprobación | Resultado |
| --- | --- |
| Informes: Vitest | 102 correctas |
| Cloud: Vitest | 238 correctas, 2 omitidas por plataforma |
| Navegador, Informes servido por Cloud (cookie + CSRF) | Correcto |
| Navegador, Informes en su propio dominio (CORS + token) | Correcto |
| Prueba de humo de la imagen | `/informes/` 200, API sin sesión 401, preflight 204 sólo del origen exacto, token sin Django 503 (falla cerrado) |
| **Aceptación con Django corporativo** | **Correcta** |

## Cómo se hizo la aceptación

Contra el **Django corporativo real** y el login delegado real de `datos.mpc1.es`, con las dos cuentas
técnicas `mpc_cloud_test_writer` y `mpc_cloud_test_reader`, y con el artefacto exacto que publicará
Render (`dist-publico`, compilado con los orígenes de producción).

El navegador usó **los dominios reales**: `informes.cacharolo.es` y `cloud.mpc1.es` se resolvieron, sólo
dentro de ese navegador (`--host-resolver-rules`), contra un frente HTTPS local que servía Informes y
reenviaba la API al MPC Cloud de **staging** por un túnel SSH. `datos.mpc1.es` **no** se redirigió: el
login viajó de verdad a la API corporativa, así que su CORS quedó probado en navegador y no sólo con
`curl`. Antes de escribir nada, la prueba comprueba que lo que el navegador llama Cloud responde con la
marca del frente; si la resolución fallara, aborta en vez de tocar producción.

Cubierto: carga local y enlace anónimo sin sesión; login inválido y válido; sesión única entre las cuatro
vistas y tras recargar; lectura de CSV y PDF de Cloud; guardar sobre el original; conflicto de ETag
conservando la edición; guardar como; edición durante una subida en vuelo; denegación de escritura a la
cuenta de solo lectura (decidida por Django, no por la interfaz); y que lo guardado aparece en la
interfaz normal de MPC Cloud. Sin errores de CSP ni excepciones de página.

Producción no se tocó: sigue con `1.2.0-rc1` y sin `INFORMES_ORIGIN`, y por eso rechaza tokens de otro
origen (comprobado después de la prueba). El staging tiene su propio dataset
(`mpc-cloud-staging-informes-20261110`), separado del documental. El certificado del frente y las
credenciales en claro se borraron al terminar.

Pendiente: borrar las dos cuentas técnicas (`scripts/staging/delete-django-test-users.py`) y el
`ALLOW_INSECURE_COOKIES=true` de producción, que es anterior a esto e independiente.

# Validación — 10 de noviembre de 2026

| Comprobación | Resultado |
| --- | --- |
| Informes: compilación local e integrada | Correctas |
| Informes: Vitest | 102 pruebas correctas |
| Cloud: tipos frontend/backend | Correctos |
| Cloud: Vitest macOS | 233 correctas, 2 omitidas por plataforma/usuario |
| Cloud: Vitest Linux Alpine | 234 correctas, 1 omitida (permisos Unix al ejecutar tests como root) |
| Navegador Chromium | Carga local y enlace anónimo; sesión y navegación; CSV en Histórico, Por cliente y Editor; PDF y worker; guardar original; conflicto sin perder edición; guardar como CSV y PDF; edición durante subida; recarga; archivos en interfaz normal Cloud |
| PDF guardado como | Bytes idénticos al original de prueba |
| Seguridad en navegador | Sin errores de CSP ni excepciones de página |
| Imagen combinada | Construida localmente; prueba smoke de Cloud correcta |

La prueba smoke ejecuta la imagen como UID 568, con raíz de solo lectura, sin capacidades, y valida rechazo de almacenamiento sin inicializar, ausente, sustituido o inaccesible; recuperación del mismo volumen; sesión y cabeceras. No usa producción.

Docker Hub agotó el tiempo al resolver el frontend opcional `docker/dockerfile:1.7`. Para comprobar la imagen se utilizó una copia local del Dockerfile de Cloud sin esa primera directiva, con el frontend de BuildKit integrado; las instrucciones de construcción fueron las mismas. El Dockerfile del proyecto no se modificó por este problema de red.

Todos los documentos utilizados se crearon en almacenamiento temporal. No hubo despliegue, push ni modificación de datos reales. Las capturas y logs locales están en `.cloud-test/` (no versionados). El test de navegador es reproducible con `scripts/cloud-local.sh` y `npm run test:cloud`.

Pendiente antes de producción: aceptación en staging con Django corporativo real, origen HTTPS y dataset de pruebas, incluyendo una cuenta autorizada y otra denegada. No se presenta el simulador como validación del servicio corporativo en vivo.
