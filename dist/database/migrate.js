"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
async function runMigrations() {
    const schemaPath = path_1.default.resolve(__dirname, 'schema.sql');
    if (!fs_1.default.existsSync(schemaPath)) {
        console.error('[Migrations] schema.sql not found at:', schemaPath);
        return false;
    }
    const sql = fs_1.default.readFileSync(schemaPath, 'utf8');
    try {
        await db_1.db.init();
        if (!db_1.db.getIsFallback()) {
            console.log('[Migrations] Applying PostgreSQL migrations from schema.sql...');
            await db_1.db.query(sql);
            console.log('✅ [Migrations] Database migrations completed successfully.');
            return true;
        }
        else {
            console.log('ℹ️ [Migrations] In-memory mode active: schema tables instantiated in memory.');
            return true;
        }
    }
    catch (err) {
        console.error('❌ [Migrations] Migration failed:', err.message);
        return false;
    }
}
if (require.main === module) {
    runMigrations().then((success) => {
        process.exit(success ? 0 : 1);
    });
}
