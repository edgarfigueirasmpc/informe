import { describe, expect, it } from 'vitest';
import { computeView, EMPTY_OVERRIDES, type Report } from './model';

/** Un mes sencillo: 1.000 TN en 20 días, con 5 por delante. */
const informe: Report = {
  header: {
    desde: '01-6-2026',
    hasta: '20-6-2026',
    diasTrabajados: 20,
    diasRestantes: 5,
    totalMes: 1000,
    totalDiaAnterior: 50,
    mediaDia: 50,
    estimacionMes: 1250,
  },
  clients: [
    { name: 'FINSA', tn: { pino: 600, eucalipto: 0, otras: 0 }, cupoPendiente: null },
    { name: 'VIANA', tn: { pino: 0, eucalipto: 400, otras: 0 }, cupoPendiente: null },
  ],
  publishedAt: '2026-06-20T08:00:00.000Z',
  sourceFile: 'informe.pdf',
};

describe('días trabajados corregidos a mano', () => {
  it('de partida usa los del PDF y su misma media', () => {
    const { summary } = computeView(informe, EMPTY_OVERRIDES);
    expect(summary.diasTrabajados).toBe(20);
    expect(summary.diasTotales).toBe(25);
    expect(summary.mediaBase).toBe(50);
    expect(summary.editado).toBe(false);
  });

  it('descontar un festivo sube el ritmo diario sin tocar lo ya producido', () => {
    // Las mismas 1.000 TN en 18 días son 55,56 al día, no 50.
    const { summary, clients } = computeView(informe, { ...EMPTY_OVERRIDES, diasTrabajados: 18 });

    expect(summary.diasTrabajados).toBe(18);
    expect(summary.diasTotales).toBe(23);
    expect(summary.mediaBase).toBeCloseTo(1000 / 18);
    expect(summary.sumaClientes).toBeCloseTo(1000);
    expect(clients.find((c) => c.name === 'FINSA')!.totalBase).toBe(600);
  });

  it('con menos días trabajados la estimación del mes sube', () => {
    const normal = computeView(informe, EMPTY_OVERRIDES).summary.estimacion;
    const conFestivo = computeView(informe, { ...EMPTY_OVERRIDES, diasTrabajados: 18 }).summary
      .estimacion;

    expect(normal).toBeCloseTo(1250);
    expect(conFestivo).toBeCloseTo((1000 / 18) * 23);
    expect(conFestivo).toBeGreaterThan(normal);
  });

  it('cuenta como festivos los días que se descuentan', () => {
    const { summary } = computeView(informe, { ...EMPTY_OVERRIDES, diasTrabajados: 18 });
    expect(summary.festivos).toBe(2);
    // No se van a trabajar: salen del mes en vez de pasar a «restantes».
    expect(summary.diasRestantes).toBe(5);
    expect(summary.diasTotales).toBe(23);
  });

  it('añadir días trabajados no inventa festivos negativos', () => {
    expect(computeView(informe, { ...EMPTY_OVERRIDES, diasTrabajados: 22 }).summary.festivos).toBe(
      0,
    );
  });

  it('corregir el calendario no es simular: se distinguen', () => {
    const soloDias = computeView(informe, { ...EMPTY_OVERRIDES, diasTrabajados: 18 }).summary;
    expect(soloDias.diasEditados).toBe(true);
    expect(soloDias.simulado).toBe(false);
    expect(soloDias.editado).toBe(true);

    const conCliente = computeView(informe, { ...EMPTY_OVERRIDES, clients: { FINSA: 40 } }).summary;
    expect(conCliente.diasEditados).toBe(false);
    expect(conCliente.simulado).toBe(true);

    const excluyendo = computeView(informe, { ...EMPTY_OVERRIDES, excludedClients: ['VIANA'] })
      .summary;
    expect(excluyendo.simulado).toBe(true);
  });

  it('tocar sólo los días restantes también es calendario, no simulación', () => {
    const { summary } = computeView(informe, { ...EMPTY_OVERRIDES, diasRestantes: 3 });
    expect(summary.diasEditados).toBe(true);
    expect(summary.simulado).toBe(false);
    expect(summary.festivos).toBe(0);
  });

  it('nunca divide entre cero aunque llegue un cero por el enlace', () => {
    const { summary } = computeView(informe, { ...EMPTY_OVERRIDES, diasTrabajados: 0 });
    expect(summary.diasTrabajados).toBe(1);
    expect(Number.isFinite(summary.mediaBase)).toBe(true);
  });
});
