import { db } from '../db';

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

export class StatsRepository {
  public async getByUserId(userId: string): Promise<PlayerStatsEntity> {
    if (db.getIsFallback()) {
      let stats = db.memoryStats.get(userId);
      if (!stats) {
        stats = {
          user_id: userId,
          total_games: 0,
          total_wins: 0,
          total_losses: 0,
          win_rate: 0,
          current_streak: 0,
          best_streak: 0,
          tokens_captured: 0,
          tokens_lost: 0,
          updated_at: new Date(),
        };
        db.memoryStats.set(userId, stats);
      }
      return stats;
    }

    const res = await db.query('SELECT * FROM player_statistics WHERE user_id = $1', [userId]);
    if (res.rows[0]) {
      return {
        ...res.rows[0],
        win_rate: parseFloat(res.rows[0].win_rate || 0),
      };
    }

    // Initialize default row
    const init = await db.query(
      `INSERT INTO player_statistics (user_id, total_games, total_wins, total_losses, win_rate, current_streak, best_streak, tokens_captured, tokens_lost)
       VALUES ($1, 0, 0, 0, 0.00, 0, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [userId]
    );
    return init.rows[0] || {
      user_id: userId,
      total_games: 0,
      total_wins: 0,
      total_losses: 0,
      win_rate: 0,
      current_streak: 0,
      best_streak: 0,
      tokens_captured: 0,
      tokens_lost: 0,
      updated_at: new Date(),
    };
  }

  public async recordMatchResult(userId: string, isWin: boolean, captured: number = 0, lost: number = 0): Promise<PlayerStatsEntity> {
    const stats = await this.getByUserId(userId);
    const total_games = stats.total_games + 1;
    const total_wins = stats.total_wins + (isWin ? 1 : 0);
    const total_losses = stats.total_losses + (isWin ? 0 : 1);
    const win_rate = total_games > 0 ? parseFloat(((total_wins / total_games) * 100).toFixed(2)) : 0;
    const current_streak = isWin ? stats.current_streak + 1 : 0;
    const best_streak = Math.max(stats.best_streak, current_streak);
    const tokens_captured = stats.tokens_captured + captured;
    const tokens_lost = stats.tokens_lost + lost;

    if (db.getIsFallback()) {
      const updated: PlayerStatsEntity = {
        user_id: userId,
        total_games,
        total_wins,
        total_losses,
        win_rate,
        current_streak,
        best_streak,
        tokens_captured,
        tokens_lost,
        updated_at: new Date(),
      };
      db.memoryStats.set(userId, updated);
      return updated;
    }

    const res = await db.query(
      `INSERT INTO player_statistics (user_id, total_games, total_wins, total_losses, win_rate, current_streak, best_streak, tokens_captured, tokens_lost, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         total_games = EXCLUDED.total_games,
         total_wins = EXCLUDED.total_wins,
         total_losses = EXCLUDED.total_losses,
         win_rate = EXCLUDED.win_rate,
         current_streak = EXCLUDED.current_streak,
         best_streak = EXCLUDED.best_streak,
         tokens_captured = EXCLUDED.tokens_captured,
         tokens_lost = EXCLUDED.tokens_lost,
         updated_at = NOW()
       RETURNING *`,
      [userId, total_games, total_wins, total_losses, win_rate, current_streak, best_streak, tokens_captured, tokens_lost]
    );

    // Also update global leaderboard entry
    await db.query(
      `INSERT INTO leaderboards (user_id, category, period, score, updated_at)
       VALUES ($1, 'GLOBAL_WINS', 'ALL_TIME', $2, NOW())
       ON CONFLICT (user_id, category, period) DO UPDATE SET
         score = EXCLUDED.score,
         updated_at = NOW()`,
      [userId, total_wins]
    );

    return {
      ...res.rows[0],
      win_rate: parseFloat(res.rows[0].win_rate || 0),
    };
  }

  public async getLeaderboard(limit: number = 20): Promise<any[]> {
    if (db.getIsFallback()) {
      const all = Array.from(db.memoryStats.values()).sort((a, b) => b.total_wins - a.total_wins).slice(0, limit);
      return all.map((s, idx) => ({
        rank: idx + 1,
        user_id: s.user_id,
        display_name: db.memoryProfiles.get(s.user_id)?.display_name || s.user_id,
        avatar_emoji: db.memoryProfiles.get(s.user_id)?.avatar_emoji || '👑',
        total_wins: s.total_wins,
        total_games: s.total_games,
        win_rate: s.win_rate,
      }));
    }

    const res = await db.query(
      `SELECT s.user_id, s.total_wins, s.total_games, s.win_rate,
              p.display_name, p.avatar_id, p.avatar_emoji, p.level
       FROM player_statistics s
       JOIN player_profiles p ON p.user_id = s.user_id
       ORDER BY s.total_wins DESC, s.win_rate DESC
       LIMIT $1`,
      [limit]
    );

    return res.rows.map((row: any, idx: number) => ({
      rank: idx + 1,
      ...row,
      win_rate: parseFloat(row.win_rate || 0),
    }));
  }
}

export const statsRepository = new StatsRepository();
