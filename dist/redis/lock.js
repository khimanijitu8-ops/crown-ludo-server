"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributedLock = void 0;
const redisClient_1 = require("./redisClient");
const crypto_1 = __importDefault(require("crypto"));
class DistributedLock {
    static async acquire(resource, ttlMs = 3000) {
        const lockId = crypto_1.default.randomBytes(8).toString('hex');
        const key = `lock:${resource}`;
        const existing = await redisClient_1.redis.get(key);
        if (existing) {
            return null;
        }
        await redisClient_1.redis.set(key, lockId, Math.ceil(ttlMs / 1000));
        return lockId;
    }
    static async release(resource, lockId) {
        const key = `lock:${resource}`;
        const current = await redisClient_1.redis.get(key);
        if (current === lockId) {
            await redisClient_1.redis.del(key);
            return true;
        }
        return false;
    }
}
exports.DistributedLock = DistributedLock;
