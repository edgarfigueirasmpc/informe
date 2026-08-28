import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parsePages, type PageText } from './parseReport';
import { computeView, cupoStatus, EMPTY_OVERRIDES } from './model';
import { fixEncoding, parseNumber } from './text';

const FIXTURE = path.join(import.meta.dirname, '__fixtures__', 'informe-2026-08-09.json');

function loadFixture(): PageText[] {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

describe('fixEncoding', () => {
  it('reconstruye el mojibake cp1252 -> utf8', () => {
    expect(fixEncoding('SERRAÃ‡AO MODERNA')).toBe('SERRAÇAO MODERNA');
  });

  it('repone el byte que pdf.js descarta en "Días"', () => {
    expect(fixEncoding('DÃas trabajados: 5')).toBe('Días trabajados: 5');
    expect(fixEncoding('Media por dÃa: 736.51')).toBe('Media por día: 736.51');
  });

  it('deja intacto lo que ya está bien codificado', () => {
    expect(fixEncoding('Castaño')).toBe('Castaño');
    expect(fixEncoding('FINSA OREMBER')).toBe('FINSA OREMBER');
  });
});

describe('parseNumber', () => {
  it('admite formato inglés y español', () => {
    expect(parseNumber('3682.54')).toBe(3682.54);
    expect(parseNumber('3.682,54')).toBe(3682.54);
    expect(parseNumber('3,682.54')).toBe(3682.54);
    expect(parseNumber('25')).toBe(25);
    expect(parseNumber('LDA')).toBeNull();
  });

  it('lee como decimales todo lo que sigue a un punto suelto', () => {
    // El PDF escribe las toneladas sin separador de millares, así que un punto
    // solo nunca agrupa: tomar «538.744» por quinientos mil sería un error de
    // mil veces, y ese es justo el orden de magnitud de un mes entero.
    expect(parseNumber('538.744')).toBe(538.744);
    expect(parseNumber('594.122')).toBe(594.122);
    expect(parseNumber('1.234')).toBe(1.234);
    expect(parseNumber('1016.107')).toBe(1016.107);
    expect(parseNumber('92.4')).toBe(92.4);
  });

  it('sigue agrupando cuando hay más de un punto, que no puede ser decimal', () => {
    expect(parseNumber('12.345.678')).toBe(12345678);
    expect(parseNumber('1.016.107')).toBe(1016107);
  });
});

describe('parsePages con el informe del 9-8-2026', () => {
  const { report, warnings } = parsePages(loadFixture(), 'informe-mensual-9-8-2026.pdf');

  it('lee la cabecera', () => {
    expect(report.header).toMatchObject({
      desde: '01-8-2026',
      hasta: '9-8-2026',
      diasTrabajados: 5,
      diasRestantes: 16,
      totalMes: 3682.54,
      totalDiaAnterior: 0,
      mediaDia: 736.51,
      estimacionMes: 15466.67,
    });
  });

  it('encuentra los 13 clientes de pino', () => {
    expect(report.clients).toHaveLength(13);
    const nombres = report.clients.map((c) => c.name);
    expect(nombres).toContain('DS SMITH PAPER VIANA, S.A.');
    expect(nombres).toContain('UNIMADEIRAS (TOSCA)');
    expect(nombres).toContain('SERRAÇAO MODERNA DE LAMELAS, LDA');
  });

  it('suma las dos quincenas e ignora la columna Total del PDF', () => {
    const costa = report.clients.find((c) => c.name.startsWith('COSTA IBERICA'))!;
    // El PDF imprime 212.56 en "Total Pino", pero las quincenas suman 262.56.
    expect(costa.tn.pino).toBe(262.56);

    const viana = report.clients.find((c) => c.name.startsWith('DS SMITH'))!;
    expect(viana.tn.pino).toBe(2045.82);
  });

  it('lee TN/Pendientes Cupo sólo donde lo hay', () => {
    const viana = report.clients.find((c) => c.name.startsWith('DS SMITH'))!;
    const krono = report.clients.find((c) => c.name.startsWith('KRONOSPAN'))!;
    const finsa = report.clients.find((c) => c.name.startsWith('FINSA'))!;
    expect(viana.cupoPendiente).toBe(377.76);
    expect(krono.cupoPendiente).toBe(119.39);
    expect(finsa.cupoPendiente).toBeNull();
  });

  it('no confunde el cupo con una quincena', () => {
    const viana = report.clients.find((c) => c.name.startsWith('DS SMITH'))!;
    expect(viana.tn.eucalipto).toBe(0);
    expect(viana.tn.otras).toBe(0);
  });

  it('no avisa de nada: las quincenas cuadran con la fila Totales del PDF', () => {
    expect(warnings).toEqual([]);
  });

  it('ofrece las dos versiones de cada magnitud, la del informe y la calculada', () => {
    // El PDF dice "Total mes: 3682.54" pero sus propias quincenas suman
    // 3872.54. Se enseñan las dos, así que las dos tienen que estar.
    const view = computeView(report, EMPTY_OVERRIDES);

    expect(view.summary.totalMes).toBe(3682.54);
    expect(view.summary.sumaClientes).toBe(3872.54);

    expect(view.summary.mediaBase).toBeCloseTo(736.51, 2);
    expect(view.summary.mediaClientes).toBeCloseTo(3872.54 / 5, 2);

    expect(view.summary.estimacionBase).toBeCloseTo(736.51 * 21, 0);
    expect(view.summary.estimacionInforme).toBe(15466.67);
    expect(view.summary.estimacionClientes).toBeCloseTo((3872.54 / 5) * 21, 0);
  });
});

describe('cálculo y simulación', () => {
  const { report } = parsePages(loadFixture(), 'test.pdf');

  it('reproduce los números del informe en papel', () => {
    const view = computeView(report, EMPTY_OVERRIDES);
    expect(view.summary.totalMes).toBe(3682.54);
    expect(view.summary.mediaBase).toBeCloseTo(736.51, 2);
    expect(view.summary.estimacionBase).toBeCloseTo(15466.71, 1);

    const viana = view.clients.find((c) => c.name.startsWith('DS SMITH'))!;
    expect(viana.mediaBase).toBeCloseTo(409.16, 2);
    expect(viana.estimacionBase).toBeCloseTo(8592.44, 1);

    const finsa = view.clients.find((c) => c.name.startsWith('FINSA'))!;
    expect(finsa.mediaBase).toBeCloseTo(60.14, 2);
    expect(finsa.estimacionBase).toBeCloseTo(1262.86, 1);
  });

  it('propaga al total sólo la diferencia, como el cálculo a mano', () => {
    const finsa = report.clients.find((c) => c.name.startsWith('FINSA'))!;
    const base = computeView(report, EMPTY_OVERRIDES);
    // Finsa pasa de ~60 TN/día a 180: +120 TN/día durante los 21 días.
    const sim = computeView(report, { clients: { [finsa.name]: 180 } });

    expect(sim.summary.estimacion - base.summary.estimacion).toBeCloseTo(
      (180 - 300.68 / 5) * 21,
      6,
    );
    expect(sim.summary.media).toBeCloseTo(736.51 + (180 - 60.136), 3);
    // El acumulado real no se toca: es historia, no simulación.
    expect(sim.summary.totalMes).toBe(3682.54);
    expect(sim.summary.editado).toBe(true);
  });

  it('mueve las dos versiones al simular, cada una desde su propia base', () => {
    const finsa = report.clients.find((c) => c.name.startsWith('FINSA'))!;
    const sim = computeView(report, { clients: { [finsa.name]: 180 } });
    const subida = (180 - 300.68 / 5) * 21;

    // La del informe parte de 15.467 y la calculada de 16.265, pero la
    // simulación les suma exactamente lo mismo: sólo cambia el punto de partida.
    expect(sim.summary.estimacion).toBeCloseTo(736.51 * 21 + subida, 0);
    expect(sim.summary.estimacionClientes).toBeCloseTo((3872.54 / 5) * 21 + subida, 0);

    // El total que firma la cabecera del PDF no lo toca nadie.
    expect(sim.summary.totalMes).toBe(3682.54);
  });

  it('aplica la media simulada también a los días ya trabajados', () => {
    // Es la aritmética del papel: la estimación de Finsa a 180 TN/día era
    // 180 × 21 días, no 300 acumuladas + 180 × los 16 que faltan. Si la
    // estimación cuenta el mes entero, el acumulado tiene que ir en consecuencia.
    const finsa = report.clients.find((c) => c.name.startsWith('FINSA'))!;
    const sim = computeView(report, { clients: { [finsa.name]: 180 } });
    const simFinsa = sim.clients.find((c) => c.name.startsWith('FINSA'))!;

    expect(simFinsa.totalBase).toBe(300.68);
    expect(simFinsa.total).toBeCloseTo(180 * 5, 6);
    expect(simFinsa.estimacion).toBeCloseTo(180 * 21, 6);

    // Y la suma de clientes recoge esa diferencia.
    const base = computeView(report, EMPTY_OVERRIDES);
    expect(sim.summary.sumaClientes - base.summary.sumaClientes).toBeCloseTo(180 * 5 - 300.68, 6);
  });

  it('sin simular, el acumulado en uso es exactamente el del PDF', () => {
    const view = computeView(report, EMPTY_OVERRIDES);
    for (const c of view.clients) {
      expect(c.total).toBeCloseTo(c.totalBase, 6);
    }
    expect(view.summary.sumaClientes).toBeCloseTo(3872.54, 2);
  });

  it('excluye clientes sólo de las cifras calculadas y permite conservarlos visibles', () => {
    const base = computeView(report, EMPTY_OVERRIDES);
    const finsa = base.clients.find((c) => c.name.startsWith('FINSA'))!;
    const sinFinsa = computeView(report, {
      clients: {},
      excludedClients: [finsa.name],
    });

    expect(sinFinsa.clients.find((c) => c.name === finsa.name)?.activo).toBe(false);
    expect(sinFinsa.clients).toHaveLength(base.clients.length);
    expect(sinFinsa.summary.sumaClientes).toBeCloseTo(
      base.summary.sumaClientes - finsa.total,
      2,
    );
    expect(sinFinsa.summary.mediaClientes).toBeCloseTo(
      base.summary.mediaClientes - finsa.media,
      6,
    );
    expect(sinFinsa.summary.totalMes).toBe(base.summary.totalMes);
    expect(sinFinsa.summary.editado).toBe(true);
  });

  it('calcula el estado del cupo con el total actual, no con la estimación futura', () => {
    const view = computeView(report, EMPTY_OVERRIDES);
    const viana = view.clients.find((c) => c.name.startsWith('DS SMITH'))!;

    // Su estimación mensual supera ampliamente el objetivo, pero hoy todavía
    // quedan 377,76 TN: por tanto el cupo no está cubierto.
    expect(viana.estimacion).toBeGreaterThan(viana.totalBase + viana.cupoPendiente!);
    expect(cupoStatus(viana)).toBe('pendiente');

    const alDia = { ...viana, total: viana.totalBase + viana.cupoPendiente! };
    expect(cupoStatus(alDia)).toBe('cubierto');
  });

  it('reacciona al cambio de días laborables restantes', () => {
    const view = computeView(report, { clients: {}, diasRestantes: 0 });
    expect(view.summary.diasTotales).toBe(5);
    expect(view.summary.estimacion).toBeCloseTo(3682.55, 1);
  });
});
