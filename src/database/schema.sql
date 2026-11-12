-- ==============================================================================
-- 👑 ROYAL LUDO 3D — PRODUCTION DATABASE SCHEMA (PostgreSQL)
-- ==============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(48) UNIQUE NOT NULL,
    email VARCHAR(128) UNIQUE,
    password_hash VARCHAR(255),
    is_guest BOOLEAN DEFAULT FALSE,
    status VARCHAR(24) DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, BANNED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2. PLAYER PROFILES TABLE
CREATE TABLE IF NOT EXISTS player_profiles (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(48) NOT NULL,
    avatar_id VARCHAR(32) DEFAULT 'avatar_1',
    avatar_emoji VARCHAR(8) DEFAULT '👑',
    level INT DEFAULT 1,
    xp BIGINT DEFAULT 0,
    coins BIGINT DEFAULT 1000,
    country_code VARCHAR(4) DEFAULT 'IN',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_display_name ON player_profiles(display_name);

-- 3. PLAYER SESSIONS TABLE (Refresh Tokens & Multi-device)
CREATE TABLE IF NOT EXISTS player_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_id VARCHAR(128),
    ip_address VARCHAR(48),
    user_agent VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_player_sessions_user_id ON player_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_refresh_token_hash ON player_sessions(refresh_token_hash);

-- 4. GAME ROOMS TABLE
CREATE TABLE IF NOT EXISTS game_rooms (
    id VARCHAR(64) PRIMARY KEY,
    room_code VARCHAR(16) UNIQUE NOT NULL,
    host_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    player_count INT DEFAULT 2, -- 2, 3, 4
    is_private BOOLEAN DEFAULT TRUE,
    status VARCHAR(24) DEFAULT 'LOBBY', -- LOBBY, ACTIVE, COMPLETED, ABANDONED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON game_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);

-- 5. GAME MATCHES TABLE
CREATE TABLE IF NOT EXISTS game_matches (
    id VARCHAR(64) PRIMARY KEY,
    room_id VARCHAR(64) REFERENCES game_rooms(id) ON DELETE SET NULL,
    mode VARCHAR(32) DEFAULT 'online_multiplayer',
    player_count INT NOT NULL,
    status VARCHAR(24) DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, FINISHED, ABORTED
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    duration_seconds INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_game_matches_room_id ON game_matches(room_id);
CREATE INDEX IF NOT EXISTS idx_game_matches_status ON game_matches(status);

-- 6. MATCH PLAYERS TABLE
CREATE TABLE IF NOT EXISTS match_players (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(64) NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    player_color VARCHAR(16) NOT NULL, -- red, green, yellow, blue
    seat_index INT NOT NULL,
    finish_rank INT DEFAULT 0, -- 1st, 2nd, 3rd, 4th (0 = unfinished)
    is_bot BOOLEAN DEFAULT FALSE,
    score INT DEFAULT 0,
    disconnected_at TIMESTAMPTZ,
    reconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);

-- 7. MATCH RESULTS TABLE
CREATE TABLE IF NOT EXISTS match_results (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(64) UNIQUE NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
    winner_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    winner_color VARCHAR(16) NOT NULL,
    pot_amount BIGINT DEFAULT 0,
    final_game_state JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_results_winner_user_id ON match_results(winner_user_id);

-- 8. PLAYER STATISTICS TABLE
CREATE TABLE IF NOT EXISTS player_statistics (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_games INT DEFAULT 0,
    total_wins INT DEFAULT 0,
    total_losses INT DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0.00,
    current_streak INT DEFAULT 0,
    best_streak INT DEFAULT 0,
    tokens_captured INT DEFAULT 0,
    tokens_lost INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. LEADERBOARDS TABLE
CREATE TABLE IF NOT EXISTS leaderboards (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(32) DEFAULT 'GLOBAL_WINS', -- GLOBAL_WINS, WEEKLY_WINS, MONTHLY_WINS
    period VARCHAR(16) DEFAULT 'ALL_TIME', -- ALL_TIME, WEEKLY, MONTHLY
    score BIGINT DEFAULT 0,
    rank INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category, period)
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_category_score ON leaderboards(category, period, score DESC);

-- 10. REWARDS TABLE
CREATE TABLE IF NOT EXISTS rewards (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_type VARCHAR(32) NOT NULL, -- DAILY_LOGIN, WIN_BONUS, LEVEL_UP, ACHIEVEMENT
    amount BIGINT NOT NULL,
    reason VARCHAR(128),
    claimed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rewards_user_id ON rewards(user_id);

-- 11. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    ip_address VARCHAR(48),
    user_agent VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
