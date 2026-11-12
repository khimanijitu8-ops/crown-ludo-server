export interface PlayerStatsEntity {
    user_id: string;
    total_games: number;
    total_wins: number;
    total_losses: number;
    win_rate: number;
    current_streak: number;
    best_streak: number;
    tokens_captured: number;
    tokens_lost: number;
    updated_at: Date;
}
export declare class StatsRepository {
    getByUserId(userId: string): Promise<PlayerStatsEntity>;
    recordMatchResult(userId: string, isWin: boolean, captured?: number, lost?: number): Promise<PlayerStatsEntity>;
    getLeaderboard(limit?: number): Promise<any[]>;
}
export declare const statsRepository: StatsRepository;
