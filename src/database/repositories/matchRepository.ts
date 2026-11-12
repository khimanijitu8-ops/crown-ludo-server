import { db } from '../db';
import crypto from 'crypto';

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

export class MatchRepository {
  public async createRoom(data: {
    id?: string;
    room_code: string;
    host_user_id?: string;
    player_count?: number;
    is_private?: boolean;
  }): Promise<GameRoomEntity> {
    const id = data.id || `rm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const room: GameRoomEntity = {
      id,
      room_code: data.room_code,
      host_user_id: data.host_user_id,
      player_count: data.player_count || 2,
      is_private: data.is_private ?? true,
      status: 'LOBBY',
      created_at: new Date(),
      closed_at: null,
    };

    if (db.getIsFallback()) {
      db.memoryRooms.set(id, room);
      return room;
    }

    const res = await db.query(
      `INSERT INTO game_rooms (id, room_code, host_user_id, player_count, is_private, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [room.id, room.room_code, room.host_user_id, room.player_count, room.is_private, room.status, room.created_at]
    );
    return res.rows[0];
  }

  public async updateRoomStatus(roomId: string, status: GameRoomEntity['status']): Promise<void> {
    if (db.getIsFallback()) {
      const room = db.memoryRooms.get(roomId);
      if (room) {
        room.status = status;
        if (status === 'COMPLETED' || status === 'ABANDONED') {
          room.closed_at = new Date();
        }
      }
      return;
    }
    await db.query(
      'UPDATE game_rooms SET status = $1, closed_at = CASE WHEN $1 IN (\'COMPLETED\', \'ABANDONED\') THEN NOW() ELSE closed_at END WHERE id = $2',
      [status, roomId]
    );
  }

  public async createMatch(data: {
    id?: string;
    room_id?: string;
    mode?: string;
    player_count: number;
    players: { user_id?: string; player_color: string; seat_index: number; is_bot?: boolean }[];
  }): Promise<GameMatchEntity> {
    const id = data.id || `match_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const match: GameMatchEntity = {
      id,
      room_id: data.room_id,
      mode: data.mode || 'online_multiplayer',
      player_count: data.player_count,
      status: 'IN_PROGRESS',
      started_at: new Date(),
      ended_at: null,
      duration_seconds: 0,
    };

    if (db.getIsFallback()) {
      db.memoryMatches.set(id, match);
      db.memoryMatchPlayers.set(id, data.players);
      return match;
    }

    const res = await db.query(
      `INSERT INTO game_matches (id, room_id, mode, player_count, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [match.id, match.room_id, match.mode, match.player_count, match.status, match.started_at]
    );

    for (const p of data.players) {
      await db.query(
        `INSERT INTO match_players (match_id, user_id, player_color, seat_index, is_bot)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, p.user_id || null, p.player_color, p.seat_index, p.is_bot ?? false]
      );
    }

    return res.rows[0];
  }

  public async completeMatch(data: {
    match_id: string;
    winner_user_id?: string;
    winner_color: string;
    pot_amount?: number;
    final_state?: any;
    duration_seconds?: number;
    rankings?: { user_id?: string; player_color: string; finish_rank: number }[];
  }): Promise<void> {
    if (db.getIsFallback()) {
      const match = db.memoryMatches.get(data.match_id);
      if (match) {
        match.status = 'FINISHED';
        match.ended_at = new Date();
        match.duration_seconds = data.duration_seconds || 0;
      }
      db.memoryMatchResults.set(data.match_id, {
        match_id: data.match_id,
        winner_user_id: data.winner_user_id,
        winner_color: data.winner_color,
        pot_amount: data.pot_amount || 0,
        final_game_state: data.final_state,
        created_at: new Date(),
      });
      return;
    }

    await db.query(
      `UPDATE game_matches
       SET status = 'FINISHED', ended_at = NOW(), duration_seconds = $1
       WHERE id = $2`,
      [data.duration_seconds || 0, data.match_id]
    );

    await db.query(
      `INSERT INTO match_results (match_id, winner_user_id, winner_color, pot_amount, final_game_state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id) DO NOTHING`,
      [data.match_id, data.winner_user_id || null, data.winner_color, data.pot_amount || 0, JSON.stringify(data.final_state || {})]
    );

    if (data.rankings && data.rankings.length > 0) {
      for (const r of data.rankings) {
        await db.query(
          `UPDATE match_players
           SET finish_rank = $1
           WHERE match_id = $2 AND player_color = $3`,
          [r.finish_rank, data.match_id, r.player_color]
        );
      }
    }
  }

  public async getPlayerMatches(userId: string, limit: number = 20): Promise<any[]> {
    if (db.getIsFallback()) {
      return Array.from(db.memoryMatches.values()).slice(-limit);
    }
    const res = await db.query(
      `SELECT m.id, m.mode, m.player_count, m.status, m.started_at, m.ended_at, m.duration_seconds,
              mp.player_color, mp.finish_rank,
              mr.winner_color, mr.winner_user_id
       FROM game_matches m
       JOIN match_players mp ON mp.match_id = m.id
       LEFT JOIN match_results mr ON mr.match_id = m.id
       WHERE mp.user_id = $1
       ORDER BY m.started_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return res.rows;
  }
}

export const matchRepository = new MatchRepository();
