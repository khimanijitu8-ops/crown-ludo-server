"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expressAuthMiddleware = expressAuthMiddleware;
exports.adminAuthMiddleware = adminAuthMiddleware;
const jwtService_1 = require("./jwtService");
const config_1 = require("../config");
function expressAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (!config_1.config.authRequired && !config_1.config.isProduction) {
            // In dev mode when auth is not strictly required, allow guest fallback
            req.user = { id: `guest_${Date.now()}`, is_guest: true };
            return next();
        }
        res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authorization header required' });
        return;
    }
    const token = authHeader.split(' ')[1];
    const result = jwtService_1.JwtService.verifyAccessToken(token);
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
function adminAuthMiddleware(req, res, next) {
    const apiKey = req.headers['x-admin-key'] || req.query.adminKey;
    if (!apiKey || apiKey !== config_1.config.adminApiKey) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Valid admin key required' });
        return;
    }
    next();
}
