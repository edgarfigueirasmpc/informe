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
import type { SharedHistorical } from './history';
import type { PinoBase, PinoMes, SharedPino } from './pino';

const CLAVE = 'i';
const CLAVE_HISTORICO = 'h';
const CLAVE_PINO = 'p';

/** Primer carácter de la carga: cómo está empaquetado lo que viene detrás. */
const COMPRIMIDO = '1';
const EN_CLARO = '0';

/** Versión del esquema, dentro ya de los datos. */
const VERSION = 1;
const VERSION_HISTORICO = 1;
const VERSION_PINO = 1;

export interface EstadoCompartido {
  report: Report;
  overrides: Overrides;
}

type HistoricoEmpaquetado = [
  version: number,
  csv: string,
  origen: string,
  aniosVisibles: number[],
  mostrarMedia: 0 | 1,
  reservadoLegacy: 0,
  mesFoco: number | null,
];

type PinoEmpaquetado = [
  version: number,
  csv: string,
  origen: string,
  aniosVisibles: number[],
  tiposFoco: string[],
  clientesFoco: string[],
  mesFoco: [anio: number, mesIndex: number] | null,
  base: PinoBase,
];

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

function empaquetarHistorico(historico: SharedHistorical): HistoricoEmpaquetado {
  return [
    VERSION_HISTORICO,
    historico.csv,
    historico.sourceName,
    historico.options.aniosVisibles,
    historico.options.mostrarMedia ? 1 : 0,
    0,
    historico.options.mesFoco,
  ];
}

function desempaquetarHistorico(datos: unknown): SharedHistorical | null {
  if (!esLista(datos) || datos[0] !== VERSION_HISTORICO || datos.length < 7) return null;
  if (typeof datos[1] !== 'string' || !datos[1].trim()) return null;

  const aniosVisibles = esLista(datos[3])
    ? datos[3].filter((anio): anio is number => typeof anio === 'number' && Number.isFinite(anio))
    : [];
  const mesFoco = typeof datos[6] === 'number' && datos[6] >= 0 && datos[6] <= 11 ? datos[6] : null;

  return {
    csv: datos[1],
    sourceName: typeof datos[2] === 'string' && datos[2] ? datos[2] : 'historico.csv',
    options: {
      aniosVisibles,
      mostrarMedia: datos[4] === 1,
      mesFoco,
    },
  };
}

function empaquetarPino(pino: SharedPino): PinoEmpaquetado {
  const { options } = pino;
  return [
    VERSION_PINO,
    pino.csv,
    pino.sourceName,
    options.aniosVisibles,
    options.tiposFoco,
    options.clientesFoco,
    options.mesFoco ? [options.mesFoco.anio, options.mesFoco.mesIndex] : null,
    options.base,
  ];
}

/** Texto no vacío, o null: los identificadores en blanco no son un foco. */
function idOpcional(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * La lista de lo elegido. Los enlaces de las primeras versiones traían aquí un
 * solo identificador —o `null`— en vez de una lista, y siguen abriéndose: lo
 * que llevaban dentro es exactamente una selección de uno.
 */
function listaDeIds(v: unknown): string[] {
  const suelto = idOpcional(v);
  if (suelto) return [suelto];
  if (!esLista(v)) return [];
  return v.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
}

function desempaquetarPino(datos: unknown): SharedPino | null {
  if (!esLista(datos) || datos[0] !== VERSION_PINO || datos.length < 8) return null;
  if (typeof datos[1] !== 'string' || !datos[1].trim()) return null;

  const mesCrudo = datos[6];
  const mesFoco: PinoMes | null =
    esLista(mesCrudo) &&
    typeof mesCrudo[0] === 'number' &&
    typeof mesCrudo[1] === 'number' &&
    mesCrudo[1] >= 0 &&
    mesCrudo[1] <= 11
      ? { anio: mesCrudo[0], mesIndex: mesCrudo[1] }
      : null;

  const base: PinoBase =
    datos[7] === 'cliente' || datos[7] === 'total' ? datos[7] : 'tipo';

  return {
    csv: datos[1],
    sourceName: idOpcional(datos[2]) ?? 'pino-por-cliente.csv',
    options: {
      aniosVisibles: esLista(datos[3])
        ? datos[3].filter((anio): anio is number => typeof anio === 'number' && Number.isFinite(anio))
        : [],
      tiposFoco: listaDeIds(datos[4]),
      clientesFoco: listaDeIds(datos[5]),
      mesFoco,
      base,
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
  return codificarDatos(empaquetar(report, overrides));
}

export async function codificarHistorico(historico: SharedHistorical): Promise<string> {
  return codificarDatos(empaquetarHistorico(historico));
}

export async function codificarPino(pino: SharedPino): Promise<string> {
  return codificarDatos(empaquetarPino(pino));
}

async function codificarDatos(datos: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(datos));
  if (!hayCompresion) return EN_CLARO + aBase64Url(json);
  return COMPRIMIDO + aBase64Url(await comprimir(json));
}

/** Deshace lo anterior. Devuelve null si el enlace está roto o no es de aquí. */
export async function descodificar(carga: string): Promise<EstadoCompartido | null> {
  const datos = await descodificarDatos(carga);
  return datos === null ? null : desempaquetar(datos);
}

export async function descodificarHistorico(carga: string): Promise<SharedHistorical | null> {
  const datos = await descodificarDatos(carga);
  return datos === null ? null : desempaquetarHistorico(datos);
}

export async function descodificarPino(carga: string): Promise<SharedPino | null> {
  const datos = await descodificarDatos(carga);
  return datos === null ? null : desempaquetarPino(datos);
}

async function descodificarDatos(carga: string): Promise<unknown | null> {
  if (carga.length < 2) return null;

  const marca = carga[0];
  const cuerpo = carga.slice(1);

  try {
    const bytes = deBase64Url(cuerpo);
    let json: Uint8Array;

    if (marca === COMPRIMIDO) json = await descomprimir(bytes);
    else if (marca === EN_CLARO) json = bytes;
    else return null;

    return JSON.parse(new TextDecoder().decode(json));
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

export function cargaHistoricaDelFragmento(fragmento: string): string | null {
  const limpio = fragmento.startsWith('#') ? fragmento.slice(1) : fragmento;
  if (!limpio) return null;
  return new URLSearchParams(limpio).get(CLAVE_HISTORICO);
}

export function cargaPinoDelFragmento(fragmento: string): string | null {
  const limpio = fragmento.startsWith('#') ? fragmento.slice(1) : fragmento;
  if (!limpio) return null;
  return new URLSearchParams(limpio).get(CLAVE_PINO);
}

export function fragmentoConCarga(carga: string): string {
  return `#${CLAVE}=${carga}`;
}

export function fragmentoConHistorico(carga: string): string {
  return `#${CLAVE_HISTORICO}=${carga}`;
}

export function fragmentoConPino(carga: string): string {
  return `#${CLAVE_PINO}=${carga}`;
}

/**
 * Los navegadores admiten URLs muy largas, pero algunos gestores de correo y
 * de mensajería las parten. A partir de aquí conviene avisar.
 */
export const LARGO_INCOMODO = 4000;
