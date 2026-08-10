import { useState, type FormEvent } from 'react';
import { ApiError, login, type Role } from '../lib/api';
import { FirmaMpc, Mark } from './Mark';

interface Props {
  onEnter: (role: Role) => void;
}

export function Gate({ onEnter }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || enviando) return;
    setEnviando(true);
    setError('');
    try {
      const { role } = await login(password);
      onEnter(role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido entrar.');
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="acceso">
      <div className="acceso__caja">
        <div className="acceso__marca">
          <Mark />
          <h1 className="acceso__titulo">Informe de toneladas</h1>
        </div>

        <form className="acceso__form" onSubmit={submit}>
          <label className="campo">
            <span className="eyebrow">Contraseña</span>
            <input
              className="campo__input"
              type="password"
              value={password}
              autoFocus
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <p className="error" role="alert">
            {error}
          </p>

          <div>
            <button className="boton boton--primario" type="submit" disabled={!password || enviando}>
              {enviando ? 'Comprobando' : 'Entrar'}
            </button>
          </div>
        </form>

        <FirmaMpc />
      </div>
    </main>
  );
}
