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
export declare const config: ServerConfig;
