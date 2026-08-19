import { describe, expect, it } from 'vitest';
import { cuota, parsePinoCsv, resumir, toneladas } from './pino';

/** Una hoja de las primeras: con totales y porcentajes calculados a mano. */
const CSV = [
  'anio,mes,puntal_viana,puntal_finsa,canter_tome,canter_ecos_largos,rolla_gorda_ecos,' +
    'total_puntal_calculado,total_canter_calculado,total_rolla_gorda_calculado,' +
    'total_pino_calculado,porcentaje_puntal_foto,notas',
  '2025,enero,600,400,200,100,300,1000,300,300,1600,62.5,',
  '2025,febrero,300,100,0,0,100,400,0,100,500,80,"Parada; mantenimiento"',
  '2025,marzo,,,,,,,,,,,',
].join('\n');

/**
 * La hoja de hoy: sin totales ni porcentajes —los suma el programa—, con punto
 * y coma y con un tipo de madera cuyo nombre lleva dos palabras.
 */
const CSV_SIN_TOTALES = [
  'anio;mes;puntal_viana;puntal_finsa;canter_tome;canter_costa_iberica;' +
    'rolla_gorda_castro;rolla_gorda_ecos_largos;notas',
  '2025;enero;600;400;200;150;250;300;',
  '2025;febrero;300;100;0;0;0;100;"Parada; mantenimiento"',
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

describe('pino por cliente: hojas sin columnas de totales', () => {
  it('deduce los tipos de la forma de los nombres, sin necesitar los totales', () => {
    const { tipos, clientes } = parsePinoCsv(CSV_SIN_TOTALES);

    // `rolla` sólo sigue por `gorda`, así que el tipo son las dos palabras.
    expect(tipos.map((tipo) => tipo.id)).toEqual(['puntal', 'canter', 'rolla_gorda']);
    expect(clientes.map((cliente) => cliente.label)).toEqual([
      'Viana',
      'Finsa',
      'Tomé',
      'Costa Ibérica',
      'Castro',
      'Ecos Largos',
    ]);
  });

  it('no parte el nombre del cliente al partir el del tipo', () => {
    const { tipos, clientesPorTipo } = parsePinoCsv(CSV_SIN_TOTALES);

    // «costa ibérica» son dos palabras y aun así el tipo se queda en «canter».
    expect(tipos.map((tipo) => tipo.id)).toContain('canter');
    expect(clientesPorTipo.canter).toEqual(['tome', 'costa_iberica']);
  });

  it('descubre un tipo que no conoce de nada, aunque su nombre sea compuesto', () => {
    // `tabla` sólo continúa por `ancha`, y detrás hay dos clientes: el corte va
    // después de `tabla_ancha` sin que nadie se lo haya dicho.
    const nuevo = parsePinoCsv(
      'anio;mes;tabla_ancha_lamelas;tabla_ancha_costa_iberica\n2025;enero;10;20',
    );
    expect(nuevo.tipos.map((tipo) => tipo.id)).toEqual(['tabla_ancha']);
    expect(nuevo.tipos.map((tipo) => tipo.label)).toEqual(['Tabla ancha']);
    expect(nuevo.clientes.map((cliente) => cliente.id)).toEqual(['lamelas', 'costa_iberica']);
  });

  it('no se come el nombre del cliente cuando el tipo desconocido tiene uno solo', () => {
    // Sin hermanos que confirmen dónde acaba el tipo, se para en el primer
    // trozo antes que quedarse con parte del nombre del cliente.
    const suelto = parsePinoCsv('anio;mes;tabla_costa_iberica\n2025;enero;150');
    expect(suelto.tipos.map((tipo) => tipo.id)).toEqual(['tabla']);
    expect(suelto.clientes.map((cliente) => cliente.id)).toEqual(['costa_iberica']);
  });

  it('mete el eucalipto como una madera más, con sus propios clientes', () => {
    const conEucalipto = parsePinoCsv(
      [
        'anio;mes;puntal_viana;eucalipto_viana;eucalipto_navigator_setubal;eucalipto_bosques',
        '2025;enero;600;100;250;50',
      ].join('\n'),
    );

    expect(conEucalipto.tipos.map((tipo) => tipo.label)).toEqual(['Puntal', 'Eucalipto']);
    expect(conEucalipto.clientesPorTipo.eucalipto).toEqual([
      'viana',
      'navigator_setubal',
      'bosques',
    ]);
    // Viana recibe pino y eucalipto: es el mismo destino, no dos clientes.
    expect(conEucalipto.clientes.map((cliente) => cliente.id)).toEqual([
      'viana',
      'navigator_setubal',
      'bosques',
    ]);
    expect(resumir(conEucalipto.registros, { cliente: 'viana' }).porTipo).toEqual({
      puntal: 600,
      eucalipto: 100,
    });
  });

  it('no convierte en tipo el prefijo que comparten dos clientes', () => {
    // Con Navigator como único cliente del eucalipto, la forma sola diría que
    // el tipo es «eucalipto navigator»; el nombre conocido lo impide.
    const navigator = parsePinoCsv(
      'anio;mes;eucalipto_navigator_setubal;eucalipto_navigator_foz\n2025;enero;250;300',
    );
    expect(navigator.tipos.map((tipo) => tipo.id)).toEqual(['eucalipto']);
    expect(navigator.clientes.map((cliente) => cliente.label)).toEqual([
      'Navigator Setúbal',
      'Navigator Foz',
    ]);
  });

  it('un nombre conocido manda sobre la deducción', () => {
    // Con una sola columna de rolla gorda, deducir daría «rolla» + «gorda
    // castro»; como el tipo se conoce por su nombre, no llega a pasar.
    const escaso = parsePinoCsv('anio;mes;rolla_gorda_castro\n2025;enero;150');
    expect(escaso.tipos.map((tipo) => tipo.id)).toEqual(['rolla_gorda']);
    expect(escaso.clientes.map((cliente) => cliente.id)).toEqual(['castro']);
  });

  it('suma los totales desde las celdas y no declara ninguno', () => {
    const [enero] = parsePinoCsv(CSV_SIN_TOTALES).registros;
    expect(enero.total).toBe(1900);
    expect(enero.totalDeclarado).toBeNull();
  });

  it('reparte igual que si la hoja trajera los totales', () => {
    const { registros } = parsePinoCsv(CSV_SIN_TOTALES);
    const { porTipo, total } = resumir(registros);

    expect(porTipo).toEqual({ puntal: 1400, canter: 350, rolla_gorda: 650 });
    expect(Object.values(porTipo).reduce((suma, valor) => suma + valor, 0)).toBe(total);
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
