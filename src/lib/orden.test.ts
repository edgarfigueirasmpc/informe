import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parsePages, type PageText } from './parseReport';
import { computeView, EMPTY_OVERRIDES, ordenarClientes, ORDEN_POR_DEFECTO } from './model';

const FIXTURE = path.join(import.meta.dirname, '__fixtures__', 'informe-2026-08-09.json');
const paginas = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as PageText[];
const { report } = parsePages(paginas, 'test.pdf');
const view = computeView(report, EMPTY_OVERRIDES);

const nombres = (orden: Parameters<typeof ordenarClientes>[1]) =>
  ordenarClientes(view.clients, orden).map((c) => c.name);

describe('ordenar la tabla', () => {
  it('por defecto, el que más pesa arriba', () => {
    expect(nombres(ORDEN_POR_DEFECTO)[0]).toMatch(/^DS SMITH/);
  });

  it('invierte al pedirlo de menor a mayor', () => {
    const asc = nombres({ campo: 'total', desc: false });
    expect(asc[0]).toMatch(/^MADERAS PACO/);
    expect(asc.at(-1)).toMatch(/^DS SMITH/);
  });

  it('ordena por nombre respetando el alfabeto español', () => {
    const az = nombres({ campo: 'nombre', desc: false });
    expect(az[0]).toMatch(/^CLAMADEIRAS/);
    expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('deja al final a los clientes sin cupo, se ordene como se ordene', () => {
    const conCupo = view.clients.filter((c) => c.cupoPendiente !== null).length;
    expect(conCupo).toBe(2);

    for (const desc of [true, false]) {
      const orden = ordenarClientes(view.clients, { campo: 'cupo', desc });
      expect(orden.slice(0, conCupo).every((c) => c.cupoPendiente !== null)).toBe(true);
      expect(orden.slice(conCupo).every((c) => c.cupoPendiente === null)).toBe(true);
    }
  });

  it('no altera la lista original', () => {
    const antes = view.clients.map((c) => c.name);
    ordenarClientes(view.clients, { campo: 'nombre', desc: true });
    expect(view.clients.map((c) => c.name)).toEqual(antes);
  });

  it('a igualdad de cifra, alfabético: el orden no baila entre repintados', () => {
    // Todos los clientes tienen 0 en eucalipto, así que manda el desempate.
    const a = nombres({ campo: 'eucalipto', desc: true });
    const b = nombres({ campo: 'eucalipto', desc: true });
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort((x, y) => x.localeCompare(y, 'es')));
  });
});
