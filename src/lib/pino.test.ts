import { describe, expect, it } from 'vitest';
import { cuota, parsePinoCsv, resumir, toneladas } from './pino';

const CSV = [
  'anio,mes,puntal_viana,puntal_finsa,canter_tome,canter_ecos_largos,rolla_gorda_ecos,' +
    'total_puntal_calculado,total_canter_calculado,total_rolla_gorda_calculado,' +
    'total_pino_calculado,porcentaje_puntal_foto,notas',
  '2025,enero,600,400,200,100,300,1000,300,300,1600,62.5,',
  '2025,febrero,300,100,0,0,100,400,0,100,500,80,"Parada; mantenimiento"',
  '2025,marzo,,,,,,,,,,,',
].join('\n');

describe('pino por cliente: lectura del CSV', () => {
  it('descubre los tipos de madera y descarta el gran total', () => {
    const { tipos } = parsePinoCsv(CSV);
    expect(tipos.map((tipo) => tipo.id)).toEqual(['puntal', 'canter', 'rolla_gorda']);
    expect(tipos.map((tipo) => tipo.label)).toEqual(['Puntal', 'Canter', 'Rolla gorda']);
  });

  it('unifica Ecos y Ecos Largos en un solo cliente', () => {
    const { clientes, clientesPorTipo, registros } = parsePinoCsv(CSV);

    expect(clientes.map((cliente) => cliente.id)).toEqual([
      'viana',
      'finsa',
      'tome',
      'ecos_largos',
    ]);
    expect(clientes.find((cliente) => cliente.id === 'ecos_largos')?.label).toBe('Ecos Largos');
    expect(clientesPorTipo.rolla_gorda).toEqual(['ecos_largos']);

    // El mismo cliente en dos tipos distintos no se pisa a sí mismo.
    expect(registros[0].tn.canter.ecos_largos).toBe(100);
    expect(registros[0].tn.rolla_gorda.ecos_largos).toBe(300);
  });

  it('suma el total desde las celdas y guarda el declarado por la hoja', () => {
    const [enero] = parsePinoCsv(CSV).registros;
    expect(enero.total).toBe(1600);
    expect(enero.totalDeclarado).toBe(1600);
  });

  it('omite los meses futuros en blanco y no los cuenta como ceros', () => {
    const { registros, anios } = parsePinoCsv(CSV);
    expect(registros).toHaveLength(2);
    expect(registros.map((registro) => registro.mes)).toEqual(['Enero', 'Febrero']);
    expect(anios).toEqual([2025]);
  });

  it('no guarda los ceros como celdas', () => {
    const [, febrero] = parsePinoCsv(CSV).registros;
    expect(febrero.tn.canter).toBeUndefined();
    expect(febrero.notas).toBe('Parada; mantenimiento');
  });

  it('exige las columnas que dan sentido a las filas', () => {
    expect(() => parsePinoCsv('fecha,valor\n2025,10')).toThrow(/anio y mes/);
    expect(() => parsePinoCsv('anio,mes\n2025,enero')).toThrow(/columnas de cliente/);
  });
});

describe('pino por cliente: agregación', () => {
  const { registros } = parsePinoCsv(CSV);

  it('cuadra el total del periodo con la suma de sus partes', () => {
    const { total, porTipo, porCliente } = resumir(registros);
    expect(total).toBe(2100);
    expect(porTipo).toEqual({ puntal: 1400, canter: 300, rolla_gorda: 400 });
    expect(Object.values(porCliente).reduce((suma, valor) => suma + valor, 0)).toBe(total);
  });

  it('reparte un tipo de madera entre sus clientes', () => {
    const { total, porCliente } = resumir(registros, { tipo: 'puntal' });
    expect(porCliente).toEqual({ viana: 900, finsa: 500 });
    expect(cuota(porCliente.finsa, total)).toBeCloseTo(500 / 1400);
  });

  it('reparte lo de un cliente entre los tipos que le fueron', () => {
    const { total, porTipo } = resumir(registros, { cliente: 'ecos_largos' });
    expect(total).toBe(500);
    expect(porTipo).toEqual({ canter: 100, rolla_gorda: 400 });
  });

  it('cruza tipo y cliente a la vez', () => {
    expect(toneladas(registros, { tipo: 'canter', cliente: 'ecos_largos' })).toBe(100);
    expect(toneladas(registros, { tipo: 'canter', cliente: 'viana' })).toBe(0);
  });

  it('pesa un mes dentro de su año', () => {
    const enero = registros.filter((registro) => registro.mesIndex === 0);
    expect(cuota(toneladas(enero), toneladas(registros))).toBeCloseTo(1600 / 2100);
    expect(
      cuota(toneladas(enero, { cliente: 'viana' }), toneladas(registros, { cliente: 'viana' })),
    ).toBeCloseTo(600 / 900);
  });

  it('no inventa porcentajes cuando no hay base', () => {
    expect(cuota(0, 0)).toBeNull();
  });
});
