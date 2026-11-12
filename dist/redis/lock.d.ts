export declare class DistributedLock {
    static acquire(resource: string, ttlMs?: number): Promise<string | null>;
    static release(resource: string, lockId: string): Promise<boolean>;
}
