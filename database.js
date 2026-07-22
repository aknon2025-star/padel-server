// database.js
// Main SQLite database setup.
// This project uses one shared SQLite database.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");


// ─────────────────────────────────────────────────────────────
// DATABASE CONNECTION
// ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });
}

const DATABASE_PATH = path.join(
  DATA_DIR,
  "padel-club.db"
);

const db = new Database(DATABASE_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");


// ─────────────────────────────────────────────────────────────
// DATABASE SCHEMA
// ─────────────────────────────────────────────────────────────

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
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
  name_en TEXT NOT NULL DEFAULT '',
  club_id TEXT,
  club_name TEXT,
  capacity INTEGER NOT NULL DEFAULT 4,
  type TEXT NOT NULL DEFAULT 'Padel',
  is_indoor INTEGER NOT NULL DEFAULT 1,
  location TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS court_reservations (
  id TEXT PRIMARY KEY,
  court_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_hour TEXT NOT NULL,
  duration_hours REAL NOT NULL,
  needs_partner INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (court_id)
    REFERENCES courts(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS coach_reservations (
  id TEXT PRIMARY KEY,
  coach_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_hour TEXT NOT NULL,
  duration_hours REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (coach_id)
    REFERENCES users(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS free_players (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  hour TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  free_player_id TEXT,
  reservation_id TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'setup',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by)
    REFERENCES users(id)
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

  FOREIGN KEY (tournament_id)
    REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  round_name TEXT,
  position INTEGER NOT NULL,
  team1_id TEXT,
  team2_id TEXT,
  score1 INTEGER,
  score2 INTEGER,
  winner_team_id TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  next_match_id TEXT,

  FOREIGN KEY (tournament_id)
    REFERENCES tournaments(id)
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

  PRIMARY KEY (
    friendly_id,
    user_id
  )
);

CREATE TABLE IF NOT EXISTS king_interest (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'general',
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_court_res_date
ON court_reservations(date);

CREATE INDEX IF NOT EXISTS idx_coach_res_date
ON coach_reservations(date);

CREATE INDEX IF NOT EXISTS idx_chat_channel
ON chat_messages(channel, created_at);
`);


// ─────────────────────────────────────────────────────────────
// COURTS TABLE MIGRATION
// Adds missing columns to older Railway databases.
// ─────────────────────────────────────────────────────────────

function getCourtColumnNames() {
  return db
    .prepare("PRAGMA table_info(courts)")
    .all()
    .map((column) => column.name);
}

function addCourtColumnIfMissing(
  columnName,
  columnDefinition
) {
  const columns = getCourtColumnNames();

  if (columns.includes(columnName)) {
    return;
  }

  db.exec(`
    ALTER TABLE courts
    ADD COLUMN ${columnName} ${columnDefinition}
  `);

  console.log(
    `✓ Added missing column: courts.${columnName}`
  );
}

addCourtColumnIfMissing(
  "name_en",
  "TEXT NOT NULL DEFAULT ''"
);

addCourtColumnIfMissing(
  "club_id",
  "TEXT"
);

addCourtColumnIfMissing(
  "club_name",
  "TEXT"
);

addCourtColumnIfMissing(
  "capacity",
  "INTEGER NOT NULL DEFAULT 4"
);

addCourtColumnIfMissing(
  "type",
  "TEXT NOT NULL DEFAULT 'Padel'"
);

addCourtColumnIfMissing(
  "is_indoor",
  "INTEGER NOT NULL DEFAULT 1"
);

addCourtColumnIfMissing(
  "location",
  "TEXT"
);

addCourtColumnIfMissing(
  "price",
  "INTEGER NOT NULL DEFAULT 0"
);

addCourtColumnIfMissing(
  "notes",
  "TEXT"
);


// ─────────────────────────────────────────────────────────────
// INITIAL USERS
// ─────────────────────────────────────────────────────────────

const userCount = db
  .prepare(`
    SELECT COUNT(*) AS count
    FROM users
  `)
  .get()
  .count;

if (userCount === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (
      id,
      username,
      password,
      name,
      role,
      level,
      points,
      wins,
      losses,
      played
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedUsers = db.transaction(() => {
    insertUser.run(
      "admin-1",
      "admin",
      "admin123",
      "مدیر باشگاه",
      "admin",
      "A",
      0,
      0,
      0,
      0
    );

    insertUser.run(
      "u-ali",
      "ali",
      "1234",
      "علی رضایی",
      "player",
      "B",
      1240,
      18,
      6,
      24
    );

    insertUser.run(
      "u-sara",
      "sara",
      "1234",
      "سارا احمدی",
      "player",
      "A-",
      890,
      14,
      8,
      22
    );

    insertUser.run(
      "u-reza",
      "reza",
      "1234",
      "رضا کریمی",
      "coach",
      "A+",
      2100,
      42,
      5,
      47
    );

    insertUser.run(
      "u-niloofar",
      "niloofar",
      "1234",
      "نیلوفر صادقی",
      "player",
      "C+",
      450,
      9,
      12,
      21
    );

    insertUser.run(
      "u-mehdi",
      "mehdi",
      "1234",
      "مهدی نجفی",
      "coach",
      "A",
      1800,
      38,
      7,
      45
    );
  });

  seedUsers();

  console.log(
    "✓ Initial users seeded successfully."
  );
}


// ─────────────────────────────────────────────────────────────
// COURTS SEED AND UPDATE
//
// ON CONFLICT updates existing Railway records.
// Therefore old values such as "اصفهان" become "کاشان".
// ─────────────────────────────────────────────────────────────

const upsertCourt = db.prepare(`
  INSERT INTO courts (
    id,
    name,
    name_en,
    club_id,
    club_name,
    capacity,
    type,
    is_indoor,
    location,
    price,
    notes
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    name_en = excluded.name_en,
    club_id = excluded.club_id,
    club_name = excluded.club_name,
    capacity = excluded.capacity,
    type = excluded.type,
    is_indoor = excluded.is_indoor,
    location = excluded.location,
    price = excluded.price,
    notes = excluded.notes
`);

const seedCourts = db.transaction(() => {
  // ── مجموعه ورزشی نگارستان ────────────────────────────────

  upsertCourt.run(
    1,
    "زمین پدل ۱",
    "Padel Court 1",
    "negarestan",
    "باشگاه پدل نگارستان",
    4,
    "Padel",
    1,
    "کاشان",
    0,
    null
  );

  upsertCourt.run(
    2,
    "زمین پدل ۲",
    "Padel Court 2",
    "negarestan",
    "باشگاه پدل نگارستان",
    4,
    "Padel",
    1,
    "کاشان",
    0,
    null
  );

  upsertCourt.run(
    3,
    "زمین پدل ۳",
    "Padel Court 3",
    "negarestan",
    "باشگاه پدل نگارستان",
    4,
    "Padel",
    1,
    "کاشان",
    0,
    null
  );

  upsertCourt.run(
    4,
    "زمین تنیس",
    "Tennis Court",
    "negarestan",
    "باشگاه پدل نگارستان",
    4,
    "Tennis",
    1,
    "کاشان",
    0,
    null
  );


  // ── باشگاه پدل پوینت ─────────────────────────────────────

  upsertCourt.run(
    5,
    "زمین پدل ۱",
    "Padel Court 1",
    "padelpoint",
    "باشگاه پدل پوینت",
    4,
    "Padel",
    1,
    "کاشان",
    0,
    null
  );

  upsertCourt.run(
    6,
    "زمین پدل ۲",
    "Padel Court 2",
    "padelpoint",
    "باشگاه پدل پوینت",
    4,
    "Padel",
    1,
    "کاشان",
    0,
    null
  );


  // ── باشگاه تیک پدل ───────────────────────────────────────

  upsertCourt.run(
    7,
    "زمین پدل ۱",
    "Padel Court 1",
    "tikpadel",
    "باشگاه تیک پدل",
    4,
    "Padel",
    1,
    "کاشان",
    0,
    null
  );
});

seedCourts();


// یک به‌روزرسانی مستقیم اضافه برای اطمینان از اصلاح
// رکوردهای قدیمی دیتابیس Railway.

const locationUpdateResult = db
  .prepare(`
    UPDATE courts
    SET location = ?
    WHERE location IS NULL
       OR location = ''
       OR location = 'اصفهان'
       OR location != ?
  `)
  .run(
    "کاشان",
    "کاشان"
  );

console.log(
  `✓ Courts seeded or updated successfully.`
);

console.log(
  `✓ Court locations updated to Kashan: ${locationUpdateResult.changes} record(s).`
);


// ─────────────────────────────────────────────────────────────
// DATABASE VERIFICATION LOG
// ─────────────────────────────────────────────────────────────

const courtSummary = db
  .prepare(`
    SELECT
      COUNT(*) AS total_courts,
      COUNT(DISTINCT club_id) AS total_clubs
    FROM courts
  `)
  .get();

console.log(
  `✓ Database ready: ${courtSummary.total_courts} courts, ${courtSummary.total_clubs} clubs.`
);


// ─────────────────────────────────────────────────────────────
// CHAT AUTO-PRUNE
// ─────────────────────────────────────────────────────────────

const MAX_MESSAGES_PER_CHANNEL = 200;

function pruneChat() {
  const channels = db
    .prepare(`
      SELECT DISTINCT channel
      FROM chat_messages
    `)
    .all();

  for (const { channel } of channels) {
    const messageCount = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM chat_messages
        WHERE channel = ?
      `)
      .get(channel)
      .count;

    if (
      messageCount <= MAX_MESSAGES_PER_CHANNEL
    ) {
      continue;
    }

    const deleteCount =
      messageCount - MAX_MESSAGES_PER_CHANNEL;

    db.prepare(`
      DELETE FROM chat_messages
      WHERE id IN (
        SELECT id
        FROM chat_messages
        WHERE channel = ?
        ORDER BY created_at ASC
        LIMIT ?
      )
    `).run(
      channel,
      deleteCount
    );
  }
}

const pruneInterval = setInterval(
  pruneChat,
  10 * 60 * 1000
);

if (
  typeof pruneInterval.unref === "function"
) {
  pruneInterval.unref();
}


// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

module.exports = {
  db,
  pruneChat,
};
