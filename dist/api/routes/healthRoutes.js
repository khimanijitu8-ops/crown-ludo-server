"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = void 0;
const express_1 = require("express");
const roomManager_1 = require("../../rooms/roomManager");
const matchmaker_1 = require("../../matchmaking/matchmaker");
const db_1 = require("../../database/db");
const redisClient_1 = require("../../redis/redisClient");
const config_1 = require("../../config");
exports.healthRoutes = (0, express_1.Router)();
exports.healthRoutes.get('/', async (req, res) => {
    const metrics = roomManager_1.roomManager.getMetrics();
    const queueSizes = matchmaker_1.matchmaker.getQueueSizes();
    const dbHealth = await db_1.db.checkHealth();
    const redisHealth = await redisClient_1.redis.checkHealth();
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        environment: config_1.config.env,
        authRequired: config_1.config.authRequired,
        hasJwtSecret: Boolean(config_1.config.jwtSecret),
        version: '2.0.0',
        memory: process.memoryUsage(),
        totalRooms: metrics.totalRooms,
        activeRooms: metrics.activeRooms,
        waitingRooms: metrics.waitingRooms,
        graceRooms: metrics.graceRooms,
        totalConnections: metrics.totalConnections,
        queueSizes,
        database: dbHealth,
        redis: redisHealth,
    });
});
