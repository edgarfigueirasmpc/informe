import { describe, expect, it } from 'vitest';
import { decideRole, safeEqual } from './auth';

describe('safeEqual', () => {
  it('compara sin sorpresas', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('ñandú', 'ñandú')).toBe(true);
  });
});

describe('decideRole con dos contraseñas', () => {
  const passwords = { view: 'consulta', admin: 'publicacion' };

  it('la de consulta sólo deja mirar', () => {
    expect(decideRole('consulta', passwords)).toBe('view');
  });

  it('la de administración deja publicar', () => {
    expect(decideRole('publicacion', passwords)).toBe('admin');
  });

  it('cualquier otra cosa no entra', () => {
    expect(decideRole('otra', passwords)).toBeNull();
    expect(decideRole('', passwords)).toBeNull();
  });
});

describe('decideRole en modo de contraseña única', () => {
  it('sin ADMIN_PASSWORD, quien entra puede publicar', () => {
    expect(decideRole('consulta', { view: 'consulta', admin: undefined })).toBe('admin');
    expect(decideRole('consulta', { view: 'consulta', admin: '' })).toBe('admin');
  });

  it('sigue sin dejar pasar a quien no sabe la contraseña', () => {
    expect(decideRole('otra', { view: 'consulta', admin: undefined })).toBeNull();
  });

  it('una contraseña vacía no abre la puerta ni con el servidor mal configurado', () => {
    // Si se desplegara sin VIEW_PASSWORD, configError() corta antes; esta es la
    // segunda barrera por si alguna vez dejara de hacerlo.
    expect(decideRole('', { view: '', admin: undefined })).toBeNull();
    expect(decideRole('loquesea', { view: '', admin: undefined })).toBeNull();
  });
});
