import Redis from 'ioredis';
import { config } from '../config';

export interface RedisHealth {
  connected: boolean;
  type: 'redis' | 'in-memory-fallback';
  latencyMs?: number;
  error?: string;
}

class RedisManager {
  private client: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private isConnected: boolean = false;
  private isFallback: boolean = false;

  // In-Memory Storage Fallback
  public memoryStore = new Map<string, string>();
  public memorySets = new Map<string, Set<string>>();
  public memoryLists = new Map<string, string[]>();
  public memorySubscribers = new Map<string, Set<(message: string) => void>>();

  constructor() {
    if (config.redisUrl) {
      try {
        this.client = new Redis(config.redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 2000)),
          lazyConnect: true,
        });

        this.pubClient = new Redis(config.redisUrl, { lazyConnect: true });
        this.subClient = new Redis(config.redisUrl, { lazyConnect: true });

        this.client.on('error', (err) => {
          console.warn('[RedisManager] Redis client error:', err.message);
        });
      } catch (err: any) {
        console.warn('[RedisManager] Redis init failed. Using in-memory fallback.');
        this.isFallback = true;
      }
    } else {
      this.isFallback = true;
    }
  }

  public async init(): Promise<void> {
    if (this.client && !this.isFallback) {
      try {
        await Promise.all([this.client.connect(), this.pubClient?.connect(), this.subClient?.connect()]);
        this.isConnected = true;
        if (config.logEnabled) {
          console.log('✅ [RedisManager] Connected to Redis successfully.');
        }
      } catch (err: any) {
        console.warn(`⚠️ [RedisManager] Redis connection failed (${err.message}). Using resilient in-memory store.`);
        this.isConnected = false;
        this.isFallback = true;
      }
    } else {
      this.isFallback = true;
      if (config.logEnabled) {
        console.log('ℹ️ [RedisManager] Running with resilient in-memory Redis adapter (zero external dependencies).');
      }
    }
  }

  public getIsFallback(): boolean {
    return this.isFallback;
  }

  public async get(key: string): Promise<string | null> {
    if (this.client && !this.isFallback && this.isConnected) {
      return this.client.get(key);
    }
    return this.memoryStore.get(key) || null;
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client && !this.isFallback && this.isConnected) {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return;
    }
    this.memoryStore.set(key, value);
    if (ttlSeconds) {
      setTimeout(() => this.memoryStore.delete(key), ttlSeconds * 1000);
    }
  }

  public async del(key: string): Promise<void> {
    if (this.client && !this.isFallback && this.isConnected) {
      await this.client.del(key);
      return;
    }
    this.memoryStore.delete(key);
    this.memorySets.delete(key);
    this.memoryLists.delete(key);
  }

  public async publish(channel: string, message: string): Promise<void> {
    if (this.pubClient && !this.isFallback && this.isConnected) {
      await this.pubClient.publish(channel, message);
      return;
    }
    const handlers = this.memorySubscribers.get(channel);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(message);
        } catch (e) {
          console.warn('[RedisManager] Memory pub/sub handler error:', e);
        }
      });
    }
  }

  public async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    if (this.subClient && !this.isFallback && this.isConnected) {
      await this.subClient.subscribe(channel);
      this.subClient.on('message', (ch, msg) => {
        if (ch === channel) handler(msg);
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

  public async checkHealth(): Promise<RedisHealth> {
    if (this.client && !this.isFallback && this.isConnected) {
      const start = Date.now();
      try {
        await this.client.ping();
        return {
          connected: true,
          type: 'redis',
          latencyMs: Date.now() - start,
        };
      } catch (err: any) {
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

  public async close(): Promise<void> {
    if (this.client) await this.client.quit();
    if (this.pubClient) await this.pubClient.quit();
    if (this.subClient) await this.subClient.quit();
    this.isConnected = false;
  }
}

export const redis = new RedisManager();
