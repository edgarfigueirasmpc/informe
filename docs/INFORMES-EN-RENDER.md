# Informes MPC en su propio dominio

La versión definitiva y única es **https://informes.cacharolo.es**, un sitio
estático en Render. Habla directamente con la API de MPC Cloud
(`cloud.mpc1.es`) y con el login delegado de MPC Files (`datos.mpc1.es`). No
hay pasarela nueva, ni almacenamiento propio, ni copia de los documentos.

## Cómo encaja cada pieza

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Informes | Render, `informes.cacharolo.es` | HTML/JS/CSS. Ni servidor ni secretos. |
| Documentos | MPC Cloud en TrueNAS, `cloud.mpc1.es` | Las carpetas de siempre, con sus ACL, papelera, auditoría y ETags. |
| Identidad | Django corporativo | Emite el token y decide los permisos por proyecto. |
| Login | MPC Files API, `datos.mpc1.es` | `POST /api/auth/token/`: comprueba la contraseña contra Django con límites de intentos y errores uniformes. No emite tokens ni guarda nada. |

Sin iniciar sesión, Informes funciona exactamente como antes: se cargan PDF y
CSV del equipo, se calcula todo en el navegador y los enlaces compartidos
siguen llevando los datos dentro del fragmento. Entrar sólo añade la
posibilidad de abrir y guardar en las carpetas de la empresa.

## Por qué un token y no la cookie

La cookie de MPC Cloud es `HttpOnly` y `SameSite=Strict`: desde otro dominio no
viaja, y forzarla a viajar sería debilitar justo lo que la protege. Así que
entre dominios la credencial es explícita:

1. El navegador manda usuario y contraseña **al login delegado**, nunca a
   Informes ni a Cloud.
2. Vuelve el token que emitió Django.
3. Cada petición a Cloud lo presenta en `Authorization: Token …`.
4. Cloud lo resuelve a una **sesión efímera**: no entra en su almacén de
   cookies y no concede nada por sí misma. Cada acción vuelve a preguntar a
   Django y pasa por las ACL, igual que una sesión normal.

CORS se abre para **un único origen exacto**, sin comodines y con
`allow_credentials` desactivado. Sin `INFORMES_ORIGIN`, Cloud se comporta como
antes: ni preflight ni token.

### Dónde vive el token, y qué supone

En `sessionStorage`: dura lo que la pestaña. Sobrevive a las recargas y a
cambiar de vista —que es donde molestaría volver a entrar— y desaparece al
cerrarla. No se guarda ninguna contraseña corporativa ni clave de servicio.

Lo que hay que saber: los tokens de Django no caducan solos, así que un token
robado sirve hasta que se revoque en Django. Es el mismo riesgo que ya asumen
las demás aplicaciones que usan la Files API, y por eso el token está en el
almacenamiento más corto que permite seguir siendo usable, y no en
`localStorage`. Si se prefiere pedir la contraseña en cada pestaña nueva, es
sustituir `sessionStorage` por memoria en [`src/lib/cloud.ts`](../src/lib/cloud.ts);
si se prefiere lo contrario, `localStorage`.

## Probarlo entero en local

Dos orígenes de verdad, Django simulado y documentos temporales:

```sh
./scripts/informes-local.sh
# en otra terminal:
npm run test:publico
```

Informes queda en <http://localhost:8181>, MPC Cloud en
<http://localhost:8180>. Usuarios ficticios con contraseña `secreto-123`:
`ana` (todo), `escritor` (lectura y escritura), `lector` (solo lectura),
`sinacceso`.

La misma prueba cubre los dos despliegues; lo único que cambia es a dónde
apunta y cómo se autentica:

```sh
./scripts/cloud-local.sh && npm run test:cloud      # Informes servido por Cloud
./scripts/informes-local.sh && npm run test:publico # Informes en su dominio
```

Comprueba login válido e inválido, sesión única entre vistas y recargas,
lectura de CSV y PDF, guardar sobre el original, guardar como, conflicto de
ETag conservando la edición, denegación de escritura a una cuenta de solo
lectura, y que lo guardado aparece en la interfaz normal de MPC Cloud.

En el backend de Cloud, [`test/informes-origen.test.ts`](../../mpc-cloud/backend/test/informes-origen.test.ts)
cubre el contrato: preflight sólo del origen exacto, token sólo desde ese
origen, token y cookie a la vez rechazados, `Bearer` rechazado, token
desconocido rechazado, escritura denegada al lector pidiendo directamente a la
API, y que la caché de identificación no sustituye al permiso.

## Puesta en marcha

Hace falta tocar tres paneles. Ninguno de los pasos borra datos ni reinicia
Cloud por sí solo, salvo donde se indica.

1. **MPC Files API (`datos.mpc1.es`)** — comprobar el valor real antes de
   cambiarlo, que la lista debe seguir conteniendo todos los orígenes de hoy:
   - `CORS_ALLOWED_ORIGINS` tiene que incluir `https://informes.cacharolo.es`.
   - `ENABLE_AUTH_PROXY` tiene que estar en `true`; si está apagado, no existe
     el login delegado y nadie podrá entrar desde Informes.

2. **MPC Cloud (TrueNAS)** — añadir a la aplicación:
   `INFORMES_ORIGIN=https://informes.cacharolo.es`, con la imagen que incluye
   este cambio. Nada más: el montaje, `DATA_ROOT`, `STORAGE_PROJECT`, la clave
   de servicio y la cookie siguen igual. Reiniciar la aplicación invalida las
   sesiones en memoria, como cualquier actualización.

3. **Render** — Static Site desde este repositorio:
   `npm ci && npm test && npm run build:publico`, publicando `dist-publico`.
   Está descrito en [`render.yaml`](../render.yaml). Dominio propio
   `informes.cacharolo.es`.

4. **DNS (Hostalia)** — cuando Render responda y se haya comprobado, apuntar
   `informes` a Render en lugar de a GitHub Pages. Hasta ese momento el sitio
   actual sigue sirviendo con normalidad.

Comprobación de que el origen está admitido, antes de tocar el DNS:

```sh
curl -si -X OPTIONS https://datos.mpc1.es/api/auth/token/ \
  -H 'Origin: https://informes.cacharolo.es' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' | grep -i '^access-control'
```

```sh
curl -si -X OPTIONS https://cloud.mpc1.es/api/fs/list \
  -H 'Origin: https://informes.cacharolo.es' \
  -H 'Access-Control-Request-Method: GET' | grep -i '^access-control'
```

Las dos deben devolver `access-control-allow-origin` con ese origen exacto.

## Retirar la versión integrada

**Sólo después** de que la versión de Render esté comprobada en producción con
una cuenta real. Entonces, en MPC Cloud, una de dos:

- Dejar de montar el frontend (`INFORMES_STATIC_DIR` vacío), o
- redirigir `/informes/` a `https://informes.cacharolo.es` **conservando el
  fragmento**. El informe compartido viaja dentro del `#...`, así que una
  redirección que lo pierda convierte cada enlace antiguo en una página vacía.
  El navegador conserva el fragmento en un 301/302 si el destino no trae uno
  propio; aun así conviene comprobarlo con un enlace real antes de darlo por
  bueno.
