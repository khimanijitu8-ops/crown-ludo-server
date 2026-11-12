import { Pool } from 'pg';
export interface DatabaseHealth {
    connected: boolean;
    type: 'postgres' | 'in-memory-fallback';
    latencyMs?: number;
    error?: string;
}
declare class DatabaseManager {
    private pool;
    private isConnected;
    private isFallback;
    memoryUsers: Map<string, any>;
    memoryProfiles: Map<string, any>;
    memorySessions: Map<string, any>;
    memoryRooms: Map<string, any>;
    memoryMatches: Map<string, any>;
    memoryMatchPlayers: Map<string, any>;
    memoryMatchResults: Map<string, any>;
    memoryStats: Map<string, any>;
    memoryAuditLogs: any[];
    constructor();
    init(): Promise<void>;
    query(text: string, params?: any[]): Promise<any>;
    getPool(): Pool | null;
    getIsFallback(): boolean;
    checkHealth(): Promise<DatabaseHealth>;
    close(): Promise<void>;
}
export declare const db: DatabaseManager;
export {};
