import http from 'http';
import https from 'https';
import { config, ServerConfig } from './config';
import { db } from './database/db';
import { redis } from './redis/redisClient';
import { runMigrations } from './database/migrate';
import { createExpressApp } from './api/app';
import { GameWebSocketServer } from './websocket/wsServer';
import { roomManager } from './rooms/roomManager';

export interface GameServerInstance {
  server: http.Server;
  wsServer: GameWebSocketServer;
  port: number;
  close: (callback?: () => void) => void;
}

export function createGameServer(customConfig: Partial<ServerConfig> = {}): GameServerInstance {
  // Apply any custom overrides (e.g. from test harnesses)
  if (customConfig.port !== undefined) config.port = customConfig.port;
  if (customConfig.jwtSecret !== undefined) config.jwtSecret = customConfig.jwtSecret;
  if (customConfig.authRequired !== undefined) config.authRequired = customConfig.authRequired;
  if (customConfig.isProduction !== undefined) config.isProduction = customConfig.isProduction;

  // Fail-closed security rule check
  if (config.isProduction && !config.jwtSecret) {
    const msg = 'FATAL_AUTH_CONFIG_ERROR: Production environment requires JWT secret.';
    console.error(msg);
    throw new Error(msg);
  }

  const app = createExpressApp();
  const server = http.createServer(app);
  const wsServer = new GameWebSocketServer();

  server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head);
  });

  const closeInstance = (callback?: () => void) => {
    wsServer.close();
    roomManager.close();
    server.close(() => {
      db.close().finally(() => {
        redis.close().finally(() => {
          if (callback) callback();
        });
      });
    });
  };

  return {
    server,
    wsServer,
    port: config.port,
    close: closeInstance,
  };
}

export async function startServer(): Promise<GameServerInstance> {
  console.log('👑 ==============================================================');
  console.log('👑 CROWN LUDO 3D — PRODUCTION BACKEND INITIALIZING');
  console.log(`👑 Environment: ${config.env.toUpperCase()} | Port: ${config.port}`);
  console.log('👑 ==============================================================');

  // Initialize DB and run migrations
  await db.init();
  await runMigrations();

  // Initialize Redis
  await redis.init();

  const instance = createGameServer();

  instance.server.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 [Crown Ludo Server] HTTP & WebSocket online at http://0.0.0.0:${config.port}`);
    console.log(`📊 Health Endpoint: http://0.0.0.0:${config.port}/health`);
    console.log(`📡 WebSocket URL: ws://0.0.0.0:${config.port}`);
  });

  // Keep-alive self-ping to prevent Render Free tier from spinning down (10m interval < 15m cutoff)
  const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://crown-ludo-server.onrender.com/health';
  const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000;
  const keepAliveTimer = setInterval(() => {
    https.get(KEEP_ALIVE_URL, (res) => {
      console.log(`💓 [KeepAlive] Ping to ${KEEP_ALIVE_URL} -> HTTP ${res.statusCode}`);
    }).on('error', (err) => {
      console.warn(`⚠️ [KeepAlive] Self-ping error: ${err.message}`);
    });
  }, KEEP_ALIVE_INTERVAL);

  const handleTermination = (signal: string) => {
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
