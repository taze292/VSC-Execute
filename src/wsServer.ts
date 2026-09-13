import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WebSocket, WebSocketServer } from 'ws';

export interface ServerStatus {
  connected: boolean;
  executorName?: string;
}

export interface ServerError {
  message: string;
}

interface LeaderInfo {
  execPort: number;
  ipcPort: number;
  pid: number;
  nonce: string;
  ts: number;
}

type Role = 'leader' | 'follower' | 'idle';

const HEARTBEAT_MS = 2000;
const LEADER_STALE_MS = 8000;
const IPC_OFFSET = 7;
const HANDSHAKE_TIMEOUT_MS = 4000;

class ExecuteWsServer {
  onStatusChange?: (status: ServerStatus) => void;
  onError?: (err: ServerError) => void;

  port = 0;

  private readonly controlPrefix = '!VSCE:';
  private static readonly CONTROL_PROTO = 2;

  private stateDir = path.join(os.tmpdir(), 'vsc-execute');
  private readonly nonce = `${process.pid}-${Math.random().toString(36).slice(2)}`;

  private preferredPort = 29999;
  private role: Role = 'idle';
  private bindAttempts = 0;
  private followerActive = false;

  private wss?: WebSocketServer; // executor server (leader only)
  private ipcWss?: WebSocketServer; // follower server (leader only)
  private clients = new Set<WebSocket>();
  private names = new Map<WebSocket, string>();
  private proto = new Map<WebSocket, number>();

  private ipc?: WebSocket; // follower side connection to the leader
  private followers = new Set<WebSocket>();
  private handshakeTimer?: NodeJS.Timeout;
  private retryTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;

  private disposed = false;

  init(stateDir: string): void {
    this.stateDir = stateDir;
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch {
      /* keep rolling with an unwritable state dir */
    }
  }

  private leaderFile(): string {
    return path.join(this.stateDir, 'leader.json');
  }

  start(preferredPort: number): void {
    if (this.disposed) return;
    this.preferredPort = preferredPort;
    this.stop();
    this.elect();
  }

  private elect(): void {
    if (this.disposed) return;
    const leader = this.readLeader();
    if (leader && leader.pid !== process.pid && Date.now() - leader.ts < LEADER_STALE_MS) {
      this.follow(leader);
      return;
    }
    this.becomeLeader();
  }

