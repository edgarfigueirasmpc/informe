# Informes MPC dentro de MPC Cloud

## Arquitectura elegida

La versión integrada se sirve en **https://cloud.mpc1.es/informes/**. El sitio estático anterior puede seguir funcionando para cargas locales y enlaces compartidos; sus botones Cloud llevan a la versión integrada conservando el fragmento del informe. No envía credenciales ni intenta usar cookies de otro dominio. Los documentos locales no se suben automáticamente.

Informes llama a la API interna ya existente de Cloud, en el mismo origen:

- `/api/session`: login corporativo opcional, cookie HttpOnly/Secure/SameSite=Strict, CSRF y sesión única entre vistas y recargas. El token Django permanece en el servidor.
- `/api/fs/list`, `/api/files/content`: carpetas reales, ACL y lectura. La versión procede del ETag de la descarga, no de un listado anterior.
- `/api/uploads`: fragmentos SHA-256, límites existentes, cierre atómico y auditoría. Guardar como usa `onConflict: fail`; guardar el original usa `replace` con `ifMatch`. Cloud exige lectura, escritura y, para reemplazar, borrado. La versión anterior pasa a la papelera y conserva su privacidad.

**Política seleccionada: permisos efectivos de Django sobre el proyecto existente `nube`, más ACL de MPC Cloud.** No se selecciona una política adicional exclusiva de superusuarios y no se consulta `isStaff` en el frontend. No hay un proyecto `informes`, Files API ni acceso independiente al sistema de archivos. Los tiempos de caché de autorización siguen siendo los de Cloud (lectura 30 s, fragmentos 15 s por defecto; publicación y reemplazo consultan de nuevo a Django). Una revocación detiene la publicación.

Se mantiene el montaje actual de **data/mpc-cloud** y `DATA_ROOT` de MPC Cloud. `INFORMES_STATIC_DIR` contiene únicamente HTML/JS/CSS compilados; nunca documentos. No hay migración, copia de CSV/PDF corporativos ni cambio de formato. El editor usa el mismo serializador que la descarga local (separador, BOM y CRLF existentes).

Los archivos nuevos son privados por defecto; se puede elegir visibilidad para usuarios con acceso a la carpeta. Un reemplazo hereda la ACL del original. Un enlace de informe compartido sigue llevando los datos en el fragmento y puede abrirse sin sesión: compartirlo es una acción diferente de conceder acceso al archivo original.

La CSP de Cloud queda intacta fuera de `/informes/`; Informes admite sus estilos de gráficos en línea y el worker PDF del mismo origen. No se añade CORS ni secretos al frontend.

## Pruebas locales reproducibles

Requisitos: repositorios `informe` y `mpc-cloud` como carpetas hermanas, Node 24, dependencias instaladas (`npm ci` en ambos) y Chromium de Playwright instalado en MPC Cloud.

```sh
# En informe, con Node 24 en PATH:
npm test
npm --prefix ../mpc-cloud run typecheck
npm --prefix ../mpc-cloud test
./scripts/cloud-local.sh
# En otra terminal:
npm run test:cloud
```

Abrir **http://localhost:8180/informes/**. Usuarios ficticios, contraseña `secreto-123`: `ana` (todos los permisos), `escritor` (lectura/escritura sin reemplazo), `lector` (solo lectura), `sinacceso` (sin acceso a nube). Cloud normal: http://localhost:8180/.

El script usa Django simulado y un directorio temporal nuevo para cada ejecución, eliminado al salir. Nunca lee credenciales ni documentos de producción. `CLOUD_REPO` permite cambiar la ubicación del checkout. El test de navegador tiene el destino localhost fijo y crea su propia carpeta de prueba, sin borrar archivos ajenos. Las capturas quedan en `.cloud-test/`.

Las pruebas de contrato cubren sesión obligatoria en API, origen y CSRF, ACL, denegación de escritura, revocación y conflicto ETag. El navegador cubre carga local y enlace anónimo, CSV en las tres vistas, PDF con worker, reemplazo y conflicto conservando la edición, guardar como, sesión entre vistas/recarga y aparición en la interfaz normal de Cloud. Esto valida el contrato con Django simulado; la aceptación del entorno corporativo real debe hacerse en staging con su Django y un dataset de pruebas.

## Despliegue (no realizado)

1. Construir los dos artefactos desde estas ramas probadas:

```sh
# Desde informe, Node 24:
npm ci
npm run build:cloud
# Motor Docker local; no sube ni despliega nada:
docker build --platform linux/amd64 -t mpc-cloud:informes-base ../mpc-cloud
docker build --platform linux/amd64 -f Dockerfile.cloud -t mpc-cloud:con-informes .
```

2. Probar esa imagen en staging con Django corporativo, un dataset de pruebas y su origen HTTPS exacto. Confirmar lectura/escritura/reemplazo con una cuenta autorizada y denegación con una cuenta sin permisos. No reutilizar datos reales ni el Django simulado en producción.

3. Una vez aceptada, publicar la imagen en el registro habitual y cambiar **solo la imagen** de la aplicación MPC Cloud. Conservar el volumen `data/mpc-cloud`, `DATA_ROOT`, marcador de almacenamiento, `STORAGE_PROJECT=nube`, clave de servicio, Django y origen actuales. La imagen ya incluye `INFORMES_STATIC_DIR=/app/informes`. No hace falta CORS, DNS nuevo, proyecto de Files API ni migración. El reinicio invalida las sesiones en memoria existentes, como cualquier actualización de Cloud.

4. Abrir `https://cloud.mpc1.es/informes/`. El sitio antiguo puede conservarse; si se desea que esa URL sea el acceso habitual, actualizar su enlace de entrada. No redirigir automáticamente enlaces antiguos sin conservar sus fragmentos.

Alternativa al contenedor combinado: montar `dist-cloud` de solo lectura en `/app/informes` y fijar `INFORMES_STATIC_DIR=/app/informes` en la versión actualizada de Cloud. Ese montaje es de aplicación, no documental.

Reversión: volver a la imagen anterior. No se han cambiado esquemas ni rutas del almacenamiento; los documentos guardados siguen siendo archivos normales de Cloud y las versiones reemplazadas siguen en su papelera.
