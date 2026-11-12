export interface PlayerProfileEntity {
    user_id: string;
    display_name: string;
    avatar_id: string;
    avatar_emoji: string;
    level: number;
    xp: number;
    coins: number;
    country_code: string;
    created_at: Date;
    updated_at: Date;
}
export declare class ProfileRepository {
    getByUserId(userId: string): Promise<PlayerProfileEntity | null>;
    upsert(data: {
        user_id: string;
        display_name: string;
        avatar_id?: string;
        avatar_emoji?: string;
        level?: number;
        xp?: number;
        coins?: number;
        country_code?: string;
    }): Promise<PlayerProfileEntity>;
    addCoins(userId: string, amount: number): Promise<number>;
}
export declare const profileRepository: ProfileRepository;
