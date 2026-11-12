import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { JwtPayload, AuthTokens } from './types';

export class JwtService {
  public static generateTokens(userId: string, username: string = '', isGuest: boolean = false): AuthTokens {
    const payload: JwtPayload = {
      sub: userId,
      username,
      is_guest: isGuest,
      role: 'authenticated',
    };

    const accessToken = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as any,
      algorithm: 'HS256',
    });

    const refreshToken = crypto.randomBytes(40).toString('hex');

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwtExpiresIn,
    };
  }

  public static verifyAccessToken(token: string): { valid: boolean; payload?: JwtPayload; error?: string } {
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
      }) as JwtPayload;

      return { valid: true, payload: decoded };
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return { valid: false, error: 'AUTH_EXPIRED' };
      }
      return { valid: false, error: 'AUTH_FAILED' };
    }
  }

  /**
   * Constant-time timing-safe string comparison to prevent timing attacks.
   */
  public static timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
