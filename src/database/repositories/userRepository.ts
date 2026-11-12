import { db } from '../db';
import crypto from 'crypto';

export interface UserEntity {
  id: string;
  username: string;
  email?: string;
  password_hash?: string;
  is_guest: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  created_at: Date;
  updated_at: Date;
}

export class UserRepository {
  public async findById(id: string): Promise<UserEntity | null> {
    if (db.getIsFallback()) {
      return db.memoryUsers.get(id) || null;
    }
    const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  public async findByUsername(username: string): Promise<UserEntity | null> {
    if (db.getIsFallback()) {
      for (const user of db.memoryUsers.values()) {
        if (user.username.toLowerCase() === username.toLowerCase()) return user;
      }
      return null;
    }
    const res = await db.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    return res.rows[0] || null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    if (db.getIsFallback()) {
      for (const user of db.memoryUsers.values()) {
        if (user.email && user.email.toLowerCase() === email.toLowerCase()) return user;
      }
      return null;
    }
    const res = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return res.rows[0] || null;
  }

  public async create(data: {
    id?: string;
    username: string;
    email?: string;
    password_hash?: string;
    is_guest?: boolean;
  }): Promise<UserEntity> {
    const id = data.id || `u_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const user: UserEntity = {
      id,
      username: data.username,
      email: data.email,
      password_hash: data.password_hash,
      is_guest: data.is_guest ?? false,
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (db.getIsFallback()) {
      db.memoryUsers.set(id, user);
      return user;
    }

    const res = await db.query(
      `INSERT INTO users (id, username, email, password_hash, is_guest, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [user.id, user.username, user.email, user.password_hash, user.is_guest, user.status, user.created_at, user.updated_at]
    );
    return res.rows[0];
  }

  public async updateStatus(id: string, status: UserEntity['status']): Promise<void> {
    if (db.getIsFallback()) {
      const u = db.memoryUsers.get(id);
      if (u) {
        u.status = status;
        u.updated_at = new Date();
      }
      return;
    }
    await db.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
  }
}

export const userRepository = new UserRepository();
