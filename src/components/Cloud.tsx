import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import logoCloud from '../assets/logo-cloud.png';
import { childPath, cloudEnabled, cloudJson, cloudLogin, cloudLogout, cloudSession, readCloudFile, saveCloudFile, type CloudEntry, type CloudSession, type CloudSource } from '../lib/cloud';

/**
 * `carpeta` es compartida a propósito: la carpeta en la que estás trabajando es
 * una sola, no una por botón. Así «Guardar como» aparece donde abriste el
 * archivo, y cada vista recuerda dónde estabas aunque los botones de abrir y de
 * guardar sean instancias distintas.
 */
const Context = createContext<{
  session: CloudSession | null; login: (despues?: () => void) => void;
  logout: () => Promise<void>;
  carpeta: string; setCarpeta: (ruta: string) => void;
}>({ session: null, login() {}, async logout() {}, carpeta: '/', setCarpeta() {} });

/**
 * MPC Cloud no ocupa nada de la pantalla hasta que hace falta. La mayoría de la
 * gente entra aquí con un archivo suyo y no necesita cuenta, así que ni botón
 * de acceso ni barra de sesión: la contraseña se pide al pulsar «Abrir desde
 * MPC Cloud» y, al entrar, se sigue con lo que ibas a hacer. Con quién estás
 * dentro y la salida viven donde importan, dentro de la ventana de Cloud.
 */
