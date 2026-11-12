"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRepository = exports.AuditRepository = void 0;
const db_1 = require("../db");
class AuditRepository {
    async log(data) {
        if (db_1.db.getIsFallback()) {
            db_1.db.memoryAuditLogs.push({
                ...data,
                id: db_1.db.memoryAuditLogs.length + 1,
                created_at: new Date(),
            });
            return;
        }
        try {
            await db_1.db.query(`INSERT INTO audit_logs (user_id, action, ip_address, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5)`, [data.user_id || null, data.action, data.ip_address || null, data.user_agent || null, JSON.stringify(data.metadata || {})]);
        }
        catch (err) {
            console.warn('[AuditRepository] Failed to insert audit log:', err.message);
        }
    }
}
exports.AuditRepository = AuditRepository;
exports.auditRepository = new AuditRepository();
