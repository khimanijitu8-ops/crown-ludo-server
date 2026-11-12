import { Router, Response } from 'express';
import { z } from 'zod';
import { matchmaker } from '../../matchmaking/matchmaker';
import { roomManager } from '../../rooms/roomManager';
import { expressAuthMiddleware, AuthenticatedRequest } from '../../auth/authMiddleware';

export const matchmakingRoutes = Router();

const MatchmakingJoinSchema = z.object({
  playerCount: z.number().int().min(2).max(4),
});

matchmakingRoutes.get('/status', (req, res) => {
  res.status(200).json({ queueSizes: matchmaker.getQueueSizes() });
});

export const roomRoutes = Router();

const CreateRoomSchema = z.object({
  roomId: z.string().min(3).max(24).optional(),
  playerCount: z.number().int().min(2).max(4).default(2),
  isPrivate: z.boolean().default(true),
});

roomRoutes.post('/create', expressAuthMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const parse = CreateRoomSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    return;
  }

  try {
    const room = roomManager.createRoom(parse.data.roomId, parse.data.playerCount, parse.data.isPrivate);
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
  } catch (err: any) {
    res.status(400).json({ error: 'ROOM_CREATE_FAILED', message: err.message });
  }
});

roomRoutes.get('/:roomId', (req: AuthenticatedRequest, res: Response): void => {
  const room = roomManager.getRoomByCode(req.params.roomId);
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
