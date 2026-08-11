# Informe de toneladas

Aplicación para consultar el informe diario de toneladas por cliente y
**simular escenarios de suministro** sobre la marcha: se cambia la media diaria
de un cliente y la estimación mensual del conjunto se recalcula al instante.

La pestaña **Histórico** añade una comparativa mensual por años a partir de un
CSV. Dibuja una línea por año, calcula automáticamente la media de cada año y
permite consultar el desglose completo de cada punto mediante hover,
foco o clic. Los años y las referencias estadísticas se pueden activar o
desactivar, y los puntos con notas se señalan con un asterisco.

No se publica ningún histórico de ejemplo: la pestaña aparece vacía hasta que
el usuario carga su CSV. Una vez cargado, el CSV y los filtros se comprimen en
el fragmento `#h=` del enlace, igual que el informe diario viaja en `#i=`. El
fragmento no se envía al servidor; quien no tenga el enlace no recibe los datos.

**No hay servidor, ni base de datos, ni contraseñas.** Se carga el PDF del día
y el informe entero pasa a viajar dentro del enlace: compartir la dirección es
compartir el informe.

## Cómo funciona

El PDF se lee en el navegador de quien lo carga y no sale de ahí. Los números
extraídos se comprimen y se guardan en el **fragmento** de la URL —lo que sigue
a la `#`—, que el navegador nunca envía al servidor. Con el informe de ejemplo,
1.627 caracteres de datos quedan en una dirección de **591 caracteres**, que
cabe en cualquier correo o mensaje.

De ahí se derivan tres cosas que no hay que construir ni mantener: no hay nada
que autenticar, nada que se pueda filtrar de un almacén, y nadie depende de que
otro haya subido el informe. Tampoco se guarda nada en el navegador: ni
`localStorage`, ni cookies, ni caché de datos.

A cambio, quien tenga el enlace ve las cifras, así que el enlace se reparte con
el mismo cuidado que se repartiría el PDF.

### Qué se lee del PDF

- La cabecera: periodo, días trabajados, días laborables restantes, total del
  mes y media por día.
- Las tablas de especies (Eucalipto, Pinos y Otras Especies), de las que se
  toma, por cliente, la **suma de las dos quincenas** y la columna
  **TN/Pendientes Cupo**.

La columna «Total» que imprime el PDF se ignora a propósito: no cuadra con la
suma de sus propias quincenas.

### Qué se lee del CSV histórico

El CSV admite separador de punto y coma o coma y necesita las columnas `mes`,
`anio` y `tn_totales`. Si incluye `tn_eucalipto`, `setubal`, `tn_pino`, `viana`
y `notas`, esos datos aparecen en la ficha interactiva de cada punto. Las filas
futuras sin total se consideran huecos y no entran en la media.
El archivo se lee localmente y sólo pasa a formar parte de la URL cuando se
genera el enlace compartible.

### Los cálculos

```
media diaria del cliente  = suma de quincenas / días trabajados
estimación mensual        = media diaria × (días trabajados + días restantes)
```

La fila superior parte de los totales que encabezan el PDF, y al editar un
cliente **sólo se le traslada la diferencia** respecto a su dato original. Es la
misma aritmética del informe en papel: si Finsa pasa de 60 a 180 TN/día, la
estimación del mes sube de 15.464 a 15.464 + (3.780 − 1.260) = **17.984 TN**.

Cada bloque del resumen enseña dos cifras: la que firma la cabecera del PDF y la
que sale de sumar cliente a cliente. No coinciden —el informe no cuadra consigo
mismo— y se muestran las dos en vez de elegir por el lector.

Las simulaciones también van en el enlace, así que se puede compartir un
escenario y no sólo el informe.

### Pendiente de cupo

El estado del cupo se calcula exclusivamente con los datos actuales. El objetivo
se reconstruye sumando al acumulado original las toneladas que el informe marca
como pendientes; no se usa la estimación de fin de mes. La tabla indica de forma
directa si está «Cubierto» o «No cubierto».

## Puesta en marcha en local

Hace falta Node 22. Si no lo tienes en el sistema, con conda:

```bash
conda create -y -n informe -c conda-forge nodejs=22 && conda activate informe
```

Después:

```bash
npm install
npm run dev
```

```bash
npm test          # parser, cálculos y codificación en la URL
npm run build     # comprobación de tipos + compilación
npm run preview   # sirve lo compilado, como en producción
```

## Despliegue

El sitio es estático: se puede servir desde cualquier sitio, incluso abrir el
`index.html` desde el disco. Las rutas son relativas, así que funciona igual en
la raíz de un dominio que colgando de un subdirectorio.

Está preparado para **GitHub Pages**, que no necesita cuenta nueva ni tarjeta:

1. En el repositorio, *Settings → Pages → Source: **GitHub Actions***.
2. Cada `push` a `main` compila, pasa los tests y publica
   ([`.github/workflows/desplegar.yml`](.github/workflows/desplegar.yml)).
3. Para el dominio propio, en *Settings → Pages → Custom domain* poner
   `informes.cacharolo.es`. El fichero [`public/CNAME`](public/CNAME) ya lo
   declara. En el panel de DNS de Hostalia:

   | Tipo | Nombre | Valor |
   | --- | --- | --- |
   | CNAME | `informes` | `edgarfigueirasmpc.github.io` |

   El nombre del subdominio tiene que coincidir **exactamente** con el de
   `public/CNAME`: si no, GitHub rechaza el dominio en cada despliegue.

4. Marcar *Enforce HTTPS* cuando GitHub termine de emitir el certificado.

## Estructura

```
src/lib/parseReport.ts   Reconstruye las tablas del PDF a partir de coordenadas
src/lib/pdf.ts           Carga pdf.js (perezosa: sólo al cargar un informe)
src/lib/share.ts         Empaqueta el informe dentro de la URL
src/lib/text.ts          Números en formato español y arreglo del mojibake
src/lib/model.ts         Tipos y toda la aritmética de simulación
src/components/          Interfaz
scripts/extraer-logo.py  Recorta los logos del mockup y genera los iconos
```

`pdfjs-dist` va en su propio fragmento y se descarga sólo al cargar un PDF:
quien abre un enlace que ya trae el informe no lo llega a pedir.

## Los logos

- [`src/assets/logo.png`](src/assets/logo.png) — la marca de la cabecera.
- [`src/assets/mpc.png`](src/assets/mpc.png) — la firma corporativa del pie.
- `public/favicon-32.png`, `apple-touch-icon.png`, `icono.png` — iconos.

Todos salen de los originales `logo-original.png` y `logo-sticker.png` con:

```bash
python scripts/extraer-logo.py logo-original.png logo-sticker.png
```
