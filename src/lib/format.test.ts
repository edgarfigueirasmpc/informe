import { describe, expect, it } from 'vitest';
import { tn, tnEditable, tnRedondo } from './format';
import { parseNumber } from './text';

describe('toneladas en pantalla', () => {
  it('enseña el tercer decimal cuando el dato lo trae', () => {
    expect(tn(1016.107)).toBe('1.016,107');
    expect(tn(538.744)).toBe('538,744');
  });

  it('mantiene dos decimales de mínimo, para que la columna quede alineada', () => {
    expect(tn(6478)).toBe('6.478,00');
    expect(tn(92.4)).toBe('92,40');
  });

  it('no toca las estimaciones, que son proyecciones', () => {
    expect(tnRedondo(1016.107)).toBe('1.016');
  });

  it('en las casillas editables no rellena con ceros ni recorta decimales', () => {
    expect(tnEditable(6478)).toBe('6.478');
    expect(tnEditable(1016.107)).toBe('1.016,107');
  });
});

describe('del PDF a la pantalla', () => {
  it('un valor de tres decimales llega entero hasta la cifra que se lee', () => {
    // El camino completo: lo que pdf.js entrega como texto, lo que se guarda y
    // lo que acaba viendo quien abre el informe.
    const leido = parseNumber('538.744');
    expect(leido).toBe(538.744);
    expect(tn(leido!)).toBe('538,744');
  });

  it('sumar varios totales no deja ruido de coma flotante a la vista', () => {
    expect(tn(Math.round((0.1 + 0.2) * 1000) / 1000)).toBe('0,30');
  });
});
