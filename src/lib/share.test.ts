import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parsePages, type PageText } from './parseReport';
import {
  cargaDelFragmento,
  cargaHistoricaDelFragmento,
  cargaPinoDelFragmento,
  codificar,
  codificarHistorico,
  codificarPino,
  descodificar,
  descodificarHistorico,
  descodificarPino,
  fragmentoConCarga,
  fragmentoConHistorico,
  fragmentoConPino,
  LARGO_INCOMODO,
} from './share';
import { computeView, EMPTY_OVERRIDES, type Overrides } from './model';
import type { SharedHistorical } from './history';
import type { SharedPino } from './pino';

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

  it('distingue el pino por cliente de las otras dos secciones', () => {
    expect(cargaPinoDelFragmento('#p=PINO')).toBe('PINO');
    expect(cargaPinoDelFragmento('#h=HISTORICO')).toBeNull();
    expect(cargaPinoDelFragmento('#i=INFORME')).toBeNull();
    expect(cargaHistoricaDelFragmento('#p=PINO')).toBeNull();
    expect(fragmentoConPino('ABC')).toBe('#p=ABC');
  });
});

describe('histórico compartido', () => {
  const historico: SharedHistorical = {
    csv: 'mes;anio;tn_totales\nEnero;2026;14848',
    sourceName: 'privado.csv',
    options: {
      aniosVisibles: [2024, 2025, 2026],
      mostrarMedia: true,
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

describe('pino por cliente compartido', () => {
  const pino: SharedPino = {
    csv: 'anio,mes,puntal_finsa,total_puntal_calculado\n2026,enero,1002,1002',
    sourceName: 'datos_pino_porcliente.csv',
    options: {
      aniosVisibles: [2025, 2026],
      tiposFoco: ['rolla_gorda', 'eucalipto'],
      clientesFoco: ['ecos_largos', 'viana'],
      mesFoco: { anio: 2026, mesIndex: 6 },
      base: 'cliente',
    },
  };

  it('conserva el CSV y todos los filtros dentro del enlace', async () => {
    const carga = await codificarPino(pino);
    expect(await descodificarPino(carga)).toEqual(pino);
    expect(carga).toMatch(/^[0-9A-Za-z_-]+$/);
  });

  it('vuelve sin foco cuando no había foco', async () => {
    const suelto: SharedPino = {
      ...pino,
      options: { ...pino.options, tiposFoco: [], clientesFoco: [], mesFoco: null, base: 'tipo' },
    };
    expect(await descodificarPino(await codificarPino(suelto))).toEqual(suelto);
  });

  it('sigue abriendo los enlaces que llevaban un solo tipo y un solo cliente', async () => {
    // Las primeras versiones guardaban aquí un identificador suelto en vez de
    // una lista. Un enlace de entonces es una selección de uno.
    const antiguo =
      '0' +
      btoa(
        JSON.stringify([1, 'anio;mes\n', 'viejo.csv', [2026], 'puntal', 'finsa', null, 'tipo']),
      );
    const vuelta = await descodificarPino(antiguo);
    expect(vuelta!.options.tiposFoco).toEqual(['puntal']);
    expect(vuelta!.options.clientesFoco).toEqual(['finsa']);
  });

  it('rechaza cargas rotas y sanea los valores imposibles', async () => {
    expect(await descodificarPino('9AAAA')).toBeNull();
    expect(
      await descodificarPino('0' + btoa(JSON.stringify([1, '', 'x.csv', [], null, null, null, 'tipo']))),
    ).toBeNull();

    const raro =
      '0' + btoa(JSON.stringify([1, 'anio,mes\n', '', [2026, 'x'], '', '  ', [2026, 44], 'lo-que-sea']));
    expect(await descodificarPino(raro)).toEqual({
      csv: 'anio,mes\n',
      sourceName: 'pino-por-cliente.csv',
      options: {
        aniosVisibles: [2026],
        tiposFoco: [],
        clientesFoco: [],
        mesFoco: null,
        base: 'tipo',
      },
    });
  });
});
