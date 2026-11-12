"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGameServer = createGameServer;
exports.startServer = startServer;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const config_1 = require("./config");
const db_1 = require("./database/db");
const redisClient_1 = require("./redis/redisClient");
const migrate_1 = require("./database/migrate");
const app_1 = require("./api/app");
const wsServer_1 = require("./websocket/wsServer");
const roomManager_1 = require("./rooms/roomManager");
function createGameServer(customConfig = {}) {
    // Apply any custom overrides (e.g. from test harnesses)
    if (customConfig.port !== undefined)
        config_1.config.port = customConfig.port;
    if (customConfig.jwtSecret !== undefined)
        config_1.config.jwtSecret = customConfig.jwtSecret;
    if (customConfig.authRequired !== undefined)
        config_1.config.authRequired = customConfig.authRequired;
    if (customConfig.isProduction !== undefined)
        config_1.config.isProduction = customConfig.isProduction;
    // Fail-closed security rule check
    if (config_1.config.isProduction && !config_1.config.jwtSecret) {
        const msg = 'FATAL_AUTH_CONFIG_ERROR: Production environment requires JWT secret.';
        console.error(msg);
        throw new Error(msg);
    }
    const app = (0, app_1.createExpressApp)();
    const server = http_1.default.createServer(app);
    const wsServer = new wsServer_1.GameWebSocketServer();
    server.on('upgrade', (req, socket, head) => {
        wsServer.handleUpgrade(req, socket, head);
    });
    const closeInstance = (callback) => {
        wsServer.close();
        roomManager_1.roomManager.close();
        server.close(() => {
            db_1.db.close().finally(() => {
                redisClient_1.redis.close().finally(() => {
                    if (callback)
                        callback();
                });
            });
        });
    };
    return {
        server,
        wsServer,
        port: config_1.config.port,
        close: closeInstance,
    };
}
async function startServer() {
    console.log('👑 ==============================================================');
    console.log('👑 CROWN LUDO 3D — PRODUCTION BACKEND INITIALIZING');
    console.log(`👑 Environment: ${config_1.config.env.toUpperCase()} | Port: ${config_1.config.port}`);
    console.log('👑 ==============================================================');
    // Initialize DB and run migrations
    await db_1.db.init();
    await (0, migrate_1.runMigrations)();
    // Initialize Redis
    await redisClient_1.redis.init();
    const instance = createGameServer();
    instance.server.listen(config_1.config.port, '0.0.0.0', () => {
        console.log(`🚀 [Crown Ludo Server] HTTP & WebSocket online at http://0.0.0.0:${config_1.config.port}`);
        console.log(`📊 Health Endpoint: http://0.0.0.0:${config_1.config.port}/health`);
        console.log(`📡 WebSocket URL: ws://0.0.0.0:${config_1.config.port}`);
    });
    // Keep-alive self-ping to prevent Render Free tier from spinning down (10m interval < 15m cutoff)
    const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://crown-ludo-server.onrender.com/health';
    const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000;
    const keepAliveTimer = setInterval(() => {
        https_1.default.get(KEEP_ALIVE_URL, (res) => {
            console.log(`💓 [KeepAlive] Ping to ${KEEP_ALIVE_URL} -> HTTP ${res.statusCode}`);
        }).on('error', (err) => {
            console.warn(`⚠️ [KeepAlive] Self-ping error: ${err.message}`);
        });
    }, KEEP_ALIVE_INTERVAL);
    const handleTermination = (signal) => {
        console.log(`\n🛑 [Server] Received ${signal}. Initiating graceful shutdown...`);
        clearInterval(keepAliveTimer);
        instance.close(() => {
            console.log('✅ [Server] All sockets, rooms, and database pools closed cleanly.');
            process.exit(0);
        });
    };
    process.on('SIGINT', () => handleTermination('SIGINT'));
    process.on('SIGTERM', () => handleTermination('SIGTERM'));
    return instance;
}
if (require.main === module) {
    startServer().catch((err) => {
        console.error('❌ [Server Fatal Startup Error]:', err);
        process.exit(1);
    });
}
