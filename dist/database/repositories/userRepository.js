"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = exports.UserRepository = void 0;
const db_1 = require("../db");
const crypto_1 = __importDefault(require("crypto"));
class UserRepository {
    async findById(id) {
        if (db_1.db.getIsFallback()) {
            return db_1.db.memoryUsers.get(id) || null;
        }
        const res = await db_1.db.query('SELECT * FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
    }
    async findByUsername(username) {
        if (db_1.db.getIsFallback()) {
            for (const user of db_1.db.memoryUsers.values()) {
                if (user.username.toLowerCase() === username.toLowerCase())
                    return user;
            }
            return null;
        }
        const res = await db_1.db.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        return res.rows[0] || null;
    }
    async findByEmail(email) {
        if (db_1.db.getIsFallback()) {
            for (const user of db_1.db.memoryUsers.values()) {
                if (user.email && user.email.toLowerCase() === email.toLowerCase())
                    return user;
            }
            return null;
        }
        const res = await db_1.db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        return res.rows[0] || null;
    }
    async create(data) {
        const id = data.id || `u_${Date.now()}_${crypto_1.default.randomBytes(4).toString('hex')}`;
        const user = {
            id,
            username: data.username,
            email: data.email,
            password_hash: data.password_hash,
            is_guest: data.is_guest ?? false,
            status: 'ACTIVE',
            created_at: new Date(),
            updated_at: new Date(),
        };
        if (db_1.db.getIsFallback()) {
            db_1.db.memoryUsers.set(id, user);
            return user;
        }
        const res = await db_1.db.query(`INSERT INTO users (id, username, email, password_hash, is_guest, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [user.id, user.username, user.email, user.password_hash, user.is_guest, user.status, user.created_at, user.updated_at]);
        return res.rows[0];
    }
    async updateStatus(id, status) {
        if (db_1.db.getIsFallback()) {
            const u = db_1.db.memoryUsers.get(id);
            if (u) {
                u.status = status;
                u.updated_at = new Date();
            }
            return;
        }
        await db_1.db.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    }
}
exports.UserRepository = UserRepository;
exports.userRepository = new UserRepository();
