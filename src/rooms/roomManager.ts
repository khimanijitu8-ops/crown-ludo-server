import WebSocket from 'ws';
import crypto from 'crypto';
import { GameRoom } from './room';
import { config } from '../config';

export class RoomManager {
  public rooms: Map<string, GameRoom> = new Map();
  public ipConnections: Map<string, number> = new Map();
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.sweepInterval = setInterval(() => {
      this.sweepInactiveRooms();
    }, config.cleanupSweepIntervalMs);
  }

  public createRoom(id?: string, playerCount: number = 2, isPrivate: boolean = true): GameRoom {
    if (this.rooms.size >= config.maxRooms) {
      throw new Error('SERVER_BUSY: Maximum room capacity reached.');
    }

    const roomId = id || `LK-${crypto.randomInt(100000, 1000000)}`;
    const roomCode = roomId.startsWith('LK-') ? roomId.slice(3) : roomId;

    if (this.rooms.has(roomId)) {
      throw new Error('ROOM_EXISTS: Room already exists.');
    }

    const room = new GameRoom(roomId, roomCode, playerCount, isPrivate);
    this.rooms.set(roomId, room);
    return room;
  }

  public getRoom(roomId: string): GameRoom | null {
    return this.rooms.get(roomId) || null;
  }

  public getRoomByCode(code: string): GameRoom | null {
    for (const r of this.rooms.values()) {
      if (r.roomCode === code || r.id === code || r.id === `LK-${code}`) {
        return r;
      }
    }
    return null;
  }

  public findRoomBySocket(ws: WebSocket): GameRoom | null {
    for (const r of this.rooms.values()) {
      for (const c of r.clients.values()) {
        if (c.ws === ws) return r;
      }
    }
    return null;
  }

  public removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.cleanup();
      this.rooms.delete(roomId);
    }
  }

  public canIpConnect(ip: string): boolean {
    const count = this.ipConnections.get(ip) || 0;
    return count < config.maxConnectionsPerIp;
  }

  public trackIp(ip: string): void {
    const count = this.ipConnections.get(ip) || 0;
    this.ipConnections.set(ip, count + 1);
  }

  public untrackIp(ip: string): void {
    const count = this.ipConnections.get(ip) || 0;
    if (count <= 1) {
      this.ipConnections.delete(ip);
    } else {
      this.ipConnections.set(ip, count - 1);
    }
  }

  public sweepInactiveRooms(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms.entries()) {
      // Clean finished rooms older than 5 minutes or inactive rooms older than 30 minutes
      if (room.lifecycleState === 'FINISHED' && now - room.lastActivity > 5 * 60 * 1000) {
        this.removeRoom(id);
      } else if (now - room.lastActivity > 30 * 60 * 1000) {
        this.removeRoom(id);
      }
    }
  }

  public getMetrics(): {
    totalRooms: number;
    activeRooms: number;
    waitingRooms: number;
    graceRooms: number;
    totalConnections: number;
  } {
    let active = 0;
    let waiting = 0;
    let grace = 0;
    let totalConn = 0;

    for (const r of this.rooms.values()) {
      if (r.lifecycleState === 'ACTIVE_MATCH') active++;
      else if (r.lifecycleState === 'LOBBY_WAITING') waiting++;
      else if (r.lifecycleState === 'PLAYER_DISCONNECTED_GRACE') grace++;

      for (const c of r.clients.values()) {
        if (!c.isDisconnected) totalConn++;
      }
    }

    return {
      totalRooms: this.rooms.size,
      activeRooms: active,
      waitingRooms: waiting,
      graceRooms: grace,
      totalConnections: totalConn,
    };
  }

  public close(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    for (const r of this.rooms.values()) {
      r.cleanup();
    }
    this.rooms.clear();
  }
}

export const roomManager = new RoomManager();
