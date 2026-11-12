export declare class DiceValidator {
    /**
     * Generates a cryptographically secure random integer between 1 and 6 (inclusive).
     */
    static generateAuthoritativeRoll(): number;
    /**
     * Verifies an HS256 JWT using constant-time HMAC calculation.
     * Fully backwards-compatible with existing diceValidator.js used in WebSocket test suites.
     */
    static verifyHS256Jwt(token: string, secret: string): {
        valid: boolean;
        payload?: any;
        error?: string;
    };
    /**
     * Test helper to create valid test JWTs signed with HS256.
     */
    static createTestJwt(payload: Record<string, any>, secret: string): string;
}