export function CloudProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CloudSession | null>(null);
  const [carpeta, setCarpeta] = useState('/');
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pendiente = useRef<(() => void) | null>(null);
  useEffect(() => { void cloudSession().then(setSession); }, []);
  function pedirAcceso(despues?: () => void) {
    pendiente.current = despues ?? null;
    setError(''); setShowLogin(true);
  }
  async function salir() {
    if (!session) return;
    setBusy(true); setError('');
    try { await cloudLogout(session.csrfToken); setSession(null); }
    catch (e) { setError((e as Error).message); throw e; } finally { setBusy(false); }
  }
  return <Context.Provider value={{ session, login: pedirAcceso, logout: salir, carpeta, setCarpeta }}>
    {showLogin && <CloudDialog title="Entrar en MPC Cloud" close={() => { pendiente.current = null; setShowLogin(false); }}>
      <form className="cloud-form" onSubmit={async e => {
        e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
        setBusy(true); setError('');
        try {
          setSession(await cloudLogin(String(data.get('username') ?? ''), String(data.get('password') ?? '')));
          form.reset(); setShowLogin(false);
          // Entrar no era el objetivo: era el peaje. Se sigue con lo que ibas a hacer.
          const seguir = pendiente.current; pendiente.current = null; seguir?.();
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
        <p className="cloud-dialog__nota">Para trabajar con los documentos de la empresa. Los archivos de tu equipo y los enlaces compartidos no necesitan cuenta.</p>
        <label>Usuario <input name="username" autoComplete="username" required autoFocus /></label>
        <label>Contraseña <input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert">{error}</p>}
        <div className="cloud-dialog__acciones">
          <button className="boton boton--primario" disabled={busy}>Entrar</button>
        </div>
      </form>
    </CloudDialog>}
    {children}
  </Context.Provider>;
}

/**
 * La cruz cierra y es lo único fijo: cada ventana pone debajo los botones que
 * le correspondan. Antes el «Cerrar» se añadía siempre al final, detrás del
 * botón de la acción, y quedaban los dos apilados como si fueran lo mismo.
 */
function CloudDialog({ title, close, children, pie }: { title: string; close: () => void; children: ReactNode; pie?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="cloud-dialog" ref={ref} onCancel={e => { e.preventDefault(); close(); }}>
    <header className="cloud-dialog__cabecera">
      <h2>{title}</h2>
      <button type="button" className="cloud-dialog__cerrar" aria-label="Cerrar" onClick={close}>×</button>
    </header>
    {children}
    {pie && <footer className="cloud-dialog__pie">{pie}</footer>}
  </dialog>;
}

/**
 * El logotipo de MPC Cloud, servido por Informes. Antes se traía de Cloud, pero
 * desde un dominio propio eso es una petición a otro origen que la política de
 * contenido tendría que permitir, y una imagen rota si Cloud no responde.
 */
function LogoCloud() {
  return <img className="cloud-logo" src={logoCloud} alt="" width={26} height={16} draggable={false} />;
}

export function CloudFiles({ extension, onOpen, getFile, source, onSaved, beforeOpen, solo }: {
  extension: 'csv' | 'pdf'; onOpen: (file: File, source: CloudSource) => void | Promise<void>;
  getFile?: () => File; source?: CloudSource | null; onSaved?: (source: CloudSource) => void;
  beforeOpen?: () => boolean;
  /**
   * `abrir` para ponerlo dentro del recuadro de carga, junto al botón de elegir
   * archivo: subir del equipo y traer de Cloud son la misma decisión y se
   * entienden mejor juntas. `guardar` para el resto de acciones, que aparecen
   * cuando ya hay algo cargado y no tienen sitio ahí.
   */
  solo?: 'abrir' | 'guardar';
}) {
  const { session, login, logout, carpeta: path, setCarpeta: setPath } = useContext(Context);
  const [mode, setMode] = useState<'open' | 'save' | null>(null);
  const [entries, setEntries] = useState<CloudEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const snapshot = useRef<File | null>(null);
  useEffect(() => {
    if (!mode || !session) return;
    let active = true; setEntries([]); setError(''); setLoading(true);
    void cloudJson<{ entries: CloudEntry[]; truncated: boolean }>(`fs/list?path=${encodeURIComponent(path)}`).then(r => {
      if (active) { setEntries(r.entries); setTruncated(r.truncated); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, mode, session]);
  const verAbrir = solo !== 'guardar';
  const verGuardar = solo !== 'abrir';
  if (!cloudEnabled) {
    // Sitio suelto: no hay sesión ni API, solo el salto a la versión integrada.
    if (!verAbrir) return null;
    return (
      <a className="boton cloud-abrir no-imprimir" href={`https://cloud.mpc1.es/informes/${location.hash}`}>
        <LogoCloud />
        Abrir desde MPC Cloud
      </a>
    );
  }
  function abrirPanel(next: 'open' | 'save') {
    if (next === 'open' && beforeOpen && !beforeOpen()) return;
    if (next === 'save' && getFile) {
      snapshot.current = getFile();
      setName(snapshot.current.name);
    }
    setStatus(''); setError(''); setMode(next);
  }
  function start(next: 'open' | 'save') {
    // Sin sesión se pide la contraseña y se continúa solo: entrar no era lo
    // que querías hacer. Abrir el panel no necesita la sesión —la lista la
    // pide el efecto, que ya ve la nueva—, así que no hace falta esperar.
    if (!session) { login(() => abrirPanel(next)); return; }
    abrirPanel(next);
  }
  async function save(destination: string, etag?: string) {
    if (!session || !snapshot.current) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await saveCloudFile(snapshot.current, destination, session.csrfToken, etag, visibility);
      onSaved?.(result); setStatus(`Guardado en MPC Cloud: ${result.path}`); setMode(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className={`cloud-actions no-imprimir ${solo === 'abrir' ? 'cloud-actions--en-zona' : ''}`}>
    {verAbrir && <button className="boton cloud-abrir" disabled={busy} onClick={() => start('open')}>
      <LogoCloud />
      Abrir desde MPC Cloud
    </button>}
    {verGuardar && getFile && <button className="boton" disabled={busy} onClick={() => start('save')}>Guardar como en MPC Cloud</button>}
    {verGuardar && getFile && source && <button className="boton" disabled={busy} onClick={() => {
      if (!session) { login(); return; } snapshot.current = getFile(); void save(source.path, source.etag);
    }}>Guardar sobre el original en MPC Cloud</button>}
    {verGuardar && source && <span>Origen: {source.path}</span>}
    {status && <p role="status">{status}</p>}
    {error && !mode && <p role="alert">{error}</p>}
    {mode && <CloudDialog
      title={mode === 'open' ? 'Abrir desde MPC Cloud' : 'Guardar como en MPC Cloud'}
      close={() => { if (!busy) setMode(null); }}
      pie={session && <>
        <span className="cloud-dialog__cuenta">MPC Cloud · {session.user.username}</span>
        <button type="button" className="boton" disabled={busy} onClick={async () => {
          try { await logout(); setMode(null); } catch { /* el error se enseña en la barra de acciones */ }
        }}>Cerrar sesión</button>
      </>}
    >
      <div className="cloud-dialog__ruta">
        <button className="boton" disabled={busy || path === '/'} onClick={() => setPath(path.slice(0, path.lastIndexOf('/')) || '/')}>Subir carpeta</button>
        <p>Carpeta: {path}</p>
      </div>
      {loading && <p role="status">Cargando carpetas…</p>}
      <ul className="cloud-files">{entries.filter(e => e.type === 'dir' || e.name.toLowerCase().endsWith(`.${extension}`)).map(entry => <li key={entry.name}>
        <button className="boton" disabled={busy || (mode === 'save' && entry.type === 'file')} onClick={async () => {
          const next = childPath(path, entry.name);
          if (entry.type === 'dir') { setPath(next); return; }
          setBusy(true); setError('');
          try { const result = await readCloudFile(next); await onOpen(result.file, result.source); setMode(null); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{entry.type === 'dir' ? 'Carpeta: ' : ''}{entry.name}</button>
      </li>)}</ul>
      {truncated && <p>Listado limitado por MPC Cloud. Utiliza una subcarpeta para localizar el archivo.</p>}
      {!loading && !entries.length && !error && <p>Carpeta vacía.</p>}
      {mode === 'save' && <form className="cloud-form" onSubmit={e => { e.preventDefault(); void save(childPath(path, name)); }}>
        <label>Nombre <input required value={name} disabled={busy} onChange={e => setName(e.target.value)} pattern={`[^/\\\\]+\\.${extension}`} /></label>
        <label>Visibilidad <select value={visibility} disabled={busy} onChange={e => setVisibility(e.target.value as 'public' | 'private')}>
          <option value="private">Privado</option><option value="public">Usuarios con acceso a la carpeta</option>
        </select></label>
        <p className="cloud-dialog__nota">Si el nombre ya existe, no se reemplazará. Elige otro nombre.</p>
        <div className="cloud-dialog__acciones">
          <button className="boton boton--primario" disabled={busy || loading}>Guardar en esta carpeta</button>
        </div>
      </form>}
      {busy && <p role="status">Transfiriendo…</p>}
      {error && <p role="alert">{error}</p>}
    </CloudDialog>}
  </div>;
}
