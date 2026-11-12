"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRepository = exports.ProfileRepository = void 0;
const db_1 = require("../db");
class ProfileRepository {
    async getByUserId(userId) {
        if (db_1.db.getIsFallback()) {
            return db_1.db.memoryProfiles.get(userId) || null;
        }
        const res = await db_1.db.query('SELECT * FROM player_profiles WHERE user_id = $1', [userId]);
        return res.rows[0] || null;
    }
    async upsert(data) {
        const profile = {
            user_id: data.user_id,
            display_name: data.display_name,
            avatar_id: data.avatar_id || 'avatar_1',
            avatar_emoji: data.avatar_emoji || '👑',
            level: data.level || 1,
            xp: data.xp || 0,
            coins: data.coins !== undefined ? data.coins : 1000,
            country_code: data.country_code || 'IN',
            created_at: new Date(),
            updated_at: new Date(),
        };
        if (db_1.db.getIsFallback()) {
            const existing = db_1.db.memoryProfiles.get(data.user_id);
            if (existing) {
                Object.assign(existing, profile, { updated_at: new Date() });
                return existing;
            }
            db_1.db.memoryProfiles.set(data.user_id, profile);
            return profile;
        }
        const res = await db_1.db.query(`INSERT INTO player_profiles (user_id, display_name, avatar_id, avatar_emoji, level, xp, coins, country_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         avatar_id = EXCLUDED.avatar_id,
         avatar_emoji = EXCLUDED.avatar_emoji,
         level = EXCLUDED.level,
         xp = EXCLUDED.xp,
         coins = EXCLUDED.coins,
         updated_at = NOW()
       RETURNING *`, [
            profile.user_id,
            profile.display_name,
            profile.avatar_id,
            profile.avatar_emoji,
            profile.level,
            profile.xp,
            profile.coins,
            profile.country_code,
            profile.created_at,
            profile.updated_at,
        ]);
        return res.rows[0];
    }
    async addCoins(userId, amount) {
        if (db_1.db.getIsFallback()) {
            const profile = db_1.db.memoryProfiles.get(userId);
            if (profile) {
                profile.coins += amount;
                return profile.coins;
            }
            return 0;
        }
        const res = await db_1.db.query('UPDATE player_profiles SET coins = coins + $1, updated_at = NOW() WHERE user_id = $2 RETURNING coins', [amount, userId]);
        return res.rows[0]?.coins || 0;
    }
}
exports.ProfileRepository = ProfileRepository;
exports.profileRepository = new ProfileRepository();
