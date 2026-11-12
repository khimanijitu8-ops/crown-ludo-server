"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchmaker = exports.Matchmaker = void 0;
const ws_1 = __importDefault(require("ws"));
const roomManager_1 = require("../rooms/roomManager");
class Matchmaker {
    queues = {
        2: [],
        3: [],
        4: [],
    };
    enqueue(ws, playerId, name, playerCount) {
        if (![2, 3, 4].includes(playerCount)) {
            throw new Error('INVALID_PLAYER_COUNT: Player count must be 2, 3, or 4.');
        }
        // Check if already in queue
        if (this.isInQueue(ws, playerId)) {
            throw new Error('ALREADY_QUEUED: Player is already in matchmaking queue.');
        }
        const queue = this.queues[playerCount];
        queue.push({
            ws,
            playerId,
            name,
            playerCount,
            queuedAt: Date.now(),
        });
        // Check if enough players to form a room
        if (queue.length >= playerCount) {
            const matched = queue.splice(0, playerCount);
            const room = roomManager_1.roomManager.createRoom(undefined, playerCount, false);
            matched.forEach((item, idx) => {
                room.addClient(item.ws, item.playerId, item.name, idx === 0);
            });
            // Start game immediately
            const gameState = room.startGame();
            // Notify all matched players
            matched.forEach((item) => {
                const client = room.clients.get(item.playerId);
                const joinPayload = {
                    roomId: room.id,
                    roomCode: room.roomCode,
                    playerColor: client?.playerColor,
                    reconnectToken: client?.reconnectToken,
                    isHost: client?.isHost,
                    players: Array.from(room.clients.values()).map((c) => ({
                        playerId: c.playerId,
                        name: c.name,
                        color: c.playerColor,
                        isHost: c.isHost,
                    })),
                    serverGameState: gameState,
                    stateSeq: room.stateSeq,
                };
                if (item.ws.readyState === ws_1.default.OPEN) {
                    try {
                        item.ws.send(JSON.stringify({ event: 'ROOM_JOINED', type: 'ROOM_JOINED', payload: joinPayload }));
                        item.ws.send(JSON.stringify({ event: 'GAME_START', type: 'GAME_START', payload: joinPayload }));
                    }
                    catch { }
                }
            });
            return { queued: true, matchedRoom: room };
        }
        return { queued: true };
    }
    dequeue(ws) {
        let removed = false;
        for (const count of [2, 3, 4]) {
            const idx = this.queues[count].findIndex((item) => item.ws === ws);
            if (idx !== -1) {
                this.queues[count].splice(idx, 1);
                removed = true;
            }
        }
        return removed;
    }
    isInQueue(ws, playerId) {
        for (const count of [2, 3, 4]) {
            if (this.queues[count].some((item) => item.ws === ws || item.playerId === playerId)) {
                return true;
            }
        }
        return false;
    }
    getQueueSizes() {
        return {
            2: this.queues[2].length,
            3: this.queues[3].length,
            4: this.queues[4].length,
        };
    }
}
exports.Matchmaker = Matchmaker;
exports.matchmaker = new Matchmaker();
