import { useEffect, useRef, useState } from 'react';
import { parseCsv, serializarCsv } from '../lib/csv';
import { IconoBorrar, IconoDescargar, IconoDeshacer, IconoDuplicar } from './Iconos';

interface Documento {
  nombre: string;
  separador: string;
  /** La fila 0 es la cabecera; de la 1 en adelante, los datos. */
  filas: string[][];
}

/** Hasta aquí llega el «deshacer». Son filas de texto: no pesan nada. */
const PASOS_ATRAS = 200;

/**
 * Editor de CSV. Existe para no tener que abrir una hoja de cálculo cada vez
 * que hay que corregir una línea: se carga el archivo, se toca lo que haga
 * falta y se descarga listo para volver a subirlo a las otras pestañas.
 *
 * Dos cosas lo gobiernan todo:
 *
 *  - **La cabecera no se toca.** Es lo que las otras pestañas usan para saber
 *    qué es cada columna, así que aquí sólo sirve de rótulo —fijo, siempre a la
 *    vista— y no se puede editar sin querer.
 *  - **Nada se pierde en silencio.** Cada cambio es deshacible, cargar otro
 *    archivo con trabajo sin guardar pregunta antes, y salir de la página
 *    también. Lo peor que puede hacer un editor es tragarse una fila.
 */
