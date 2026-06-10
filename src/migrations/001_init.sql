-- Users
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user',
  is_active   INTEGER NOT NULL DEFAULT 1,
  balance     REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mining stats
CREATE TABLE IF NOT EXISTS mining_stats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hashrate_mhs  REAL NOT NULL DEFAULT 0,
  temperature   INTEGER NOT NULL DEFAULT 0,
  shares_ok     INTEGER NOT NULL DEFAULT 0,
  power_draw    REAL NOT NULL DEFAULT 0,
  recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stats_user_time ON mining_stats(user_id, recorded_at DESC);

-- Pool sozlamalari
CREATE TABLE IF NOT EXISTS pool_config (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  pool_url   TEXT NOT NULL,
  wallet     TEXT NOT NULL,
  password   TEXT NOT NULL DEFAULT 'x',
  fee_pct    REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- To'lovlar
CREATE TABLE IF NOT EXISTS payouts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      REAL NOT NULL,
  tx_hash     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
