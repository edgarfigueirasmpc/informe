import { describe, expect, it } from 'vitest';
import { parseCsv, serializarCsv } from './csv';

describe('leer un CSV', () => {
  it('deduce el separador de la cabecera', () => {
    expect(parseCsv('a;b\n1;2').separador).toBe(';');
    expect(parseCsv('a,b\n1,2').separador).toBe(',');
  });

  it('no parte una celda que lleva el separador dentro', () => {
    const { filas } = parseCsv('a;b\n"uno;dos";tres');
    expect(filas[1]).toEqual(['uno;dos', 'tres']);
  });

  it('respeta los saltos de línea dentro de las comillas', () => {
    // Partir primero por líneas convertiría esta nota en dos filas y
    // desplazaría una columna entera.
    const { filas } = parseCsv('mes;notas\nenero;"Parada\nde mantenimiento";\nfebrero;sin nota;');
    expect(filas).toHaveLength(3);
    expect(filas[1]).toEqual(['enero', 'Parada\nde mantenimiento', '']);
    expect(filas[2][0]).toBe('febrero');
  });

  it('entiende las comillas escapadas', () => {
    expect(parseCsv('a\n"dijo ""hola"""').filas[1]).toEqual(['dijo "hola"']);
  });

  it('se traga el BOM y los finales de línea de Windows', () => {
    const { filas } = parseCsv('﻿a;b\r\n1;2\r\n');
    expect(filas).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('descarta las filas en blanco pero no las que sólo tienen huecos con datos', () => {
    const { filas } = parseCsv('a;b;c\n\n1;;3\n;;\n');
    expect(filas).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('no recorta las celdas: lo que escribió el usuario se conserva', () => {
    expect(parseCsv('a;b\n uno ;dos').filas[1]).toEqual([' uno ', 'dos']);
  });

  it('aguanta una última fila sin salto de línea final', () => {
    expect(parseCsv('a;b\n1;2').filas[1]).toEqual(['1', '2']);
  });
});

describe('escribir un CSV', () => {
  it('entrecomilla sólo lo que lo necesita', () => {
    const texto = serializarCsv(
      [
        ['a', 'b', 'c'],
        ['simple', 'con;separador', 'con "comillas"'],
      ],
      ';',
    );
    expect(texto).toBe('a;b;c\r\nsimple;"con;separador";"con ""comillas"""\r\n');
  });

  it('vuelve a leerse igual que se escribió', () => {
    const original = [
      ['mes', 'tn', 'notas'],
      ['enero', '1016.107', 'Parada\nde mantenimiento'],
      ['febrero', '92.4', 'con ; y "comillas"'],
      ['marzo', '', ''],
    ];
    expect(parseCsv(serializarCsv(original, ';')).filas).toEqual(original);
    expect(parseCsv(serializarCsv(original, ',')).filas).toEqual(original);
  });
});
