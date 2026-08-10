import { useRef, useState } from 'react';
import type { Report } from '../lib/model';
import { ApiError, publishReport } from '../lib/api';
import { fechaCorta } from '../lib/format';

interface Props {
  onPublished: (report: Report) => void;
}

type Estado =
  | { fase: 'reposo' }
  | { fase: 'leyendo' }
  | { fase: 'publicando' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'listo'; cuando: string };

/**
 * Subida del PDF diario. El PDF se lee aquí, en el navegador: al servidor sólo
 * viajan los números ya extraídos, nunca el documento.
 */
export function Publisher({ onPublished }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'reposo' });
  const [avisos, setAvisos] = useState<string[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ocupado = estado.fase === 'leyendo' || estado.fase === 'publicando';

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

      setEstado({ fase: 'publicando' });
      await publishReport(report);

      onPublished(report);
      setEstado({
        fase: 'listo',
        cuando: `${fechaCorta(report.header.desde)} – ${fechaCorta(report.header.hasta)}`,
      });
    } catch (err) {
      setEstado({
        fase: 'error',
        mensaje:
          err instanceof ApiError || err instanceof Error
            ? err.message
            : 'No se ha podido leer el PDF.',
      });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className="publicar no-imprimir">
      <div className="eyebrow">Publicar informe</div>

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
          className="boton"
          type="button"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
        >
          {estado.fase === 'leyendo'
            ? 'Leyendo el PDF'
            : estado.fase === 'publicando'
              ? 'Publicando'
              : 'Elegir el PDF del día'}
        </button>

        <p className="zona__pista">
          O arrástralo aquí. Se lee en tu navegador y sustituye al informe anterior para todos.
        </p>
      </div>

      {estado.fase === 'error' && (
        <div className="aviso" role="alert">
          {estado.mensaje}
        </div>
      )}

      {estado.fase === 'listo' && (
        <div className="aviso">Publicado el informe del {estado.cuando}. Ya lo ven todos.</div>
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
