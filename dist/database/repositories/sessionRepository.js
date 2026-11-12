"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRepository = exports.SessionRepository = void 0;
const db_1 = require("../db");
const crypto_1 = __importDefault(require("crypto"));
class SessionRepository {
    async createSession(data) {
        const id = `sess_${Date.now()}_${crypto_1.default.randomBytes(4).toString('hex')}`;
        const hash = crypto_1.default.createHash('sha256').update(data.refreshToken).digest('hex');
        const session = {
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
        if (db_1.db.getIsFallback()) {
            db_1.db.memorySessions.set(hash, session);
            return session;
        }
        const res = await db_1.db.query(`INSERT INTO player_sessions (id, user_id, refresh_token_hash, device_id, ip_address, user_agent, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [session.id, session.user_id, session.refresh_token_hash, session.device_id, session.ip_address, session.user_agent, session.expires_at, session.created_at]);
        return res.rows[0];
    }
    async findByRefreshToken(refreshToken) {
        const hash = crypto_1.default.createHash('sha256').update(refreshToken).digest('hex');
        if (db_1.db.getIsFallback()) {
            const sess = db_1.db.memorySessions.get(hash);
            if (sess && !sess.revoked_at && new Date(sess.expires_at) > new Date()) {
                return sess;
            }
            return null;
        }
        const res = await db_1.db.query('SELECT * FROM player_sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()', [hash]);
        return res.rows[0] || null;
    }
    async revokeByRefreshToken(refreshToken) {
        const hash = crypto_1.default.createHash('sha256').update(refreshToken).digest('hex');
        if (db_1.db.getIsFallback()) {
            const sess = db_1.db.memorySessions.get(hash);
            if (sess) {
                sess.revoked_at = new Date();
            }
            return;
        }
        await db_1.db.query('UPDATE player_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1', [hash]);
    }
    async revokeAllForUser(userId) {
        if (db_1.db.getIsFallback()) {
            for (const sess of db_1.db.memorySessions.values()) {
                if (sess.user_id === userId) {
                    sess.revoked_at = new Date();
                }
            }
            return;
        }
        await db_1.db.query('UPDATE player_sessions SET revoked_at = NOW() WHERE user_id = $1', [userId]);
    }
}
exports.SessionRepository = SessionRepository;
exports.sessionRepository = new SessionRepository();
