import WebSocket from 'ws';
import http from 'http';
import { roomManager } from '../rooms/roomManager';
import { matchmaker } from '../matchmaking/matchmaker';
import { WebSocketMessageHandlers, ExtendedWebSocket } from './messageHandlers';
import { config } from '../config';

export class GameWebSocketServer {
  public wss: WebSocket.Server;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.wss = new WebSocket.Server({ noServer: true, maxPayload: 16 * 1024 });

    this.wss.on('connection', (ws: ExtendedWebSocket, req: http.IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.heartbeatInterval = setInterval(() => {
      this.sweepHeartbeats();
    }, config.heartbeatIntervalMs);
  }

  public handleUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): void {
    const origin = req.headers['origin'];
    const clientIp = this.getClientIp(req);

    // Origin verification
    if (origin) {
      const allowed = config.allowedOrigins.some(
        (ao) => origin === ao || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
      );
      if (!allowed) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    // IP connection throttling
    if (!roomManager.canIpConnect(clientIp)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  private handleConnection(ws: ExtendedWebSocket, req: http.IncomingMessage): void {
    const clientIp = this.getClientIp(req);
    ws.clientIp = clientIp;
    roomManager.trackIp(clientIp);

    // Idle authentication timeout for unauthenticated sockets when auth is required
    if (config.authRequired || config.isProduction) {
      ws.idleAuthTimer = setTimeout(() => {
        if (!ws.isAuthenticated) {
          WebSocketMessageHandlers.sendError(ws, 'AUTH_TIMEOUT', 'Idle socket closed: authentication not completed.');
          ws.close(4001, 'Auth Timeout');
        }
      }, config.idleAuthTimeoutMs);
    }

    ws.on('message', (data: WebSocket.Data) => {
      try {
        WebSocketMessageHandlers.handleMessage(ws, data.toString());
      } catch (err: any) {
        console.warn('[wsServer] Message handler exception:', err.message);
      }
    });

    ws.on('close', () => {
      this.handleClose(ws);
    });

    ws.on('error', (err) => {
      console.warn('[wsServer] Socket error:', err.message);
    });
  }

  private handleClose(ws: ExtendedWebSocket): void {
    if (ws.idleAuthTimer) {
      clearTimeout(ws.idleAuthTimer);
    }
    if (ws.clientIp) {
      roomManager.untrackIp(ws.clientIp);
    }

    // Remove from matchmaking queues
    matchmaker.dequeue(ws);

    // Check if socket was in an active room
    const room = roomManager.findRoomBySocket(ws);
    if (room) {
      const client = room.getClientBySocket(ws);
      if (client) {
        if (room.lifecycleState === 'LOBBY_WAITING') {
          room.clients.delete(client.playerId);
          room.broadcast('PLAYER_LEFT', { playerId: client.playerId, name: client.name, stateSeq: room.nextSeq() });
          if (room.clients.size === 0) {
            roomManager.removeRoom(room.id);
          }
        } else {
          room.handleDisconnect(client);
        }
      }
    }
  }

  private getClientIp(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
  }

  private sweepHeartbeats(): void {
    // Ping all clients; drop stale ones
    this.wss.clients.forEach((ws: WebSocket) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch {}
      }
    });
  }

  public broadcastShutdown(): void {
    const payload = JSON.stringify({
      type: 'SERVER_SHUTDOWN',
      payload: { message: 'Server is restarting or shutting down.', timestamp: Date.now() },
    });
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          ws.close(1001, 'Server Shutdown');
        } catch {}
      }
    });
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.broadcastShutdown();
    this.wss.close();
  }
}
