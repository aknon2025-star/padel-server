// db/database.js
// SQLite database setup — single file, no external DB server needed.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "padel-club.db"));
db.pragma("journal_mode = WAL");

// ── SCHEMA ──────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player', -- 'player' | 'coach' | 'admin'
  level TEXT NOT NULL DEFAULT 'B',
  points INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  played INTEGER NOT NULL DEFAULT 0,
  photo_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS court_reservations (
  id TEXT PRIMARY KEY,
  court_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,        -- YYYY-MM-DD
  start_hour TEXT NOT NULL,  -- HH:MM
  duration_hours REAL NOT NULL,
  needs_partner INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (court_id) REFERENCES courts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS coach_reservations (
  id TEXT PRIMARY KEY,
  coach_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_hour TEXT NOT NULL,
  duration_hours REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (coach_id) REFERENCES users(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS free_players (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  hour TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', -- available | matched | cancelled
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  free_player_id TEXT,
  reservation_id TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL,      -- knockout | roundrobin | americano | mexicano | doubleelim
  level TEXT NOT NULL,       -- includes 'free' (open level)
  status TEXT NOT NULL DEFAULT 'setup', -- setup | draw | active | finished
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tournament_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  p1_name TEXT NOT NULL,
  p1_level TEXT NOT NULL,
  p1_user_id TEXT,
  p2_name TEXT NOT NULL,
  p2_level TEXT NOT NULL,
  p2_user_id TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  round_name TEXT,            -- e.g. 'quarter', 'semi', 'final', or round-robin round number
  position INTEGER NOT NULL,  -- index within the round, used to build the bracket tree
  team1_id TEXT,
  team2_id TEXT,
  score1 INTEGER,
  score2 INTEGER,
  winner_team_id TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  next_match_id TEXT,         -- which match the winner advances to (knockout only)
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS friendlies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  date TEXT NOT NULL,
  hour TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 4,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friendly_players (
  friendly_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (friendly_id, user_id)
);

CREATE TABLE IF NOT EXISTS king_interest (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Chat: short messages only, auto-pruned to keep storage tiny.
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'general', -- 'general' or a reservation-specific channel
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_court_res_date ON court_reservations(date);
CREATE INDEX IF NOT EXISTS idx_coach_res_date ON coach_reservations(date);
CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel, created_at);
`);

// ── SEED DATA (only runs once, if tables are empty) ──────────
const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
if (userCount === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password, name, role, level, points, wins, losses, played)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run("admin-1", "admin", "admin123", "مدیر باشگاه", "admin", "A", 0, 0, 0, 0);
  insertUser.run("u-ali", "ali", "1234", "علی رضایی", "player", "B", 1240, 18, 6, 24);
  insertUser.run("u-sara", "sara", "1234", "سارا احمدی", "player", "A-", 890, 14, 8, 22);
  insertUser.run("u-reza", "reza", "1234", "رضا کریمی", "coach", "A+", 2100, 42, 5, 47);
  insertUser.run("u-niloofar", "niloofar", "1234", "نیلوفر صادقی", "player", "C+", 450, 9, 12, 21);
  insertUser.run("u-mehdi", "mehdi", "1234", "مهدی نجفی", "coach", "A", 1800, 38, 7, 45);

  const insertCourt = db.prepare("INSERT INTO courts (id, name, name_en) VALUES (?, ?, ?)");
  insertCourt.run(1, "زمین ۱", "Court 1");
  insertCourt.run(2, "زمین ۲", "Court 2");
  insertCourt.run(3, "زمین ۳", "Court 3");

  console.log("✓ Database seeded with initial admin, demo users, and 3 courts.");
}

// ── CHAT AUTO-PRUNE ────────────────────────────────────────────
// Keep only the most recent N messages per channel so the DB file stays tiny.
const MAX_MESSAGES_PER_CHANNEL = 200;
function pruneChat() {
  const channels = db.prepare("SELECT DISTINCT channel FROM chat_messages").all();
  for (const { channel } of channels) {
    const count = db.prepare("SELECT COUNT(*) as c FROM chat_messages WHERE channel = ?").get(channel).c;
    if (count > MAX_MESSAGES_PER_CHANNEL) {
      db.prepare(`
        DELETE FROM chat_messages WHERE id IN (
          SELECT id FROM chat_messages WHERE channel = ?
          ORDER BY created_at ASC LIMIT ?
        )
      `).run(channel, count - MAX_MESSAGES_PER_CHANNEL);
    }
  }
}
// Run prune every 10 minutes
setInterval(pruneChat, 10 * 60 * 1000);

module.exports = { db, pruneChat };
