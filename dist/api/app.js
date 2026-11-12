"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExpressApp = createExpressApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("../config");
const authRoutes_1 = require("./routes/authRoutes");
const playerRoutes_1 = require("./routes/playerRoutes");
const matchmakingRoutes_1 = require("./routes/matchmakingRoutes");
const leaderboardRoutes_1 = require("./routes/leaderboardRoutes");
const healthRoutes_1 = require("./routes/healthRoutes");
const adminRoutes_1 = require("./routes/adminRoutes");
function createExpressApp() {
    const app = (0, express_1.default)();
    // Middleware
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            if (!origin)
                return callback(null, true);
            const allowed = config_1.config.allowedOrigins.some((ao) => origin === ao || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
            if (allowed)
                callback(null, true);
            else
                callback(new Error('CORS Not Allowed'));
        },
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // Root health endpoints (both /health and /api/health)
    app.use('/health', healthRoutes_1.healthRoutes);
    app.use('/api/health', healthRoutes_1.healthRoutes);
    // Modular API routes
    app.use('/api/auth', authRoutes_1.authRoutes);
    app.use('/api/player', playerRoutes_1.playerRoutes);
    app.use('/api/matchmaking', matchmakingRoutes_1.matchmakingRoutes);
    app.use('/api/rooms', matchmakingRoutes_1.roomRoutes);
    app.use('/api/leaderboard', leaderboardRoutes_1.leaderboardRoutes);
    app.use('/api/admin', adminRoutes_1.adminRoutes);
    // Global 404 handler
    app.use((req, res) => {
        res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.url} does not exist.` });
    });
    // Global error handler
    app.use((err, req, res, next) => {
        if (config_1.config.logEnabled) {
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
