import dotenv from 'dotenv';
import path from 'path';

// Load .env from server directory or project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export interface ServerConfig {
  env: 'development' | 'production' | 'test';
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  authRequired: boolean;
  databaseUrl?: string;
  redisUrl?: string;
  allowedOrigins: string[];
  maxRooms: number;
  maxConnectionsPerIp: number;
  heartbeatIntervalMs: number;
  turnTimeoutMs: number;
  gracePeriodMs: number;
  cleanupSweepIntervalMs: number;
  idleAuthTimeoutMs: number;
  logEnabled: boolean;
  adminApiKey: string;
}

const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
const isProd = nodeEnv === 'production';

// Strict security rule: Production requires explicit JWT secret
const defaultDevSecret = 'dev_jwt_secret_royal_ludo_3d_insecure_only_for_local_testing_12345';
const defaultRefreshSecret = 'dev_refresh_secret_royal_ludo_3d_insecure_local_testing_67890';

const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || (isProd ? '' : defaultDevSecret);
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || (isProd ? '' : defaultRefreshSecret);

if (isProd && (!jwtSecret || !jwtRefreshSecret)) {
  console.error('FATAL_AUTH_CONFIG_ERROR: Production environment requires JWT_SECRET and JWT_REFRESH_SECRET to be configured.');
}

const rawOrigins = process.env.ALLOWED_ORIGINS || '';
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://royal-ludo-server.onrender.com',
  'https://royalludo.com',
];

export const config: ServerConfig = {
  env: nodeEnv,
  isProduction: isProd,
  port: parseInt(process.env.PORT || '8080', 10),
  jwtSecret: jwtSecret || defaultDevSecret,
  jwtRefreshSecret: jwtRefreshSecret || defaultRefreshSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  authRequired: process.env.AUTH_REQUIRED === 'true' || isProd,
  databaseUrl: process.env.DATABASE_URL || undefined,
  redisUrl: process.env.REDIS_URL || undefined,
  allowedOrigins: rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : defaultAllowedOrigins,
  maxRooms: parseInt(process.env.MAX_ROOMS || '200', 10),
  maxConnectionsPerIp: parseInt(process.env.MAX_CONNECTIONS_PER_IP || '30', 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '15000', 10),
  turnTimeoutMs: parseInt(process.env.TURN_TIMEOUT_MS || '15000', 10),
  gracePeriodMs: parseInt(process.env.GRACE_PERIOD_MS || '30000', 10),
  cleanupSweepIntervalMs: parseInt(process.env.CLEANUP_SWEEP_MS || '300000', 10),
  idleAuthTimeoutMs: parseInt(process.env.IDLE_AUTH_TIMEOUT_MS || '10000', 10),
  logEnabled: process.env.LOG_ENABLED !== 'false',
  adminApiKey: process.env.ADMIN_API_KEY || 'rl_admin_default_sec_token_987654',
};
