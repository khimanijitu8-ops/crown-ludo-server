import { JwtPayload, AuthTokens } from './types';
export declare class JwtService {
    static generateTokens(userId: string, username?: string, isGuest?: boolean): AuthTokens;
    static verifyAccessToken(token: string): {
        valid: boolean;
        payload?: JwtPayload;
        error?: string;
    };
    /**
     * Constant-time timing-safe string comparison to prevent timing attacks.
     */
    static timingSafeEqual(a: string, b: string): boolean;
}
