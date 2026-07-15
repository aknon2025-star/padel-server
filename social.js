// routes/social.js
// Friendlies are created freely by ANY user (no admin needed).
// King tournament interest list is also open to all users.

const express = require("express");
const { v4: uuid } = require("uuid");
const { db } = require("../db/database");
const router = express.Router();

// ── FRIENDLIES ──────────────────────────────────────────────
router.get("/friendlies", (req, res) => {
  const friendlies = db.prepare("SELECT * FROM friendlies ORDER BY date, hour").all();
  const withPlayers = friendlies.map(f => {
    const players = db.prepare(`
      SELECT u.id, u.name FROM friendly_players fp
      JOIN users u ON fp.user_id = u.id
      WHERE fp.friendly_id = ?
    `).all(f.id);
    return { ...f, players };
  });
  res.json({ friendlies: withPlayers });
});

router.post("/friendlies", (req, res) => {
  const { name, level, date, hour, creatorId, maxPlayers } = req.body;
  if (!name || !date || !hour || !creatorId) return res.status(400).json({ error: "اطلاعات ناقص است" });

  const id = "fr-" + uuid().slice(0, 8);
  db.prepare(`
    INSERT INTO friendlies (id, name, level, date, hour, creator_id, max_players)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, level || "free", date, hour, creatorId, maxPlayers || 4);

  db.prepare("INSERT INTO friendly_players (friendly_id, user_id) VALUES (?, ?)").run(id, creatorId);

  res.status(201).json({ id });
});

router.post("/friendlies/:id/join", (req, res) => {
  const { userId } = req.body;
  const friendly = db.prepare("SELECT * FROM friendlies WHERE id = ?").get(req.params.id);
  if (!friendly) return res.status(404).json({ error: "پیدا نشد" });

  const currentCount = db.prepare("SELECT COUNT(*) as c FROM friendly_players WHERE friendly_id = ?")
    .get(req.params.id).c;
  if (currentCount >= friendly.max_players) {
    return res.status(409).json({ error: "ظرفیت تکمیل است" });
  }

  db.prepare("INSERT OR IGNORE INTO friendly_players (friendly_id, user_id) VALUES (?, ?)")
    .run(req.params.id, userId);
  res.json({ success: true });
});

router.delete("/friendlies/:id", (req, res) => {
  db.prepare("DELETE FROM friendly_players WHERE friendly_id = ?").run(req.params.id);
  db.prepare("DELETE FROM friendlies WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ── KING TOURNAMENT INTEREST ─────────────────────────────────
router.get("/king-interest", (req, res) => {
  const rows = db.prepare(`
    SELECT ki.*, u.name FROM king_interest ki
    JOIN users u ON ki.user_id = u.id
    ORDER BY ki.created_at DESC
  `).all();
  res.json({ interested: rows });
});

router.post("/king-interest", (req, res) => {
  const { userId } = req.body;
  const exists = db.prepare("SELECT * FROM king_interest WHERE user_id = ?").get(userId);
  if (exists) return res.json({ success: true, alreadyRegistered: true });

  const id = "ki-" + uuid().slice(0, 8);
  db.prepare("INSERT INTO king_interest (id, user_id) VALUES (?, ?)").run(id, userId);
  res.status(201).json({ success: true });
});

module.exports = router;
