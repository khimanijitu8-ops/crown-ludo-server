export interface PlayerSessionEntity {
    id: string;
    user_id: string;
    refresh_token_hash: string;
    device_id?: string;
    ip_address?: string;
    user_agent?: string;
    expires_at: Date;
    created_at: Date;
    revoked_at?: Date | null;
}
export declare class SessionRepository {
    createSession(data: {
        user_id: string;
        refreshToken: string;
        device_id?: string;
        ip_address?: string;
        user_agent?: string;
        expires_at: Date;
    }): Promise<PlayerSessionEntity>;
    findByRefreshToken(refreshToken: string): Promise<PlayerSessionEntity | null>;
    revokeByRefreshToken(refreshToken: string): Promise<void>;
    revokeAllForUser(userId: string): Promise<void>;
}
export declare const sessionRepository: SessionRepository;
