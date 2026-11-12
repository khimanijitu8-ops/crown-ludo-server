import WebSocket from 'ws';
import { GameRoom } from '../rooms/room';
export interface QueueEntry {
    ws: WebSocket;
    playerId: string;
    name: string;
    playerCount: number;
    queuedAt: number;
}
export declare class Matchmaker {
    queues: Record<number, QueueEntry[]>;
    enqueue(ws: WebSocket, playerId: string, name: string, playerCount: number): {
        queued: boolean;
        matchedRoom?: GameRoom;
    };
    dequeue(ws: WebSocket): boolean;
    isInQueue(ws: WebSocket, playerId: string): boolean;
    getQueueSizes(): Record<number, number>;
}
export declare const matchmaker: Matchmaker;
