"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
class RedisManager {
    client = null;
    pubClient = null;
    subClient = null;
    isConnected = false;
    isFallback = false;
    // In-Memory Storage Fallback
    memoryStore = new Map();
    memorySets = new Map();
    memoryLists = new Map();
    memorySubscribers = new Map();
    constructor() {
        if (config_1.config.redisUrl) {
            try {
                this.client = new ioredis_1.default(config_1.config.redisUrl, {
                    maxRetriesPerRequest: 3,
                    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 2000)),
                    lazyConnect: true,
                });
                this.pubClient = new ioredis_1.default(config_1.config.redisUrl, { lazyConnect: true });
                this.subClient = new ioredis_1.default(config_1.config.redisUrl, { lazyConnect: true });
                this.client.on('error', (err) => {
                    console.warn('[RedisManager] Redis client error:', err.message);
                });
            }
            catch (err) {
                console.warn('[RedisManager] Redis init failed. Using in-memory fallback.');
                this.isFallback = true;
            }
        }
        else {
            this.isFallback = true;
        }
    }
    async init() {
        if (this.client && !this.isFallback) {
            try {
                await Promise.all([this.client.connect(), this.pubClient?.connect(), this.subClient?.connect()]);
                this.isConnected = true;
                if (config_1.config.logEnabled) {
                    console.log('✅ [RedisManager] Connected to Redis successfully.');
                }
            }
            catch (err) {
                console.warn(`⚠️ [RedisManager] Redis connection failed (${err.message}). Using resilient in-memory store.`);
                this.isConnected = false;
                this.isFallback = true;
            }
        }
        else {
            this.isFallback = true;
            if (config_1.config.logEnabled) {
                console.log('ℹ️ [RedisManager] Running with resilient in-memory Redis adapter (zero external dependencies).');
            }
        }
    }
    getIsFallback() {
        return this.isFallback;
    }
    async get(key) {
        if (this.client && !this.isFallback && this.isConnected) {
            return this.client.get(key);
        }
        return this.memoryStore.get(key) || null;
    }
    async set(key, value, ttlSeconds) {
        if (this.client && !this.isFallback && this.isConnected) {
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, value);
            }
            else {
                await this.client.set(key, value);
            }
            return;
        }
        this.memoryStore.set(key, value);
        if (ttlSeconds) {
            setTimeout(() => this.memoryStore.delete(key), ttlSeconds * 1000);
        }
    }
    async del(key) {
        if (this.client && !this.isFallback && this.isConnected) {
            await this.client.del(key);
            return;
        }
        this.memoryStore.delete(key);
        this.memorySets.delete(key);
        this.memoryLists.delete(key);
    }
    async publish(channel, message) {
        if (this.pubClient && !this.isFallback && this.isConnected) {
            await this.pubClient.publish(channel, message);
            return;
        }
        const handlers = this.memorySubscribers.get(channel);
        if (handlers) {
            handlers.forEach((fn) => {
                try {
                    fn(message);
                }
                catch (e) {
                    console.warn('[RedisManager] Memory pub/sub handler error:', e);
                }
            });
        }
    }
    async subscribe(channel, handler) {
        if (this.subClient && !this.isFallback && this.isConnected) {
            await this.subClient.subscribe(channel);
            this.subClient.on('message', (ch, msg) => {
                if (ch === channel)
                    handler(msg);
            });
            return;
        }
        let set = this.memorySubscribers.get(channel);
        if (!set) {
            set = new Set();
            this.memorySubscribers.set(channel, set);
        }
        set.add(handler);
    }
    async checkHealth() {
        if (this.client && !this.isFallback && this.isConnected) {
            const start = Date.now();
            try {
                await this.client.ping();
                return {
                    connected: true,
                    type: 'redis',
                    latencyMs: Date.now() - start,
                };
            }
            catch (err) {
                return {
                    connected: false,
                    type: 'redis',
                    error: err.message,
                };
            }
        }
        return {
            connected: true,
            type: 'in-memory-fallback',
            latencyMs: 0,
        };
    }
    async close() {
        if (this.client)
            await this.client.quit();
        if (this.pubClient)
            await this.pubClient.quit();
        if (this.subClient)
            await this.subClient.quit();
        this.isConnected = false;
    }
}
exports.redis = new RedisManager();
