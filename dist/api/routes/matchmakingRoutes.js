"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomRoutes = exports.matchmakingRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const matchmaker_1 = require("../../matchmaking/matchmaker");
const roomManager_1 = require("../../rooms/roomManager");
const authMiddleware_1 = require("../../auth/authMiddleware");
exports.matchmakingRoutes = (0, express_1.Router)();
const MatchmakingJoinSchema = zod_1.z.object({
    playerCount: zod_1.z.number().int().min(2).max(4),
});
exports.matchmakingRoutes.get('/status', (req, res) => {
    res.status(200).json({ queueSizes: matchmaker_1.matchmaker.getQueueSizes() });
});
exports.roomRoutes = (0, express_1.Router)();
const CreateRoomSchema = zod_1.z.object({
    roomId: zod_1.z.string().min(3).max(24).optional(),
    playerCount: zod_1.z.number().int().min(2).max(4).default(2),
    isPrivate: zod_1.z.boolean().default(true),
});
exports.roomRoutes.post('/create', authMiddleware_1.expressAuthMiddleware, (req, res) => {
    const parse = CreateRoomSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
        return;
    }
    try {
        const room = roomManager_1.roomManager.createRoom(parse.data.roomId, parse.data.playerCount, parse.data.isPrivate);
        res.status(201).json({
            message: 'Room created',
            room: {
                id: room.id,
                roomCode: room.roomCode,
                playerCount: room.playerCount,
                isPrivate: room.isPrivate,
                stateSeq: room.stateSeq,
            },
        });
    }
    catch (err) {
        res.status(400).json({ error: 'ROOM_CREATE_FAILED', message: err.message });
    }
});
exports.roomRoutes.get('/:roomId', (req, res) => {
    const room = roomManager_1.roomManager.getRoomByCode(req.params.roomId);
    if (!room) {
        res.status(404).json({ error: 'ROOM_NOT_FOUND', message: 'Room not found.' });
        return;
    }
    res.status(200).json({
        room: {
            id: room.id,
            roomCode: room.roomCode,
            playerCount: room.playerCount,
            lifecycleState: room.lifecycleState,
            clientCount: room.clients.size,
            stateSeq: room.stateSeq,
        },
    });
});
