import { useRef, useState } from 'react';
import type { Report } from '../lib/model';
import { fechaCorta } from '../lib/format';

interface Props {
  onLoaded: (report: Report) => void;
  /** Con un informe ya en pantalla, cargar otro es sustituirlo. */
  conInforme: boolean;
}

type Estado =
  | { fase: 'reposo' }
  | { fase: 'leyendo' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'listo'; cuando: string };

/**
 * Lectura del PDF diario. Ocurre entera en el navegador: el documento no se
 * envía a ningún sitio ni se guarda, sólo se extraen los números y pasan a
 * formar parte del enlace.
 */
export function Loader({ onLoaded, conInforme }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'reposo' });
  const [avisos, setAvisos] = useState<string[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ocupado = estado.fase === 'leyendo';

  async function procesar(file: File | undefined) {
    if (!file || ocupado) return;

    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setEstado({ fase: 'error', mensaje: 'Ese fichero no es un PDF.' });
      return;
    }

    setAvisos([]);
    setEstado({ fase: 'leyendo' });

    try {
      const { parsePdfFile } = await import('../lib/pdf');
      const { report, warnings } = await parsePdfFile(file);
      setAvisos(warnings);
      onLoaded(report);
      setEstado({
        fase: 'listo',
        cuando: `${fechaCorta(report.header.desde)} – ${fechaCorta(report.header.hasta)}`,
      });
    } catch (err) {
      setEstado({
        fase: 'error',
        mensaje: err instanceof Error ? err.message : 'No se ha podido leer el PDF.',
      });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className={`cargador no-imprimir ${conInforme ? 'cargador--secundario' : ''}`}>
      <div className="eyebrow">{conInforme ? 'Cargar otro informe' : 'Cargar el informe'}</div>

      <div
        className={`zona ${arrastrando ? 'zona--activa' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void procesar(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => void procesar(e.target.files?.[0])}
        />

        <button
          className={`boton ${conInforme ? '' : 'boton--primario'}`}
          type="button"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
        >
          {ocupado ? 'Leyendo el PDF' : 'Elegir el PDF del día'}
        </button>

        <p className="zona__pista">
          O arrástralo aquí. Se lee en tu navegador; ni se sube ni se guarda en ningún sitio.
        </p>
      </div>

      {estado.fase === 'error' && (
        <div className="aviso" role="alert">
          {estado.mensaje}
        </div>
      )}

      {estado.fase === 'listo' && (
        <div className="aviso">
          Informe del {estado.cuando} listo. El enlace de arriba ya lo lleva dentro.
        </div>
      )}

      {avisos.length > 0 && (
        <div className="aviso">
          {avisos.map((a) => (
            <p key={a} style={{ margin: '0.25rem 0' }}>
              {a}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
