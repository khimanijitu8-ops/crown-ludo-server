"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = void 0;
const express_1 = require("express");
const authMiddleware_1 = require("../../auth/authMiddleware");
const roomManager_1 = require("../../rooms/roomManager");
const matchmaker_1 = require("../../matchmaking/matchmaker");
exports.adminRoutes = (0, express_1.Router)();
exports.adminRoutes.use(authMiddleware_1.adminAuthMiddleware);
exports.adminRoutes.get('/metrics', (req, res) => {
    res.status(200).json({
        metrics: roomManager_1.roomManager.getMetrics(),
        queueSizes: matchmaker_1.matchmaker.getQueueSizes(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
    });
});
exports.adminRoutes.get('/rooms', (req, res) => {
    const roomsList = Array.from(roomManager_1.roomManager.rooms.values()).map((r) => ({
        id: r.id,
        roomCode: r.roomCode,
        playerCount: r.playerCount,
        lifecycleState: r.lifecycleState,
        clientCount: r.clients.size,
        isPrivate: r.isPrivate,
        createdAt: r.createdAt,
        lastActivity: r.lastActivity,
    }));
    res.status(200).json({ rooms: roomsList });
});
