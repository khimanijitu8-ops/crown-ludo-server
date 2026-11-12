import crypto from 'crypto';

export class DiceValidator {
  /**
   * Generates a cryptographically secure random integer between 1 and 6 (inclusive).
   */
  public static generateAuthoritativeRoll(): number {
    return crypto.randomInt(1, 7);
  }

  /**
   * Verifies an HS256 JWT using constant-time HMAC calculation.
   * Fully backwards-compatible with existing diceValidator.js used in WebSocket test suites.
   */
  public static verifyHS256Jwt(token: string, secret: string): { valid: boolean; payload?: any; error?: string } {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'MISSING_TOKEN' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'INVALID_FORMAT' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    try {
      const headerStr = Buffer.from(headerB64, 'base64url').toString('utf8');
      const header = JSON.parse(headerStr);
      if (header.alg !== 'HS256') {
        return { valid: false, error: 'UNSUPPORTED_ALGORITHM' };
      }

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      const expectedBuf = Buffer.from(expectedSignature);
      const actualBuf = Buffer.from(signatureB64);

      if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        return { valid: false, error: 'INVALID_SIGNATURE' };
      }

      const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadStr);

      // Verify expiration (exp is in seconds)
      if (payload.exp && typeof payload.exp === 'number') {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec >= payload.exp) {
          return { valid: false, error: 'TOKEN_EXPIRED' };
        }
      }

      return { valid: true, payload };
    } catch (err: any) {
      return { valid: false, error: 'PARSE_ERROR' };
    }
  }

  /**
   * Test helper to create valid test JWTs signed with HS256.
   */
  public static createTestJwt(payload: Record<string, any>, secret: string): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
  }
}
