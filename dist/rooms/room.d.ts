import WebSocket from 'ws';
import { GameState, PlayerColor, MoveResult } from '../engine/types';
export interface RoomClient {
    ws: WebSocket;
    playerId: string;
    name: string;
    playerColor?: PlayerColor;
    isHost: boolean;
    reconnectToken: string;
    isDisconnected: boolean;
    disconnectedAt?: number;
    lastPing: number;
}
export declare class GameRoom {
    id: string;
    roomCode: string;
    playerCount: number;
    isPrivate: boolean;
    lifecycleState: 'LOBBY_WAITING' | 'ACTIVE_MATCH' | 'PLAYER_DISCONNECTED_GRACE' | 'FINISHED';
    stateSeq: number;
    serverGameState: GameState | null;
    clients: Map<string, RoomClient>;
    pendingRoll: {
        rollValue: number;
        legalMoves: number[];
        playerColor: string;
        rolledAt: number;
    } | null;
    turnTimer: NodeJS.Timeout | null;
    graceTimer: NodeJS.Timeout | null;
    turnDurationMs: number;
    gracePeriodMs: number;
    createdAt: number;
    lastActivity: number;
    constructor(id: string, roomCode: string, playerCount?: number, isPrivate?: boolean);
    nextSeq(): number;
    addClient(ws: WebSocket, playerId: string, name: string, isHost?: boolean): RoomClient;
    getClientBySocket(ws: WebSocket): RoomClient | null;
    getClientByToken(token: string): RoomClient | null;
    broadcast(type: string, payload: any, excludeWs?: WebSocket | null): void;
    assignColors(): void;
    startGame(): GameState;
    startTurnTimer(): void;
    clearTurnTimer(): void;
    handleTurnTimeout(): void;
    rollDiceAuthoritative(isAuto?: boolean): {
        rollValue: number;
        legalMoves: number[];
    } | null;
    executeMoveAuthoritative(tokenId: number, isAuto?: boolean): MoveResult | null;
    handleDisconnect(client: RoomClient): void;
    handleGracePeriodExpiration(client: RoomClient): void;
    handleReconnect(ws: WebSocket, client: RoomClient): void;
    cleanup(): void;
}
