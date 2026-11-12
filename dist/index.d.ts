import http from 'http';
import { ServerConfig } from './config';
import { GameWebSocketServer } from './websocket/wsServer';
export interface GameServerInstance {
    server: http.Server;
    wsServer: GameWebSocketServer;
    port: number;
    close: (callback?: () => void) => void;
}
export declare function createGameServer(customConfig?: Partial<ServerConfig>): GameServerInstance;
export declare function startServer(): Promise<GameServerInstance>;
