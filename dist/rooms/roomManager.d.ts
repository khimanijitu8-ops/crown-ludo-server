import WebSocket from 'ws';
import { GameRoom } from './room';
export declare class RoomManager {
    rooms: Map<string, GameRoom>;
    ipConnections: Map<string, number>;
    private sweepInterval;
    constructor();
    createRoom(id?: string, playerCount?: number, isPrivate?: boolean): GameRoom;
    getRoom(roomId: string): GameRoom | null;
    getRoomByCode(code: string): GameRoom | null;
    findRoomBySocket(ws: WebSocket): GameRoom | null;
    removeRoom(roomId: string): void;
    canIpConnect(ip: string): boolean;
    trackIp(ip: string): void;
    untrackIp(ip: string): void;
    sweepInactiveRooms(): void;
    getMetrics(): {
        totalRooms: number;
        activeRooms: number;
        waitingRooms: number;
        graceRooms: number;
        totalConnections: number;
    };
    close(): void;
}
export declare const roomManager: RoomManager;
