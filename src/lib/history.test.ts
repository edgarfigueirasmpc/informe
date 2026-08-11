import { describe, expect, it } from 'vitest';
import { historicalStats, parseHistoricalCsv } from './history';

const CSV = `mes;anio;tn_totales;tn_eucalipto;setubal;tn_pino;viana;notas
Enero;2025;100;10;4;90;50;
Febrero;2025;200;20;8;180;100;"Parada; mantenimiento"
Marzo;2025;;;;;;`;

describe('histórico CSV', () => {
  it('lee los datos, las notas y omite meses futuros vacíos', () => {
    const datos = parseHistoricalCsv(CSV);
    expect(datos).toHaveLength(2);
    expect(datos[1]).toMatchObject({
      mes: 'Febrero',
      mesIndex: 1,
      anio: 2025,
      total: 200,
      notas: 'Parada; mantenimiento',
    });
  });

  it('calcula media y mediana sólo con los puntos disponibles', () => {
    expect(historicalStats(parseHistoricalCsv(CSV))).toEqual({ media: 150, mediana: 150 });
  });

  it('exige las columnas principales', () => {
    expect(() => parseHistoricalCsv('fecha;valor\n2025;10')).toThrow(/mes, anio y tn_totales/);
  });
});
