import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../../auth/authMiddleware';
import { roomManager } from '../../rooms/roomManager';
import { matchmaker } from '../../matchmaking/matchmaker';

export const adminRoutes = Router();

adminRoutes.use(adminAuthMiddleware);

adminRoutes.get('/metrics', (req: Request, res: Response) => {
  res.status(200).json({
    metrics: roomManager.getMetrics(),
    queueSizes: matchmaker.getQueueSizes(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
});

adminRoutes.get('/rooms', (req: Request, res: Response) => {
  const roomsList = Array.from(roomManager.rooms.values()).map((r) => ({
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
