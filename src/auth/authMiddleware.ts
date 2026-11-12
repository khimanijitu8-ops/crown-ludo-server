import { Request, Response, NextFunction } from 'express';
import { JwtService } from './jwtService';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    is_guest?: boolean;
  };
}

export function expressAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (!config.authRequired && !config.isProduction) {
      // In dev mode when auth is not strictly required, allow guest fallback
      req.user = { id: `guest_${Date.now()}`, is_guest: true };
      return next();
    }
    res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authorization header required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const result = JwtService.verifyAccessToken(token);

  if (!result.valid || !result.payload) {
    const status = result.error === 'AUTH_EXPIRED' ? 401 : 403;
    res.status(status).json({ error: result.error || 'AUTH_FAILED', message: 'Invalid or expired token' });
    return;
  }

  req.user = {
    id: result.payload.sub,
    username: result.payload.username,
    is_guest: result.payload.is_guest,
  };

  next();
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (!apiKey || apiKey !== config.adminApiKey) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Valid admin key required' });
    return;
  }
  next();
}
