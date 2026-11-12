"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
class JwtService {
    static generateTokens(userId, username = '', isGuest = false) {
        const payload = {
            sub: userId,
            username,
            is_guest: isGuest,
            role: 'authenticated',
        };
        const accessToken = jsonwebtoken_1.default.sign(payload, config_1.config.jwtSecret, {
            expiresIn: config_1.config.jwtExpiresIn,
            algorithm: 'HS256',
        });
        const refreshToken = crypto_1.default.randomBytes(40).toString('hex');
        return {
            accessToken,
            refreshToken,
            expiresIn: config_1.config.jwtExpiresIn,
        };
    }
    static verifyAccessToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret, {
                algorithms: ['HS256'],
            });
            return { valid: true, payload: decoded };
        }
        catch (err) {
            if (err.name === 'TokenExpiredError') {
                return { valid: false, error: 'AUTH_EXPIRED' };
            }
            return { valid: false, error: 'AUTH_FAILED' };
        }
    }
    /**
     * Constant-time timing-safe string comparison to prevent timing attacks.
     */
    static timingSafeEqual(a, b) {
        const bufA = Buffer.from(a);
        const bufB = Buffer.from(b);
        if (bufA.length !== bufB.length)
            return false;
        return crypto_1.default.timingSafeEqual(bufA, bufB);
    }
}
exports.JwtService = JwtService;
