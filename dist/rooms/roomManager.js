"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomManager = exports.RoomManager = void 0;
const crypto_1 = __importDefault(require("crypto"));
const room_1 = require("./room");
const config_1 = require("../config");
class RoomManager {
    rooms = new Map();
    ipConnections = new Map();
    sweepInterval = null;
    constructor() {
        this.sweepInterval = setInterval(() => {
            this.sweepInactiveRooms();
        }, config_1.config.cleanupSweepIntervalMs);
    }
    createRoom(id, playerCount = 2, isPrivate = true) {
        if (this.rooms.size >= config_1.config.maxRooms) {
            throw new Error('SERVER_BUSY: Maximum room capacity reached.');
        }
        const roomId = id || `LK-${crypto_1.default.randomInt(100000, 1000000)}`;
        const roomCode = roomId.startsWith('LK-') ? roomId.slice(3) : roomId;
        if (this.rooms.has(roomId)) {
            throw new Error('ROOM_EXISTS: Room already exists.');
        }
        const room = new room_1.GameRoom(roomId, roomCode, playerCount, isPrivate);
        this.rooms.set(roomId, room);
        return room;
    }
    getRoom(roomId) {
        return this.rooms.get(roomId) || null;
    }
    getRoomByCode(code) {
        for (const r of this.rooms.values()) {
            if (r.roomCode === code || r.id === code || r.id === `LK-${code}`) {
                return r;
            }
        }
        return null;
    }
    findRoomBySocket(ws) {
        for (const r of this.rooms.values()) {
            for (const c of r.clients.values()) {
                if (c.ws === ws)
                    return r;
            }
        }
        return null;
    }
    removeRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.cleanup();
            this.rooms.delete(roomId);
        }
    }
    canIpConnect(ip) {
        const count = this.ipConnections.get(ip) || 0;
        return count < config_1.config.maxConnectionsPerIp;
    }
    trackIp(ip) {
        const count = this.ipConnections.get(ip) || 0;
        this.ipConnections.set(ip, count + 1);
    }
    untrackIp(ip) {
        const count = this.ipConnections.get(ip) || 0;
        if (count <= 1) {
            this.ipConnections.delete(ip);
        }
        else {
            this.ipConnections.set(ip, count - 1);
        }
    }
    sweepInactiveRooms() {
        const now = Date.now();
        for (const [id, room] of this.rooms.entries()) {
            // Clean finished rooms older than 5 minutes or inactive rooms older than 30 minutes
            if (room.lifecycleState === 'FINISHED' && now - room.lastActivity > 5 * 60 * 1000) {
                this.removeRoom(id);
            }
            else if (now - room.lastActivity > 30 * 60 * 1000) {
                this.removeRoom(id);
            }
        }
    }
    getMetrics() {
        let active = 0;
        let waiting = 0;
        let grace = 0;
        let totalConn = 0;
        for (const r of this.rooms.values()) {
            if (r.lifecycleState === 'ACTIVE_MATCH')
                active++;
            else if (r.lifecycleState === 'LOBBY_WAITING')
                waiting++;
            else if (r.lifecycleState === 'PLAYER_DISCONNECTED_GRACE')
                grace++;
            for (const c of r.clients.values()) {
                if (!c.isDisconnected)
                    totalConn++;
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
    close() {
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
exports.RoomManager = RoomManager;
exports.roomManager = new RoomManager();
