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
  private proto = new Map<WebSocket, number>();
  private disposed = false;

  private readonly controlPrefix = '!VSCE:';
  private static readonly CONTROL_PROTO = 2;

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
    return this.broadcast(code, (socket) => socket.readyState === WebSocket.OPEN) > 0;
  }

  sendControl(key: string, value: string): boolean {
    const message = `${this.controlPrefix}${key}=${value}`;
    return (
      this.broadcast(message, (socket) => {
        const proto = this.proto.get(socket) ?? 1;
        return socket.readyState === WebSocket.OPEN && proto >= ExecuteWsServer.CONTROL_PROTO;
      }) > 0
    );
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
    this.proto.clear();
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