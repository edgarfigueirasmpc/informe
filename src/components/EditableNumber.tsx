import { useEffect, useRef, useState } from 'react';
import { parseNumber } from '../lib/text';
import { tn, tnEditable, tnRedondo } from '../lib/format';

interface Props {
  /** Valor en uso: el simulado si lo hay, el real si no. */
  value: number;
  /** Valor del PDF, al que se vuelve dejando la casilla vacía. */
  base: number;
  editado: boolean;
  label: string;
  onChange: (value: number | null) => void;
  decimals?: number;
}

/**
 * Casilla de simulación. Escribe un número y todo lo demás se recalcula;
 * bórrala y vuelve al dato del PDF. Admite coma o punto decimal.
 *
 * En reposo enseña el número compuesto como el resto de la tabla (con punto de
 * millar); al entrar a escribir lo desnuda, porque un separador de millares
 * dentro de una casilla que se está tecleando estorba más que ayuda.
 */
export function EditableNumber({ value, base, editado, label, onChange, decimals = 2 }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [enfocado, setEnfocado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const compuesto = decimals === 0 ? tnRedondo(value) : tn(value);
  const desnudo = decimals === 0 ? Math.round(value).toString() : tnEditable(value);

  // Si el valor cambia desde fuera (la otra casilla de la misma fila, o un
  // informe nuevo) mientras no se está escribiendo, la casilla se pone al día.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null);
  }, [value]);

  const texto = draft ?? (enfocado ? desnudo : compuesto);
  const invalido = draft !== null && draft.trim() !== '' && parseNumber(draft) === null;

  function commit() {
    if (draft === null) return;
    if (draft.trim() === '') {
      onChange(null);
    } else {
      const n = parseNumber(draft);
      if (n !== null && n >= 0) onChange(n);
    }
    setDraft(null);
  }

  return (
    <input
      ref={inputRef}
      className={[
        'editable',
        'num',
        editado ? 'editable--activo' : '',
        invalido ? 'editable--invalido' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      type="text"
      inputMode="decimal"
      value={texto}
      aria-label={label}
      title={
        editado ? `Dato del informe: ${tnEditable(base)} · Vacía la casilla para volver` : label
      }
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setEnfocado(true);
        e.target.select();
      }}
      onBlur={() => {
        commit();
        setEnfocado(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // Ajuste fino con el teclado, como en una hoja de cálculo.
          e.preventDefault();
          const paso = e.shiftKey ? 10 : 1;
          const actual = parseNumber(texto) ?? value;
          onChange(Math.max(0, actual + (e.key === 'ArrowUp' ? paso : -paso)));
          setDraft(null);
        }
      }}
    />
  );
}
