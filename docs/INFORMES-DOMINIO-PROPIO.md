# Informes MPC en su propio dominio

La versión definitiva y única es **https://informes.cacharolo.es**, un sitio
estático en GitHub Pages. Habla directamente con la API de MPC Cloud
(`cloud.mpc1.es`) y con el login delegado de MPC Files (`datos.mpc1.es`). No
hay pasarela nueva, ni almacenamiento propio, ni copia de los documentos.

El alojamiento da igual mientras sirva ese origen exacto: el CORS se abre para
`https://informes.cacharolo.es`, no para un proveedor. Se queda en Pages, que
ya sirve ese dominio, en lugar de mudarlo a Render, porque lo único que
aportaba la mudanza eran las cabeceras de seguridad, y casi todas se recuperan
dentro del HTML (ver más abajo).

## Cómo encaja cada pieza

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Informes | GitHub Pages, `informes.cacharolo.es` | HTML/JS/CSS. Ni servidor ni secretos. |
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
`allow_credentials` desactivado. Tiene que ser https, salvo en `localhost`, que
es como se llega al staging por un túnel; el nombre del dominio no está clavado
en el código a propósito, para que el staging pruebe exactamente la misma
configuración que se despliega. Sin `INFORMES_ORIGIN`, Cloud se comporta como
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

3. **GitHub** — nada que configurar: el despliegue de siempre
   ([`desplegar.yml`](../.github/workflows/desplegar.yml)) pasa a compilar
   `build:publico` y a publicar `dist-publico`. **Fusionar a `main` es publicar**:
   hasta entonces el sitio actual sigue sirviendo la versión sin Cloud. El
   dominio y el DNS no se tocan.

Comprobación de que el origen está admitido:

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

## Cabeceras: lo que Pages no deja poner

GitHub Pages no manda ninguna cabecera de seguridad y no admite configurarlas.
La política de contenido se inyecta en el HTML al compilar
([`vite.config.ts`](../vite.config.ts)), con los mismos orígenes con los que se
compila: así dice exactamente con quién puede hablar esa compilación, y en las
pruebas locales dice localhost. Vale todo menos `frame-ancestors`, que no
funciona en una etiqueta meta; en su lugar, la aplicación no se monta si está
dentro de un marco ajeno ([`src/main.tsx`](../src/main.tsx)).

Lo que se queda sin equivalente es `Strict-Transport-Security`. El dominio se
sirve sólo por https y el navegador no guarda la preferencia entre visitas. Si
algún día importa, es razón suficiente para mudar el alojamiento a algo que
mande cabeceras; hoy no compensa.

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