  private readLeader(): LeaderInfo | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.leaderFile(), 'utf8')) as LeaderInfo;
    } catch {
      return undefined;
    }
  }

  private retry(delay: number): void {
    if (this.disposed) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (!this.disposed) this.elect();
    }, delay);
  }

  private follow(leader: LeaderInfo): void {
    if (this.disposed) return;
    this.teardownServers();
    this.role = 'follower';
    this.followerActive = false;
    this.bindAttempts = 0;

    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${leader.ipcPort}`);
    } catch {
      this.role = 'idle';
      this.retry(1000);
      return;
    }
    this.ipc = ws;

    let handshook = false;
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = setTimeout(() => {
      if (!handshook && this.ipc === ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    }, HANDSHAKE_TIMEOUT_MS);

    ws.on('open', () => {
      try {
        ws.send(JSON.stringify({ v: 1, type: 'hello', pid: process.pid, nonce: this.nonce }));
      } catch {
        /* handled by close/error below */
      }
    });

    ws.on('message', (data) => {
      if (this.ipc !== ws) return;
      let msg: { v?: unknown; type?: unknown; [k: string]: unknown };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.v !== 1 || typeof msg.type !== 'string') return;

      if (!handshook) {
        if (msg.type !== 'hello-ack') return;
        handshook = true;
        if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
        this.role = 'follower';
        this.followerActive = true;
        if (typeof msg.execPort === 'number') this.port = msg.execPort;
        this.onStatusChange?.({
          connected: !!msg.connected,
          executorName: typeof msg.executorName === 'string' ? msg.executorName : undefined,
        });
        return;
      }

      if (msg.type === 'status') {
        if (typeof msg.execPort === 'number') this.port = msg.execPort;
        this.onStatusChange?.({
          connected: !!msg.connected,
          executorName: typeof msg.executorName === 'string' ? msg.executorName : undefined,
        });
      }
    });

    ws.on('error', () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => {
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
      if (this.ipc !== ws) return;
      this.ipc = undefined;
      const wasActive = this.followerActive;
      this.role = 'idle';
      this.followerActive = false;
      if (wasActive) this.onStatusChange?.({ connected: false });
      if (!this.disposed) this.retry(wasActive ? 300 : 1000);
    });
  }

  private becomeLeader(): void {
    if (this.disposed) return;
    this.role = 'idle';
    this.followerActive = false;
    this.teardownServers();

    let warned = false;
    const wss = new WebSocketServer({ port: this.preferredPort });
    this.bindAttempts += 1;

    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (this.wss === wss) this.wss = undefined;
      try {
        wss.close();
      } catch {
        /* ignore */
      }
      if (err.code === 'EADDRINUSE') {
        const leader = this.readLeader();
        if (leader && leader.pid !== process.pid && Date.now() - leader.ts < LEADER_STALE_MS) {
          this.follow(leader);
          return;
        }
        if (this.bindAttempts >= 4) {
          if (!warned) {
            warned = true;
            this.onError?.({
              message:
                `Port ${this.preferredPort} is already in use by another program (no other VSC Execute window is serving it). ` +
                `Change vscExecute.port or close the app using that port.`,
            });
          }
          return;
        }
        this.retry(Math.min(250 * this.bindAttempts, 2000));
      } else {
        this.onError?.({ message: `WebSocket server error: ${err.message}` });
      }
    });

    wss.on('listening', () => {
      this.wss = wss;
      this.port = this.preferredPort;
      this.role = 'leader';
      this.bindAttempts = 0;
      this.wireExecutorServer(wss);
      this.startIpcServer(this.preferredPort + IPC_OFFSET);
      this.startHeartbeat();
      this.emitStatus();
    });
  }

  private wireExecutorServer(wss: WebSocketServer): void {
    wss.on('connection', (socket) => this.onConnection(socket));
  }

  private onConnection(socket: WebSocket): void {
    this.clients.add(socket);

    socket.on('message', (data) => {
      const text = data.toString();
      const match = /Hello from (.+)/.exec(text);
      if (match) {
        this.names.set(socket, match[1]);
        const protoMatch = /\[VSCE-PROTO\]\s*(\d+)/.exec(text);
        this.proto.set(socket, protoMatch ? parseInt(protoMatch[1], 10) : 1);
        this.emitStatus();
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.names.delete(socket);
      this.proto.delete(socket);
      this.emitStatus();
    });

    this.emitStatus();
  }

  send(code: string): boolean {
    if (this.role === 'leader') {
      return this.broadcast(code, (socket) => socket.readyState === WebSocket.OPEN) > 0;
    }
    if (this.role === 'follower') {
      return this.sendIpc({ v: 1, type: 'execute', code });
    }
    return false;
  }

  sendControl(key: string, value: string): boolean {
    if (this.role === 'leader') {
      const message = `${this.controlPrefix}${key}=${value}`;
      return (
        this.broadcast(message, (socket) => {
          const proto = this.proto.get(socket) ?? 1;
          return socket.readyState === WebSocket.OPEN && proto >= ExecuteWsServer.CONTROL_PROTO;
        }) > 0
      );
    }
    if (this.role === 'follower') {
      return this.sendIpc({ v: 1, type: 'control', key, value });
    }
    return false;
  }

  private broadcast(text: string, canSend: (socket: WebSocket) => boolean): number {
    let sent = 0;
    for (const socket of this.clients) {
      if (!canSend(socket)) continue;
      try {
        socket.send(text);
        sent += 1;
      } catch {
        /* ignore sockets that die mid-send */
      }
    }
    return sent;
  }

  private sendIpc(msg: object): boolean {
    const ws = this.ipc;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private startIpcServer(ipcPort: number): void {
    const ipc = new WebSocketServer({ port: ipcPort });
    this.ipcWss = ipc;

    ipc.on('error', (err: NodeJS.ErrnoException) => {
      this.onError?.({ message: `VSC Execute IPC server error: ${err.message}` });
    });

    ipc.on('connection', (socket) => {
      this.followers.add(socket);
      let hello = false;

      socket.on('message', (data) => {
        let msg: { v?: unknown; type?: unknown; [k: string]: unknown };
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.v !== 1 || typeof msg.type !== 'string') return;

        if (!hello) {
          if (msg.type !== 'hello') return;
          hello = true;
          const first = this.clients.values().next().value as WebSocket | undefined;
          const payload = {
            v: 1,
            type: 'hello-ack',
            execPort: this.port,
            connected: this.clients.size > 0,
            executorName: first ? this.names.get(first) : undefined,
          };
          try {
            socket.send(JSON.stringify(payload));
          } catch {
            /* ignore */
          }
          return;
        }

        if (msg.type === 'execute') {
          const ok = this.send(String(msg.code));
          try {
            socket.send(JSON.stringify({ v: 1, type: 'ack', ok }));
          } catch {
            /* ignore */
          }
        } else if (msg.type === 'control') {
          this.sendControl(String(msg.key), String(msg.value));
        }
      });

      const drop = (): void => {
        this.followers.delete(socket);
      };
      socket.on('close', drop);
      socket.on('error', drop);
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.writeLeaderFile();
    this.heartbeatTimer = setInterval(() => {
      if (this.disposed || this.role !== 'leader') {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        return;
      }
      this.writeLeaderFile();
    }, HEARTBEAT_MS);
  }

  private writeLeaderFile(): void {
    const info: LeaderInfo = {
      execPort: this.port,
      ipcPort: this.port + IPC_OFFSET,
      pid: process.pid,
      nonce: this.nonce,
      ts: Date.now(),
    };
    try {
      fs.mkdirSync(this.stateDir, { recursive: true });
      fs.writeFileSync(this.leaderFile(), JSON.stringify(info), 'utf8');
    } catch {
      /* ignore */
    }
  }

  private removeLeaderFile(): void {
    try {
      fs.unlinkSync(this.leaderFile());
    } catch {
      /* ignore */
    }
  }

  private emitStatus(): void {
    const first = this.clients.values().next().value as WebSocket | undefined;
    const status: ServerStatus = {
      connected: this.clients.size > 0,
      executorName: first ? this.names.get(first) : undefined,
    };
    if (this.role === 'leader') {
      this.onStatusChange?.(status);
    }
    const payload = JSON.stringify({ v: 1, type: 'status', execPort: this.port, ...status });
    for (const follower of this.followers) {
      try {
        follower.send(payload);
      } catch {
        /* ignore */
      }
    }
  }

  private teardownServers(): void {
    if (this.ipc) {
      const old = this.ipc;
      this.ipc = undefined;
      try {
        old.close();
      } catch {
        /* ignore */
      }
    }
    if (this.ipcWss) {
      try {
        this.ipcWss.close();
      } catch {
        /* ignore */
      }
      this.ipcWss = undefined;
    }
    if (this.wss) {
      try {
        this.wss.close();
      } catch {
        /* ignore */
      }
      this.wss = undefined;
    }
    for (const socket of this.clients) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.names.clear();
    this.proto.clear();
    this.followers.clear();
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = undefined;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  stop(): void {
    const hadClients = this.clients.size > 0;
    const wasFollowerActive = this.followerActive;
    this.teardownServers();
    this.role = 'idle';
    this.followerActive = false;
    this.bindAttempts = 0;
    this.port = 0;
    this.removeLeaderFile();
    if (hadClients || wasFollowerActive) this.onStatusChange?.({ connected: false });
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }
}

export const executeServer = new ExecuteWsServer();