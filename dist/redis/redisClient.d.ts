export interface RedisHealth {
    connected: boolean;
    type: 'redis' | 'in-memory-fallback';
    latencyMs?: number;
    error?: string;
}
declare class RedisManager {
    private client;
    private pubClient;
    private subClient;
    private isConnected;
    private isFallback;
    memoryStore: Map<string, string>;
    memorySets: Map<string, Set<string>>;
    memoryLists: Map<string, string[]>;
    memorySubscribers: Map<string, Set<(message: string) => void>>;
    constructor();
    init(): Promise<void>;
    getIsFallback(): boolean;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    publish(channel: string, message: string): Promise<void>;
    subscribe(channel: string, handler: (message: string) => void): Promise<void>;
    checkHealth(): Promise<RedisHealth>;
    close(): Promise<void>;
}
export declare const redis: RedisManager;
export {};
