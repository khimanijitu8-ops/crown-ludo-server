import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from '../config';
import { authRoutes } from './routes/authRoutes';
import { playerRoutes } from './routes/playerRoutes';
import { matchmakingRoutes, roomRoutes } from './routes/matchmakingRoutes';
import { leaderboardRoutes } from './routes/leaderboardRoutes';
import { healthRoutes } from './routes/healthRoutes';
import { adminRoutes } from './routes/adminRoutes';

export function createExpressApp(): Express {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowed = config.allowedOrigins.some(
          (ao) => origin === ao || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
        );
        if (allowed) callback(null, true);
        else callback(new Error('CORS Not Allowed'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Root health endpoints (both /health and /api/health)
  app.use('/health', healthRoutes);
  app.use('/api/health', healthRoutes);

  // Modular API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/player', playerRoutes);
  app.use('/api/matchmaking', matchmakingRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/admin', adminRoutes);

  // Global 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.url} does not exist.` });
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (config.logEnabled) {
      console.error('[API Error]:', err.message);
    }
    const status = err.status || 500;
    res.status(status).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred.',
    });
  });

  return app;
}
