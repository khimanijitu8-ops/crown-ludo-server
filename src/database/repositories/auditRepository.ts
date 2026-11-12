import { db } from '../db';

export class AuditRepository {
  public async log(data: {
    user_id?: string;
    action: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: any;
  }): Promise<void> {
    if (db.getIsFallback()) {
      db.memoryAuditLogs.push({
        ...data,
        id: db.memoryAuditLogs.length + 1,
        created_at: new Date(),
      });
      return;
    }

    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, ip_address, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [data.user_id || null, data.action, data.ip_address || null, data.user_agent || null, JSON.stringify(data.metadata || {})]
      );
    } catch (err: any) {
      console.warn('[AuditRepository] Failed to insert audit log:', err.message);
    }
  }
}

export const auditRepository = new AuditRepository();
