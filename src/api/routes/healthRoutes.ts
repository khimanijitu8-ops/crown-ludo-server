import { Router, Request, Response } from 'express';
import { roomManager } from '../../rooms/roomManager';
import { matchmaker } from '../../matchmaking/matchmaker';
import { db } from '../../database/db';
import { redis } from '../../redis/redisClient';
import { config } from '../../config';

export const healthRoutes = Router();

healthRoutes.get('/', async (req: Request, res: Response): Promise<void> => {
  const metrics = roomManager.getMetrics();
  const queueSizes = matchmaker.getQueueSizes();
  const dbHealth = await db.checkHealth();
  const redisHealth = await redis.checkHealth();

  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: config.env,
    authRequired: config.authRequired,
    hasJwtSecret: Boolean(config.jwtSecret),
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
