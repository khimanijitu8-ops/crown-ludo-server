import { redis } from './redisClient';
import crypto from 'crypto';

export class DistributedLock {
  public static async acquire(resource: string, ttlMs: number = 3000): Promise<string | null> {
    const lockId = crypto.randomBytes(8).toString('hex');
    const key = `lock:${resource}`;

    const existing = await redis.get(key);
    if (existing) {
      return null;
    }

    await redis.set(key, lockId, Math.ceil(ttlMs / 1000));
    return lockId;
  }

  public static async release(resource: string, lockId: string): Promise<boolean> {
    const key = `lock:${resource}`;
    const current = await redis.get(key);
    if (current === lockId) {
      await redis.del(key);
      return true;
    }
    return false;
  }
}
