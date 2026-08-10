# Informe de toneladas

Aplicación para consultar el informe diario de toneladas por cliente y **simular
escenarios de suministro** sobre la marcha: se cambia la media diaria de un
cliente y la estimación mensual del conjunto se recalcula al instante.

Una persona sube el PDF del día y el resto lo consulta en
`informe.cacharolo.es`. Sólo se guarda el último informe: cada publicación pisa
la anterior.

## Cómo funciona

El PDF **se lee en el navegador de quien lo sube**; al servidor sólo viajan los
números ya extraídos. El documento nunca se almacena en ningún sitio.

Del PDF sólo se usan:

- La cabecera: periodo, días trabajados, días laborables restantes, total del
  mes y media por día.
- Las tablas de especies (Eucalipto, Pinos y Otras Especies), de las que se
  toma, por cliente, la **suma de las dos quincenas** y la columna
  **TN/Pendientes Cupo**.

La columna «Total» que imprime el PDF se ignora a propósito: no cuadra con la
suma de sus propias quincenas.

### Los cálculos

```
media diaria del cliente  = suma de quincenas / días trabajados
estimación mensual        = media diaria × (días trabajados + días restantes)
```

La fila superior parte de los totales que encabezan el PDF, y al editar un
cliente **sólo se le traslada la diferencia** respecto a su dato original. Es la
misma aritmética del informe en papel: si Finsa pasa de 60 a 180 TN/día, la
estimación del mes sube de 15.464 a 15.464 + (3.780 − 1.260) = **17.984 TN**.

Las simulaciones son de cada persona: se guardan en su navegador, no se
publican, y caducan cuando se sube un informe nuevo.

### Pendiente de cupo

Se compara el cupo pendiente de cada cliente con lo que se estima entregarle en
los días que quedan de mes, y se marca en verde, ámbar o rojo según se cubra con
holgura, justo o no llegue. Si la lectura correcta del dato fuera la contraria
(que el cupo sea un techo que no se debe superar), se cambia en
`cupoStatus()`, en [`src/lib/model.ts`](src/lib/model.ts).

## Puesta en marcha en local

Hace falta Node 22. Si no lo tienes en el sistema, con conda:

```bash
conda create -y -n informe -c conda-forge nodejs=22 && conda activate informe
```

Después:

```bash
npm install
cp .dev.vars.example .dev.vars
npm start
```

Queda en <http://localhost:8788>, con las funciones y un KV local. `npm run dev`
levanta sólo el frontend (más rápido para tocar estilos, pero sin API).

```bash
npm test        # tests del parser y de los cálculos, contra un PDF real
npm run build   # comprobación de tipos + compilación
```

## Despliegue en Cloudflare Workers

Se despliega como un **Worker con assets estáticos**: el mismo Worker sirve el
sitio compilado y la API. El dominio puede seguir en Hostalia, sólo hay que
apuntarle un CNAME.

**1. Crear el almacén, antes que nada.** *Storage & Databases → KV → Create*,
con el nombre `informe`. Copiar el **Namespace ID** que aparece al crearlo y
pegarlo en [`wrangler.jsonc`](wrangler.jsonc), sustituyendo `"PENDIENTE"`:

```jsonc
"kv_namespaces": [{ "binding": "INFORME", "id": "el-id-que-te-ha-dado" }]
```

Ese identificador no es un secreto y va versionado a propósito: en el modelo de
Workers manda el fichero de configuración, así que un binding añadido a mano
desde el panel se perdería en el siguiente despliegue.

**2. Subir el cambio a GitHub** (`git push`).

**3. Crear la aplicación.** En Cloudflare, *Compute (Workers) → Create →
Import a repository*, y elegir el repositorio. Los comandos:

| Campo | Valor |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

**4. Poner las contraseñas.** En el Worker, *Settings → Variables and Secrets*,
añadirlas **como Secret** (no como texto plano):

| Variable | Para qué |
| --- | --- |
| `VIEW_PASSWORD` | La que se reparte a los compañeros. |
| `ADMIN_PASSWORD` | Opcional. Ver más abajo. |
| `AUTH_SECRET` | Firma las cookies de sesión. No se comparte con nadie. |

Para generar el secreto:

```bash
openssl rand -base64 32
```

