"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchRepository = exports.MatchRepository = void 0;
const db_1 = require("../db");
const crypto_1 = __importDefault(require("crypto"));
class MatchRepository {
    async createRoom(data) {
        const id = data.id || `rm_${Date.now()}_${crypto_1.default.randomBytes(3).toString('hex')}`;
        const room = {
            id,
            room_code: data.room_code,
            host_user_id: data.host_user_id,
            player_count: data.player_count || 2,
            is_private: data.is_private ?? true,
            status: 'LOBBY',
            created_at: new Date(),
            closed_at: null,
        };
        if (db_1.db.getIsFallback()) {
            db_1.db.memoryRooms.set(id, room);
            return room;
        }
        const res = await db_1.db.query(`INSERT INTO game_rooms (id, room_code, host_user_id, player_count, is_private, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`, [room.id, room.room_code, room.host_user_id, room.player_count, room.is_private, room.status, room.created_at]);
        return res.rows[0];
    }
    async updateRoomStatus(roomId, status) {
        if (db_1.db.getIsFallback()) {
            const room = db_1.db.memoryRooms.get(roomId);
            if (room) {
                room.status = status;
                if (status === 'COMPLETED' || status === 'ABANDONED') {
                    room.closed_at = new Date();
                }
            }
            return;
        }
        await db_1.db.query('UPDATE game_rooms SET status = $1, closed_at = CASE WHEN $1 IN (\'COMPLETED\', \'ABANDONED\') THEN NOW() ELSE closed_at END WHERE id = $2', [status, roomId]);
    }
    async createMatch(data) {
        const id = data.id || `match_${Date.now()}_${crypto_1.default.randomBytes(4).toString('hex')}`;
        const match = {
            id,
            room_id: data.room_id,
            mode: data.mode || 'online_multiplayer',
            player_count: data.player_count,
            status: 'IN_PROGRESS',
            started_at: new Date(),
            ended_at: null,
            duration_seconds: 0,
        };
        if (db_1.db.getIsFallback()) {
            db_1.db.memoryMatches.set(id, match);
            db_1.db.memoryMatchPlayers.set(id, data.players);
            return match;
        }
        const res = await db_1.db.query(`INSERT INTO game_matches (id, room_id, mode, player_count, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [match.id, match.room_id, match.mode, match.player_count, match.status, match.started_at]);
        for (const p of data.players) {
            await db_1.db.query(`INSERT INTO match_players (match_id, user_id, player_color, seat_index, is_bot)
         VALUES ($1, $2, $3, $4, $5)`, [id, p.user_id || null, p.player_color, p.seat_index, p.is_bot ?? false]);
        }
        return res.rows[0];
    }
    async completeMatch(data) {
        if (db_1.db.getIsFallback()) {
            const match = db_1.db.memoryMatches.get(data.match_id);
            if (match) {
                match.status = 'FINISHED';
                match.ended_at = new Date();
                match.duration_seconds = data.duration_seconds || 0;
            }
            db_1.db.memoryMatchResults.set(data.match_id, {
                match_id: data.match_id,
                winner_user_id: data.winner_user_id,
                winner_color: data.winner_color,
                pot_amount: data.pot_amount || 0,
                final_game_state: data.final_state,
                created_at: new Date(),
            });
            return;
        }
        await db_1.db.query(`UPDATE game_matches
       SET status = 'FINISHED', ended_at = NOW(), duration_seconds = $1
       WHERE id = $2`, [data.duration_seconds || 0, data.match_id]);
        await db_1.db.query(`INSERT INTO match_results (match_id, winner_user_id, winner_color, pot_amount, final_game_state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id) DO NOTHING`, [data.match_id, data.winner_user_id || null, data.winner_color, data.pot_amount || 0, JSON.stringify(data.final_state || {})]);
        if (data.rankings && data.rankings.length > 0) {
            for (const r of data.rankings) {
                await db_1.db.query(`UPDATE match_players
           SET finish_rank = $1
           WHERE match_id = $2 AND player_color = $3`, [r.finish_rank, data.match_id, r.player_color]);
            }
        }
    }
    async getPlayerMatches(userId, limit = 20) {
        if (db_1.db.getIsFallback()) {
            return Array.from(db_1.db.memoryMatches.values()).slice(-limit);
        }
        const res = await db_1.db.query(`SELECT m.id, m.mode, m.player_count, m.status, m.started_at, m.ended_at, m.duration_seconds,
              mp.player_color, mp.finish_rank,
              mr.winner_color, mr.winner_user_id
       FROM game_matches m
       JOIN match_players mp ON mp.match_id = m.id
       LEFT JOIN match_results mr ON mr.match_id = m.id
       WHERE mp.user_id = $1
       ORDER BY m.started_at DESC
       LIMIT $2`, [userId, limit]);
        return res.rows;
    }
}
exports.MatchRepository = MatchRepository;
exports.matchRepository = new MatchRepository();
