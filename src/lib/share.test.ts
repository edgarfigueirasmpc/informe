import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parsePages, type PageText } from './parseReport';
import {
  cargaDelFragmento,
  cargaHistoricaDelFragmento,
  codificar,
  codificarHistorico,
  descodificar,
  descodificarHistorico,
  fragmentoConCarga,
  fragmentoConHistorico,
  LARGO_INCOMODO,
} from './share';
import { computeView, EMPTY_OVERRIDES, type Overrides } from './model';
import type { SharedHistorical } from './history';

const FIXTURE = path.join(import.meta.dirname, '__fixtures__', 'informe-2026-08-09.json');
const paginas = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as PageText[];
const { report } = parsePages(paginas, 'informe-mensual-9-8-2026.pdf');

describe('ida y vuelta por la URL', () => {
  it('devuelve el informe intacto', async () => {
    const carga = await codificar(report, EMPTY_OVERRIDES);
    const vuelta = await descodificar(carga);

    expect(vuelta).not.toBeNull();
    expect(vuelta!.report).toEqual(report);
    expect(vuelta!.overrides).toEqual({ clients: {}, diasRestantes: undefined });
  });

  it('conserva los ajustes, para poder compartir un escenario simulado', async () => {
    const ajustes: Overrides = {
      clients: { 'FINSA OREMBER': 180, 'UNIMADEIRAS (TOSCA)': 110 },
      diasRestantes: 12,
    };

    const vuelta = await descodificar(await codificar(report, ajustes));
    expect(vuelta!.overrides).toEqual(ajustes);
  });

  it('llega a los mismos números que antes de pasar por la URL', async () => {
    const antes = computeView(report, { clients: { 'FINSA OREMBER': 180 } });
    const vuelta = await descodificar(await codificar(report, { clients: { 'FINSA OREMBER': 180 } }));
    const despues = computeView(vuelta!.report, vuelta!.overrides);

    expect(despues.summary).toEqual(antes.summary);
    expect(despues.clients).toEqual(antes.clients);
  });

  it('respeta los acentos de los nombres portugueses', async () => {
    const vuelta = await descodificar(await codificar(report, EMPTY_OVERRIDES));
    expect(vuelta!.report.clients.map((c) => c.name)).toContain('SERRAÇAO MODERNA DE LAMELAS, LDA');
  });

  it('cabe de sobra en un enlace compartible', async () => {
    const carga = await codificar(report, EMPTY_OVERRIDES);
    const url = `https://informe.cacharolo.es/${fragmentoConCarga(carga)}`;

    expect(url.length).toBeLessThan(LARGO_INCOMODO);
    // Sólo caracteres seguros en una URL: nada que haya que escapar.
    expect(carga).toMatch(/^[0-9A-Za-z_-]+$/);
  });

  it('comprime de verdad', async () => {
    const crudo = JSON.stringify(report).length;
    const carga = (await codificar(report, EMPTY_OVERRIDES)).length;
    expect(carga).toBeLessThan(crudo / 2);
  });
});

describe('enlaces que no valen', () => {
  it('no revienta con basura', async () => {
    expect(await descodificar('')).toBeNull();
    expect(await descodificar('1')).toBeNull();
    expect(await descodificar('1esto-no-es-base64-valido!!')).toBeNull();
    expect(await descodificar('9AAAA')).toBeNull();
    expect(await descodificar('0' + btoa('{"no":"es el esquema"}'))).toBeNull();
  });

  it('rechaza un informe sin clientes o sin días trabajados', async () => {
    const sinClientes = '0' + btoa(JSON.stringify([1, 'a', 'b', 5, 16, 0, 0, 0, 0, '', '', []]));
    expect(await descodificar(sinClientes)).toBeNull();

    const sinDias = '0' + btoa(JSON.stringify([1, 'a', 'b', 0, 16, 0, 0, 0, 0, '', '', [['X', 1, 0, 0, null]]]));
    expect(await descodificar(sinDias)).toBeNull();
  });
});

describe('lectura del fragmento', () => {
  it('encuentra la carga y descarta lo que no lo es', () => {
    expect(cargaDelFragmento('#i=ABC')).toBe('ABC');
    expect(cargaDelFragmento('i=ABC')).toBe('ABC');
    expect(cargaDelFragmento('#otra=cosa')).toBeNull();
    expect(cargaDelFragmento('#')).toBeNull();
    expect(cargaDelFragmento('')).toBeNull();
  });

  it('distingue un histórico de un informe', () => {
    expect(cargaHistoricaDelFragmento('#h=HISTORICO')).toBe('HISTORICO');
    expect(cargaHistoricaDelFragmento('#i=INFORME')).toBeNull();
    expect(fragmentoConHistorico('ABC')).toBe('#h=ABC');
  });
});

describe('histórico compartido', () => {
  const historico: SharedHistorical = {
    csv: 'mes;anio;tn_totales\nEnero;2026;14848',
    sourceName: 'privado.csv',
    options: {
      aniosVisibles: [2024, 2025, 2026],
      mostrarMedia: true,
      mostrarMediana: false,
      mesFoco: 0,
    },
  };

  it('conserva el CSV y todos los filtros dentro del enlace', async () => {
    const carga = await codificarHistorico(historico);
    expect(await descodificarHistorico(carga)).toEqual(historico);
    expect(carga).toMatch(/^[0-9A-Za-z_-]+$/);
  });

  it('rechaza históricos rotos o vacíos', async () => {
    expect(await descodificarHistorico('0' + btoa(JSON.stringify([1, '', 'x.csv', [], 1, 0, null])))).toBeNull();
    expect(await descodificarHistorico('9AAAA')).toBeNull();
  });
});
