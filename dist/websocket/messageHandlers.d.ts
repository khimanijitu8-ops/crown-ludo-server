import WebSocket from 'ws';
export interface ExtendedWebSocket extends WebSocket {
    authPlayerId?: string;
    authUsername?: string;
    isAuthenticated?: boolean;
    chatTimestamps?: number[];
    clientIp?: string;
    idleAuthTimer?: NodeJS.Timeout;
}
export declare class WebSocketMessageHandlers {
    static handleMessage(ws: ExtendedWebSocket, rawMessage: string): void;
    private static handlePing;
    private static handleAuthenticate;
    private static checkAuth;
    private static handleQuickMatch;
    private static handleCancelQuickMatch;
    private static handleCreateRoom;
    private static handleJoinRoom;
    private static handleGameStart;
    private static handleRollDice;
    private static handleMoveToken;
    private static handleChatMessage;
    static sendError(ws: WebSocket, code: string, message: string): void;
}
