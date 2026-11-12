import WebSocket from 'ws';
import http from 'http';
export declare class GameWebSocketServer {
    wss: WebSocket.Server;
    private heartbeatInterval;
    constructor();
    handleUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): void;
    private handleConnection;
    private handleClose;
    private getClientIp;
    private sweepHeartbeats;
    broadcastShutdown(): void;
    close(): void;
}