Como la contraseña se reparte, que sea larga y no adivinable: es lo único que
separa el informe de internet.

Los secretos se enganchan en el despliegue, no en caliente: si se añaden después
de la primera compilación, hay que **volver a desplegar** para que el Worker los
vea.

**5. El dominio.** En el Worker, *Settings → Domains & Routes → Add → Custom
domain*, e introducir `informe.cacharolo.es`. Cloudflare dará un destino del
tipo `informe.<subdominio>.workers.dev`. En el panel de DNS de Hostalia:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| CNAME | `informe` | el destino que indique Cloudflare |

El certificado tarda unos minutos en emitirse.

**6. Publicar el primer informe.** Entrar con la contraseña de administración y
subir el PDF del día.

## Quién puede entrar y quién puede publicar

No hay usuarios ni cuentas. Al acertar la contraseña, el servidor devuelve una
cookie firmada con HMAC-SHA256 que sólo contiene el rol y la fecha de
caducidad (30 días); no se guarda ninguna sesión, la firma es lo que impide
falsificarla.

Hay dos modos, y los distingue si `ADMIN_PASSWORD` está puesta o no:

**Con `ADMIN_PASSWORD`.** Dos contraseñas: la de consulta sólo deja mirar y
simular, la de administración deja además publicar. Es la recomendable si el
informe lo sube siempre la misma persona, porque nadie más puede pisarlo por
error.

**Sin `ADMIN_PASSWORD`** (déjala sin crear, o bórrala). Una única contraseña:
quien la sabe entra y puede publicar. Más cómodo de repartir, a cambio de que
cualquiera pueda sustituir el informe del día — y como sólo se guarda el último,
no hay vuelta atrás.

Cambiar de modo es añadir o quitar esa variable en Cloudflare; no hay que tocar
código ni volver a desplegar.

Simular cifras lo puede hacer cualquiera en los dos modos: los ajustes se
quedan en el navegador de cada uno y no afectan a lo que ven los demás.

## Estructura

```
src/lib/parseReport.ts   Reconstruye las tablas del PDF a partir de coordenadas
src/lib/pdf.ts           Carga pdf.js (perezosa: sólo al subir un informe)
src/lib/text.ts          Números en formato español y arreglo del mojibake
src/lib/model.ts         Tipos y toda la aritmética de simulación
src/components/          Interfaz
worker/                  El Worker: enrutado, y la API bajo /api
shared/                  Sesiones firmadas y acceso a KV
```

`pdfjs-dist` va en su propio fragmento y se descarga sólo al subir un PDF: quien
únicamente consulta el informe se descarga poco más de 50 kB.

## El logo y el color

El logo original (`logo-original.png`) viene montado sobre un mockup de
pegatina, con fondo gris y halo blanco. En vez de redibujarlo, se recorta del
propio fichero: fondo, halo y reborde son acromáticos y el dibujo no, así que
basta con separarlos por saturación y las formas quedan intactas.

```bash
python scripts/extraer-logo.py logo-original.png logo-sticker.png
```

Eso regenera `public/logo.png` (cabecera), `favicon-32.png`, `apple-touch-icon.png`,
`icono.png` y `mpc.png`. Si algún día cambia el logo, se sustituye el original y
se vuelve a lanzar. Al no llevar blancos propios, el recorte se sostiene igual
sobre fondo claro que oscuro.

El segundo fichero es el monograma **MPC**, que aparece como firma corporativa al
pie de la página y de la pantalla de acceso. A ése no se le aplica el recorte por
saturación —su filo blanco forma parte del dibujo y separa las letras—, sólo se
recorta y se escala. Para quitarlo, basta con eliminar `<FirmaMpc />` de
[`src/App.tsx`](src/App.tsx) y [`src/components/Gate.tsx`](src/components/Gate.tsx).

Los dos colores corporativos no son decorado, tienen significado y conviene
respetarlo al tocar la interfaz:

| Color | Significa |
| --- | --- |
| Azul `#2045b0` | Lo consolidado: total acumulado, cupo que se cubre |
| Naranja `#ff4912` | Lo proyectado y lo simulado: estimaciones, ediciones, avisos |
| Ámbar | Las columnas que se pueden escribir, y los estados intermedios |

Están definidos como variables en [`src/styles.css`](src/styles.css).
