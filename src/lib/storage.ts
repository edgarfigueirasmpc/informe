/**
 * Caché local. Sirve para dos cosas: pintar el informe al instante mientras se
 * pide el de verdad al servidor, y recordar los ajustes de simulación de cada
 * persona (que son suyos, no se publican a los demás).
 */

import type { Overrides, Report } from './model';
import { EMPTY_OVERRIDES } from './model';

const REPORT_KEY = 'informe:ultimo';
const OVERRIDES_KEY = 'informe:ajustes';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Modo privado o cuota llena: la app funciona igual, sólo pierde la caché.
  }
}

function forget(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nada que hacer */
  }
}

export function cachedReport(): Report | null {
  const report = read<Report>(REPORT_KEY);
  return report?.header && Array.isArray(report.clients) ? report : null;
}

export function cacheReport(report: Report): void {
  write(REPORT_KEY, report);
}

export function clearCache(): void {
  forget(REPORT_KEY);
  forget(OVERRIDES_KEY);
}

interface StoredOverrides extends Overrides {
  /** Los ajustes pertenecen a un informe concreto. */
  publishedAt: string;
}

/**
 * Los ajustes caducan con el informe: si se ha publicado uno nuevo, simular
 * sobre las cifras del anterior daría un resultado engañoso.
 */
export function loadOverrides(report: Report): Overrides {
  const stored = read<StoredOverrides>(OVERRIDES_KEY);
  if (!stored || stored.publishedAt !== report.publishedAt) {
    if (stored) forget(OVERRIDES_KEY);
    return EMPTY_OVERRIDES;
  }
  return { clients: stored.clients ?? {}, diasRestantes: stored.diasRestantes };
}

export function saveOverrides(report: Report, overrides: Overrides): void {
  const vacio = Object.keys(overrides.clients).length === 0 && overrides.diasRestantes === undefined;
  if (vacio) {
    forget(OVERRIDES_KEY);
    return;
  }
  write(OVERRIDES_KEY, { ...overrides, publishedAt: report.publishedAt } satisfies StoredOverrides);
}
