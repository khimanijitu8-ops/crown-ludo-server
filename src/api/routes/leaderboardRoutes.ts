import { Router, Request, Response } from 'express';
import { statsRepository } from '../../database/repositories/statsRepository';

export const leaderboardRoutes = Router();

leaderboardRoutes.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
  const leaderboard = await statsRepository.getLeaderboard(limit);
  res.status(200).json({ leaderboard });
});
