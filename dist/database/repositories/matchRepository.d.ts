export interface GameRoomEntity {
    id: string;
    room_code: string;
    host_user_id?: string;
    player_count: number;
    is_private: boolean;
    status: 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
    created_at: Date;
    closed_at?: Date | null;
}
export interface GameMatchEntity {
    id: string;
    room_id?: string;
    mode: string;
    player_count: number;
    status: 'IN_PROGRESS' | 'FINISHED' | 'ABORTED';
    started_at: Date;
    ended_at?: Date | null;
    duration_seconds: number;
}
export declare class MatchRepository {
    createRoom(data: {
        id?: string;
        room_code: string;
        host_user_id?: string;
        player_count?: number;
        is_private?: boolean;
    }): Promise<GameRoomEntity>;
    updateRoomStatus(roomId: string, status: GameRoomEntity['status']): Promise<void>;
    createMatch(data: {
        id?: string;
        room_id?: string;
        mode?: string;
        player_count: number;
        players: {
            user_id?: string;
            player_color: string;
            seat_index: number;
            is_bot?: boolean;
        }[];
    }): Promise<GameMatchEntity>;
    completeMatch(data: {
        match_id: string;
        winner_user_id?: string;
        winner_color: string;
        pot_amount?: number;
        final_state?: any;
        duration_seconds?: number;
        rankings?: {
            user_id?: string;
            player_color: string;
            finish_rank: number;
        }[];
    }): Promise<void>;
    getPlayerMatches(userId: string, limit?: number): Promise<any[]>;
}
export declare const matchRepository: MatchRepository;
