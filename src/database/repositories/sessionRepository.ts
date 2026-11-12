import { db } from '../db';
import crypto from 'crypto';

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

export class SessionRepository {
  public async createSession(data: {
    user_id: string;
    refreshToken: string;
    device_id?: string;
    ip_address?: string;
    user_agent?: string;
    expires_at: Date;
  }): Promise<PlayerSessionEntity> {
    const id = `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(data.refreshToken).digest('hex');

    const session: PlayerSessionEntity = {
      id,
      user_id: data.user_id,
      refresh_token_hash: hash,
      device_id: data.device_id,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      expires_at: data.expires_at,
      created_at: new Date(),
      revoked_at: null,
    };

    if (db.getIsFallback()) {
      db.memorySessions.set(hash, session);
      return session;
    }

    const res = await db.query(
      `INSERT INTO player_sessions (id, user_id, refresh_token_hash, device_id, ip_address, user_agent, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [session.id, session.user_id, session.refresh_token_hash, session.device_id, session.ip_address, session.user_agent, session.expires_at, session.created_at]
    );
    return res.rows[0];
  }

  public async findByRefreshToken(refreshToken: string): Promise<PlayerSessionEntity | null> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    if (db.getIsFallback()) {
      const sess = db.memorySessions.get(hash);
      if (sess && !sess.revoked_at && new Date(sess.expires_at) > new Date()) {
        return sess;
      }
      return null;
    }

    const res = await db.query(
      'SELECT * FROM player_sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()',
      [hash]
    );
    return res.rows[0] || null;
  }

  public async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    if (db.getIsFallback()) {
      const sess = db.memorySessions.get(hash);
      if (sess) {
        sess.revoked_at = new Date();
      }
      return;
    }

    await db.query('UPDATE player_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1', [hash]);
  }

  public async revokeAllForUser(userId: string): Promise<void> {
    if (db.getIsFallback()) {
      for (const sess of db.memorySessions.values()) {
        if (sess.user_id === userId) {
          sess.revoked_at = new Date();
        }
      }
      return;
    }

    await db.query('UPDATE player_sessions SET revoked_at = NOW() WHERE user_id = $1', [userId]);
  }
}

export const sessionRepository = new SessionRepository();
