/**
 * El informe entero viaja en la URL. No hay servidor, ni base de datos, ni
 * sesión: compartir el enlace es compartir el informe.
 *
 * Va en el **fragmento** (lo que sigue a `#`) y no en la query a propósito: el
 * navegador nunca envía el fragmento al servidor, así que las cifras no
 * aparecen en los registros de acceso del alojamiento ni se filtran por la
 * cabecera `Referer` al pinchar un enlace desde la página.
 *
 * Formato: `#i=<marca><base64url>`, donde la marca dice cómo se ha empaquetado
 * el contenido —comprimido o en claro— para poder cambiar de método sin romper
 * los enlaces ya repartidos.
 */

import type { ClientRecord, Overrides, Report, Species } from './model';

const CLAVE = 'i';

/** Primer carácter de la carga: cómo está empaquetado lo que viene detrás. */
const COMPRIMIDO = '1';
const EN_CLARO = '0';

/** Versión del esquema, dentro ya de los datos. */
const VERSION = 1;

export interface EstadoCompartido {
  report: Report;
  overrides: Overrides;
}

// ---------------------------------------------------------------------------
// Esquema compacto
//
// Se guarda como listas y no como objetos: los nombres de campo repetidos
// trece veces engordan la URL sin aportar nada, y aquí cada carácter cuenta.
// ---------------------------------------------------------------------------

type ClienteEmpaquetado = [
  nombre: string,
  pino: number,
  eucalipto: number,
  otras: number,
  cupo: number | null,
];

type Empaquetado = [
  version: number,
  desde: string,
  hasta: string,
  diasTrabajados: number,
  diasRestantes: number,
  totalMes: number,
  totalDiaAnterior: number,
  mediaDia: number,
  estimacionMes: number,
  generadoEn: string,
  origen: string,
  clientes: ClienteEmpaquetado[],
  ajustes: [nombre: string, media: number][],
  diasRestantesAjustados: number | null,
];

function empaquetar(report: Report, overrides: Overrides): Empaquetado {
  const h = report.header;
  return [
    VERSION,
    h.desde,
    h.hasta,
    h.diasTrabajados,
    h.diasRestantes,
    h.totalMes,
    h.totalDiaAnterior,
    h.mediaDia,
    h.estimacionMes,
    report.publishedAt,
    report.sourceFile,
    report.clients.map((c) => [c.name, c.tn.pino, c.tn.eucalipto, c.tn.otras, c.cupoPendiente]),
    Object.entries(overrides.clients),
    overrides.diasRestantes ?? null,
  ];
}

function esLista(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function numero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function desempaquetar(datos: unknown): EstadoCompartido | null {
  if (!esLista(datos) || datos[0] !== VERSION || datos.length < 12) return null;

  const crudos = datos[11];
  if (!esLista(crudos) || crudos.length === 0) return null;

  const clients: ClientRecord[] = [];
  for (const fila of crudos) {
    if (!esLista(fila) || typeof fila[0] !== 'string' || !fila[0]) return null;
    const tn: Record<Species, number> = {
      pino: numero(fila[1]),
      eucalipto: numero(fila[2]),
      otras: numero(fila[3]),
    };
    clients.push({
      name: fila[0],
      tn,
      cupoPendiente: typeof fila[4] === 'number' ? fila[4] : null,
    });
  }

  const diasTrabajados = numero(datos[3]);
  if (diasTrabajados <= 0) return null;

  const clientesAjustados: Record<string, number> = {};
  if (esLista(datos[12])) {
    for (const par of datos[12]) {
      if (esLista(par) && typeof par[0] === 'string' && typeof par[1] === 'number') {
        clientesAjustados[par[0]] = par[1];
      }
    }
  }

  return {
    report: {
      header: {
        desde: texto(datos[1]),
        hasta: texto(datos[2]),
        diasTrabajados,
        diasRestantes: numero(datos[4]),
        totalMes: numero(datos[5]),
        totalDiaAnterior: numero(datos[6]),
        mediaDia: numero(datos[7]),
        estimacionMes: numero(datos[8]),
      },
      clients,
      publishedAt: texto(datos[9]),
      sourceFile: texto(datos[10]),
    },
    overrides: {
      clients: clientesAjustados,
      diasRestantes: typeof datos[13] === 'number' ? datos[13] : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Compresión y transporte
// ---------------------------------------------------------------------------

const hayCompresion = typeof CompressionStream !== 'undefined';

async function comprimir(bytes: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new CompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function descomprimir(bytes: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto: string): Uint8Array {
  const relleno = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(relleno + '='.repeat((4 - (relleno.length % 4)) % 4));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Empaqueta el informe y los ajustes en la carga que va tras la almohadilla. */
export async function codificar(report: Report, overrides: Overrides): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(empaquetar(report, overrides)));
  if (!hayCompresion) return EN_CLARO + aBase64Url(json);
  return COMPRIMIDO + aBase64Url(await comprimir(json));
}

/** Deshace lo anterior. Devuelve null si el enlace está roto o no es de aquí. */
export async function descodificar(carga: string): Promise<EstadoCompartido | null> {
  if (carga.length < 2) return null;

  const marca = carga[0];
  const cuerpo = carga.slice(1);

  try {
    const bytes = deBase64Url(cuerpo);
    let json: Uint8Array;

    if (marca === COMPRIMIDO) json = await descomprimir(bytes);
    else if (marca === EN_CLARO) json = bytes;
    else return null;

    return desempaquetar(JSON.parse(new TextDecoder().decode(json)));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// La URL
// ---------------------------------------------------------------------------

/** Saca la carga del fragmento de una URL, si la lleva. */
export function cargaDelFragmento(fragmento: string): string | null {
  const limpio = fragmento.startsWith('#') ? fragmento.slice(1) : fragmento;
  if (!limpio) return null;
  const params = new URLSearchParams(limpio);
  return params.get(CLAVE);
}

export function fragmentoConCarga(carga: string): string {
  return `#${CLAVE}=${carga}`;
}

/**
 * Los navegadores admiten URLs muy largas, pero algunos gestores de correo y
 * de mensajería las parten. A partir de aquí conviene avisar.
 */
export const LARGO_INCOMODO = 4000;