export function EditorCsv() {
  const [documento, setDocumento] = useState<Documento | null>(null);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [sinDescargar, setSinDescargar] = useState(false);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const tablaRef = useRef<HTMLDivElement>(null);
  const pila = useRef<Documento[]>([]);
  // Qué celda se estaba retocando, para que escribir seguido en una sola cuente
  // como un paso atrás y no como una pulsación por letra.
  const ultimoRetoque = useRef<string | null>(null);

  const cabecera = documento?.filas[0] ?? [];
  const datos = documento?.filas.slice(1) ?? [];

  function cambiar(siguiente: Documento, retoque: string | null = null) {
    if (documento && (retoque === null || retoque !== ultimoRetoque.current)) {
      pila.current.push(documento);
      if (pila.current.length > PASOS_ATRAS) pila.current.shift();
    }
    ultimoRetoque.current = retoque;
    setDocumento(siguiente);
    setPuedeDeshacer(pila.current.length > 0);
    setSinDescargar(true);
  }

  function deshacer() {
    const previo = pila.current.pop();
    if (!previo) return;
    ultimoRetoque.current = null;
    setDocumento(previo);
    setPuedeDeshacer(pila.current.length > 0);
    setSinDescargar(true);
  }

  /** Rellena hasta el ancho de la cabecera, sin recortar nunca por la derecha. */
  function conAncho(fila: string[]): string[] {
    const copia = [...fila];
    while (copia.length < cabecera.length) copia.push('');
    return copia;
  }

  function editarCelda(indice: number, columna: number, valor: string) {
    if (!documento) return;
    const filas = documento.filas.map((fila, i) => {
      if (i !== indice) return fila;
      const copia = conAncho(fila);
      copia[columna] = valor;
      return copia;
    });
    cambiar({ ...documento, filas }, `${indice}:${columna}`);
  }

  function duplicarFila(indice: number) {
    if (!documento) return;
    const filas = [...documento.filas];
    filas.splice(indice + 1, 0, conAncho(filas[indice]));
    cambiar({ ...documento, filas });
  }

  function borrarFila(indice: number) {
    if (!documento) return;
    cambiar({ ...documento, filas: documento.filas.filter((_, i) => i !== indice) });
  }

  function anadirFila() {
    if (!documento) return;
    cambiar({ ...documento, filas: [...documento.filas, cabecera.map(() => '')] });
    // La fila nueva va al final, que con una tabla larga queda fuera de la vista.
    requestAnimationFrame(() => {
      const caja = tablaRef.current;
      if (caja) caja.scrollTop = caja.scrollHeight;
    });
  }

  async function cargar(file: File | undefined) {
    if (!file) return;
    if (
      sinDescargar &&
      !confirm('Tienes cambios sin descargar. ¿Cargar otro archivo y perderlos?')
    ) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    try {
      const { filas, separador } = parseCsv(await file.text());
      if (filas.length === 0) throw new Error('El archivo no tiene ninguna fila.');

      // Todas las filas se igualan a la más ancha, cabecera incluida. Si alguna
      // trae más celdas que la cabecera, la rejilla las enseña igualmente en
      // vez de dejarlas fuera y perderlas en cuanto se toque esa fila.
      const ancho = Math.max(...filas.map((fila) => fila.length));
      const parejas = filas.map((fila) => [
        ...fila,
        ...Array.from({ length: ancho - fila.length }, () => ''),
      ]);

      pila.current = [];
      ultimoRetoque.current = null;
      setPuedeDeshacer(false);
      setDocumento({ nombre: file.name, separador, filas: parejas });
      setSinDescargar(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el CSV.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function descargar() {
    if (!documento) return;
    // Una fila añadida y dejada en blanco no se escribe: saldría como «;;;» y
    // los lectores la descartarían igualmente al volver a entrar.
    const conDatos = documento.filas.filter(
      (fila, indice) => indice === 0 || fila.some((celda) => celda.trim() !== ''),
    );
    // El BOM por delante es lo que hace que Excel abra los acentos bien en
    // Windows; los lectores de esta misma aplicación lo descartan al entrar.
    const texto = '\uFEFF' + serializarCsv(conDatos, documento.separador);
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));

    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = documento.nombre;
    enlace.rel = 'noopener';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setSinDescargar(false);
  }

  // Cerrar la pestaña con trabajo a medias es la única forma de perderlo del
  // todo: el navegador se encarga de preguntar.
  useEffect(() => {
    if (!sinDescargar) return;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = '';
    };
    addEventListener('beforeunload', avisar);
    return () => removeEventListener('beforeunload', avisar);
  }, [sinDescargar]);

  return (
    <section
      className={`editor ${documento ? '' : 'editor--vacio'}`}
      aria-labelledby="editor-titulo"
      onKeyDown={(evento) => {
        // Vale también desde dentro de una celda: aquí deshacer una fila
        // borrada importa más que deshacer las últimas letras escritas.
        if ((evento.ctrlKey || evento.metaKey) && !evento.shiftKey && evento.key === 'z') {
          evento.preventDefault();
          deshacer();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        onChange={(evento) => void cargar(evento.target.files?.[0])}
      />

      {!documento ? (
        <>
          <div className="vacio editor__bienvenida">
            <h2 id="editor-titulo" className="vacio__titulo">
              Edita un CSV y descárgalo
            </h2>
            <p>
              Para cambiar una línea sin salir de aquí: se carga el archivo, se corrige lo que haga
              falta y se descarga listo para volver a subirlo al histórico o al desglose por
              cliente. Se abre en tu navegador; ni se sube ni se guarda en ningún sitio.
            </p>
          </div>

          <div
            className={`zona editor__zona no-imprimir ${arrastrando ? 'zona--activa' : ''}`}
            onDragOver={(evento) => {
              evento.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(evento) => {
              evento.preventDefault();
              setArrastrando(false);
              void cargar(evento.dataTransfer.files[0]);
            }}
          >
            <button
              className="boton boton--primario"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              Elegir un CSV
            </button>
            <p className="zona__pista">O arrástralo aquí.</p>
          </div>
        </>
      ) : (
        <>
          <header className="editor__cabecera">
            <div>
              <p className="eyebrow">Editor</p>
              <h2 id="editor-titulo" className="editor__titulo">
                {documento.nombre}
              </h2>
              <p className="editor__resumen">
                {datos.length} {datos.length === 1 ? 'fila' : 'filas'} · {cabecera.length}{' '}
                {cabecera.length === 1 ? 'columna' : 'columnas'} · separador «{documento.separador}»
                {sinDescargar && <span className="editor__pendiente">Sin descargar</span>}
              </p>
            </div>

            <div className="editor__acciones-cabecera no-imprimir">
              <button className="boton" type="button" onClick={() => inputRef.current?.click()}>
                Cargar otro
              </button>
              <button
                className="boton"
                type="button"
                disabled={!puedeDeshacer}
                onClick={deshacer}
                title="Deshacer el último cambio (Ctrl+Z)"
              >
                <IconoDeshacer />
                Deshacer
              </button>
              <button className="boton boton--primario" type="button" onClick={descargar}>
                <IconoDescargar />
                Descargar CSV
              </button>
            </div>
          </header>

          {error && (
            <div className="aviso" role="alert">
              {error}
            </div>
          )}

          <div className="editor__tabla-wrap" ref={tablaRef}>
            <table className="editor__tabla">
              <thead>
                <tr>
                  <th className="editor__esquina" scope="col">
                    <span className="eyebrow">Fila</span>
                  </th>
                  {cabecera.map((titulo, columna) => (
                    <th key={columna} scope="col" title={titulo}>
                      {titulo.trim() || <span className="editor__sin-nombre">columna {columna + 1}</span>}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {datos.map((fila, posicion) => {
                  const indice = posicion + 1;
                  return (
                    <tr key={indice}>
                      <th className="editor__fila-cabecera" scope="row">
                        <span className="editor__numero num">{indice}</span>
                        <span className="editor__acciones no-imprimir">
                          <button
                            className="editor__accion"
                            type="button"
                            title={`Duplicar la fila ${indice}`}
                            aria-label={`Duplicar la fila ${indice}`}
                            onClick={() => duplicarFila(indice)}
                          >
                            <IconoDuplicar />
                          </button>
                          <button
                            className="editor__accion editor__accion--borrar"
                            type="button"
                            title={`Borrar la fila ${indice}`}
                            aria-label={`Borrar la fila ${indice}`}
                            onClick={() => borrarFila(indice)}
                          >
                            <IconoBorrar />
                          </button>
                        </span>
                      </th>

                      {cabecera.map((titulo, columna) => {
                        const valor = fila[columna] ?? '';
                        const etiqueta = `${titulo || `columna ${columna + 1}`}, fila ${indice}`;
                        const alEscribir = (texto: string) => editarCelda(indice, columna, texto);

                        return (
                          <td key={columna}>
                            {valor.includes('\n') ? (
                              // Un `input` de HTML se come los saltos de línea al
                              // asignarle el valor, así que una nota escrita en dos
                              // renglones se perdería nada más tocarla.
                              <textarea
                                className="editor__celda editor__celda--varias-lineas"
                                value={valor}
                                aria-label={etiqueta}
                                rows={2}
                                spellCheck={false}
                                onChange={(evento) => alEscribir(evento.target.value)}
                              />
                            ) : (
                              <input
                                className="editor__celda"
                                value={valor}
                                aria-label={etiqueta}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(evento) => alEscribir(evento.target.value)}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="editor__pie no-imprimir">
            <button className="boton" type="button" onClick={anadirFila}>
              Añadir fila
            </button>
            <p className="editor__nota">
              La cabecera no se puede editar: es lo que el resto de la aplicación usa para saber qué
              hay en cada columna. Al descargar se respetan el separador original y las comillas de
              las celdas que lo necesiten.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
