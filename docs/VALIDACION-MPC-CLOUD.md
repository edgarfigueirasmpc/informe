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
