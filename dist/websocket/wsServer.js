"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameWebSocketServer = void 0;
const ws_1 = __importDefault(require("ws"));
const roomManager_1 = require("../rooms/roomManager");
const matchmaker_1 = require("../matchmaking/matchmaker");
const messageHandlers_1 = require("./messageHandlers");
const config_1 = require("../config");
class GameWebSocketServer {
    wss;
    heartbeatInterval = null;
    constructor() {
        this.wss = new ws_1.default.Server({ noServer: true, maxPayload: 16 * 1024 });
        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });
        this.heartbeatInterval = setInterval(() => {
            this.sweepHeartbeats();
        }, config_1.config.heartbeatIntervalMs);
    }
    handleUpgrade(req, socket, head) {
        const origin = req.headers['origin'];
        const clientIp = this.getClientIp(req);
        // Origin verification (allow mobile apps where origin is absent, file://, or onrender domain)
        if (origin && origin !== 'null' && origin !== 'file://') {
            const allowed = config_1.config.allowedOrigins.some((ao) => origin === ao || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') || origin.endsWith('.onrender.com'));
            if (!allowed) {
                socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                socket.destroy();
                return;
            }
        }
        // IP connection throttling
        if (!roomManager_1.roomManager.canIpConnect(clientIp)) {
            socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
            socket.destroy();
            return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
            this.wss.emit('connection', ws, req);
        });
    }
    handleConnection(ws, req) {
        const clientIp = this.getClientIp(req);
        ws.clientIp = clientIp;
        roomManager_1.roomManager.trackIp(clientIp);
        // Idle authentication timeout for unauthenticated sockets when auth is required
        if (config_1.config.authRequired || config_1.config.isProduction) {
            ws.idleAuthTimer = setTimeout(() => {
                if (!ws.isAuthenticated) {
                    messageHandlers_1.WebSocketMessageHandlers.sendError(ws, 'AUTH_TIMEOUT', 'Idle socket closed: authentication not completed.');
                    ws.close(4001, 'Auth Timeout');
                }
            }, config_1.config.idleAuthTimeoutMs);
        }
        ws.on('message', (data) => {
            try {
                messageHandlers_1.WebSocketMessageHandlers.handleMessage(ws, data.toString());
            }
            catch (err) {
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
    handleClose(ws) {
        if (ws.idleAuthTimer) {
            clearTimeout(ws.idleAuthTimer);
        }
        if (ws.clientIp) {
            roomManager_1.roomManager.untrackIp(ws.clientIp);
        }
        // Remove from matchmaking queues
        matchmaker_1.matchmaker.dequeue(ws);
        // Check if socket was in an active room
        const room = roomManager_1.roomManager.findRoomBySocket(ws);
        if (room) {
            const client = room.getClientBySocket(ws);
            if (client) {
                if (room.lifecycleState === 'LOBBY_WAITING') {
                    room.clients.delete(client.playerId);
                    room.broadcast('PLAYER_LEFT', { playerId: client.playerId, name: client.name, stateSeq: room.nextSeq() });
                    if (room.clients.size === 0) {
                        roomManager_1.roomManager.removeRoom(room.id);
                    }
                }
                else {
                    room.handleDisconnect(client);
                }
            }
        }
    }
    getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string') {
            return forwarded.split(',')[0].trim();
        }
        return req.socket.remoteAddress || '127.0.0.1';
    }
    sweepHeartbeats() {
        // Ping all clients; drop stale ones
        this.wss.clients.forEach((ws) => {
            if (ws.readyState === ws_1.default.OPEN) {
                try {
                    ws.ping();
                }
                catch { }
            }
        });
    }
    broadcastShutdown() {
        const payload = JSON.stringify({
            type: 'SERVER_SHUTDOWN',
            payload: { message: 'Server is restarting or shutting down.', timestamp: Date.now() },
        });
        this.wss.clients.forEach((ws) => {
            if (ws.readyState === ws_1.default.OPEN) {
                try {
                    ws.send(payload);
                    ws.close(1001, 'Server Shutdown');
                }
                catch { }
            }
        });
    }
    close() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.broadcastShutdown();
        this.wss.close();
    }
}
exports.GameWebSocketServer = GameWebSocketServer;
