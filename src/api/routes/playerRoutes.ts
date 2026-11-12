import { Router, Response } from 'express';
import { z } from 'zod';
import { profileRepository } from '../../database/repositories/profileRepository';
import { statsRepository } from '../../database/repositories/statsRepository';
import { matchRepository } from '../../database/repositories/matchRepository';
import { expressAuthMiddleware, AuthenticatedRequest } from '../../auth/authMiddleware';

export const playerRoutes = Router();

const UpdateProfileSchema = z.object({
  displayName: z.string().min(2).max(32).optional(),
  avatarId: z.string().max(32).optional(),
  avatarEmoji: z.string().max(8).optional(),
});

playerRoutes.get('/profile', expressAuthMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  let profile = await profileRepository.getByUserId(userId);

  if (!profile) {
    profile = await profileRepository.upsert({
      user_id: userId,
      display_name: req.user!.username || 'Player',
    });
  }

  res.status(200).json({ profile });
});

playerRoutes.put('/profile', expressAuthMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = UpdateProfileSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    return;
  }

  const userId = req.user!.id;
  const updated = await profileRepository.upsert({
    user_id: userId,
    display_name: parse.data.displayName || req.user!.username || 'Player',
    avatar_id: parse.data.avatarId,
    avatar_emoji: parse.data.avatarEmoji,
  });

  res.status(200).json({ message: 'Profile updated', profile: updated });
});

playerRoutes.get('/statistics', expressAuthMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const stats = await statsRepository.getByUserId(userId);
  res.status(200).json({ statistics: stats });
});

playerRoutes.get('/matches', expressAuthMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const matches = await matchRepository.getPlayerMatches(userId, limit);
  res.status(200).json({ matches });
});
