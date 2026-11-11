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
  session: CloudSession | null; login: () => void;
  carpeta: string; setCarpeta: (ruta: string) => void;
}>({ session: null, login() {}, carpeta: '/', setCarpeta() {} });
export function CloudProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CloudSession | null>(null);
  const [carpeta, setCarpeta] = useState('/');
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void cloudSession().then(setSession); }, []);
  return <Context.Provider value={{ session, login: () => setShowLogin(true), carpeta, setCarpeta }}>
    <div className="cloud-bar no-imprimir">
      {cloudEnabled ? <>
        <span>{session ? `MPC Cloud · ${session.user.username}` : 'MPC Cloud · sesión opcional'}</span>
        <button className="boton" onClick={() => { setError(''); setShowLogin(true); }}> {session ? 'Renovar sesión' : 'Iniciar sesión'}</button>
        {session && <button className="boton" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { await cloudLogout(session.csrfToken); setSession(null); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>Cerrar sesión</button>}
      </> : <a onClick={e => { e.currentTarget.href = `https://cloud.mpc1.es/informes/${location.hash}`; }} href={`https://cloud.mpc1.es/informes/${location.hash}`}>Usar Informes con MPC Cloud</a>}
      {error && <p role="alert">{error}</p>}
    </div>
    {showLogin && <CloudDialog title="Iniciar sesión en MPC Cloud" close={() => setShowLogin(false)}>
      <p>El uso local y los enlaces compartidos no requieren iniciar sesión.</p>
      <form onSubmit={async e => {
        e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
        setBusy(true); setError('');
        try {
          setSession(await cloudLogin(String(data.get('username') ?? ''), String(data.get('password') ?? '')));
          form.reset(); setShowLogin(false);
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
        <label>Usuario <input name="username" autoComplete="username" required /></label>
        <label>Contraseña <input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="boton" disabled={busy}>Entrar</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </CloudDialog>}
    {children}
  </Context.Provider>;
}
function CloudDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="cloud-dialog" ref={ref} onCancel={e => { e.preventDefault(); close(); }}>
    <h2>{title}</h2>{children}<button className="boton" onClick={close}>Cerrar</button>
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
  const { session, login, carpeta: path, setCarpeta: setPath } = useContext(Context);
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
  function start(next: 'open' | 'save') {
    if (!session) { login(); return; }
    if (next === 'open' && beforeOpen && !beforeOpen()) return;
    if (next === 'save' && getFile) {
      snapshot.current = getFile();
      setName(snapshot.current.name);
    }
    setStatus(''); setError(''); setMode(next);
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
    {mode && <CloudDialog title={mode === 'open' ? 'Abrir desde MPC Cloud' : 'Guardar como en MPC Cloud'} close={() => { if (!busy) setMode(null); }}>
      <p>Carpeta: {path}</p>
      <button className="boton" disabled={busy || path === '/'} onClick={() => setPath(path.slice(0, path.lastIndexOf('/')) || '/')}>Subir carpeta</button>
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
      {mode === 'save' && <form onSubmit={e => { e.preventDefault(); void save(childPath(path, name)); }}>
        <label>Nombre <input required value={name} disabled={busy} onChange={e => setName(e.target.value)} pattern={`[^/\\\\]+\\.${extension}`} /></label>
        <label>Visibilidad <select value={visibility} disabled={busy} onChange={e => setVisibility(e.target.value as 'public' | 'private')}>
          <option value="private">Privado</option><option value="public">Usuarios con acceso a la carpeta</option>
        </select></label>
        <p>Si el nombre ya existe, no se reemplazará. Elige otro nombre.</p>
        <button className="boton" disabled={busy || loading}>Guardar en esta carpeta</button>
      </form>}
      {busy && <p role="status">Transfiriendo…</p>}
      {error && <p role="alert">{error}</p>}
    </CloudDialog>}
  </div>;
}
