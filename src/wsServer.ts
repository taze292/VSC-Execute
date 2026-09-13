import { WebSocketServer, WebSocket } from 'ws';

export interface ServerStatus {
  connected: boolean;
  executorName?: string;
}

export interface ServerError {
  message: string;
}

class ExecuteWsServer {
  onStatusChange?: (status: ServerStatus) => void;
  onError?: (err: ServerError) => void;

  port = 0;

  private wss?: WebSocketServer;
  private clients = new Set<WebSocket>();
  private names = new Map<WebSocket, string>();
  private disposed = false;

  start(preferredPort: number): void {
    if (this.disposed) return;
    this.stop();
    this.listen(preferredPort, preferredPort + 5);
  }

  private listen(port: number, maxPort: number): void {
    if (this.disposed) return;

    const wss = new WebSocketServer({ port });
    const max = maxPort;

    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port < max) {
        try {
          wss.close();
        } catch {
          /* ignore */
        }
        this.listen(port + 1, max);
        return;
      }
      this.wss = undefined;
      this.onError?.({ message: err.message });
    });

    wss.on('listening', () => {
      this.wss = wss;
      this.port = port;
      this.emitStatus();
    });

    wss.on('connection', (socket) => this.onConnection(socket));
  }

  private onConnection(socket: WebSocket): void {
    this.clients.add(socket);

    socket.on('message', (data) => {
      const text = data.toString();
      const match = /Hello from (.+)/.exec(text);
      if (match) {
        this.names.set(socket, match[1]);
        this.emitStatus();
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.names.delete(socket);
      this.emitStatus();
    });

    this.emitStatus();
  }

  send(code: string): boolean {
    let sent = 0;
    for (const socket of this.clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(code);
        sent += 1;
      }
    }
    return sent > 0;
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
    }
    this.wss = undefined;
    for (const socket of this.clients) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.names.clear();
    this.port = 0;
    this.emitStatus();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private emitStatus(): void {
    const first = this.clients.values().next().value as WebSocket | undefined;
    const name = first ? this.names.get(first) : undefined;
    this.onStatusChange?.({ connected: this.clients.size > 0, executorName: name });
  }
}

export const executeServer = new ExecuteWsServer();