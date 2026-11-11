/**
 * Túnel TCP sobre la entrada estándar de ssh, para cuando el servidor tiene
 * prohibido el reenvío de puertos. Una conexión ssh por conexión entrante:
 * lento de abrir, pero no hay que cambiar nada en el servidor.
 *
 *   node scripts/staging/tunel-stdio.mjs <puerto local> <usuario@host> <puerto remoto>
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const [puertoLocal, destino, puertoRemoto] = process.argv.slice(2);
if (!puertoLocal || !destino || !puertoRemoto) throw new Error('faltan argumentos');

const RELAY = `import socket,sys,threading
s=socket.create_connection(('127.0.0.1',${Number(puertoRemoto)}))
def subir():
    while True:
        b=sys.stdin.buffer.read1(65536)
        if not b: break
        try: s.sendall(b)
        except OSError: break
    try: s.shutdown(socket.SHUT_WR)
    except OSError: pass
threading.Thread(target=subir,daemon=True).start()
while True:
    try: b=s.recv(65536)
    except OSError: break
    if not b: break
    sys.stdout.buffer.write(b); sys.stdout.buffer.flush()
`;

let abiertas = 0;
const servidor = net.createServer((socket) => {
  abiertas++;
  const ssh = spawn('ssh', ['-T', '-o', 'BatchMode=yes', destino, 'python3', '-c', RELAY], { stdio: ['pipe', 'pipe', 'pipe'] });
  socket.pipe(ssh.stdin);
  ssh.stdout.pipe(socket);
  ssh.stderr.on('data', (d) => process.stderr.write(`[ssh] ${d}`));
  const cerrar = () => { socket.destroy(); ssh.kill(); abiertas--; };
  socket.on('error', cerrar); socket.on('close', cerrar);
  ssh.on('exit', () => socket.end());
  ssh.stdin.on('error', () => {});
});
servidor.listen(Number(puertoLocal), '127.0.0.1', () =>
  console.log(`túnel 127.0.0.1:${puertoLocal} -> ${destino}:${puertoRemoto} (una conexión ssh por conexión)`));
process.on('SIGTERM', () => { servidor.close(); process.exit(0); });
