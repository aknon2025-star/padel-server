// routes/users.js
// Admin-only user management: create/edit coaches, view all players.
const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("./database");
const router = express.Router();

function requireAdmin(req, res, next) {
  const adminId = req.headers["x-user-id"];
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "فقط ادمین اجازه دارد" });
  }
  next();
}

// GET /api/users — list everyone (any logged-in user can see names/roles for display)
router.get("/", (req, res) => {
  const users = db.prepare(
    "SELECT id, name, username, role, level, points, wins, losses, played, photo_url FROM users"
  ).all();
  res.json({ users });
});

// GET /api/users/:id
router.get("/:id", (req, res) => {
  const user = db.prepare(
    "SELECT id, name, username, role, level, points, wins, losses, played, photo_url FROM users WHERE id = ?"
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: "کاربر پیدا نشد" });
  res.json({ user });
});

// POST /api/users — ADMIN ONLY: create a new user (player or coach)
router.post("/", requireAdmin, (req, res) => {
  const { username, password, name, role, level } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: "نام کاربری، رمز و نام کامل لازم است" });
  }
  const id = "u-" + uuid().slice(0, 8);
  try {
    db.prepare(`
      INSERT INTO users (id, username, password, name, role, level, points, wins, losses, played)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
    `).run(id, username, password, name, role || "player", level || "B");
    const user = db.prepare("SELECT id, name, username, role, level FROM users WHERE id = ?").get(id);
    res.status(201).json({ user });
  } catch (e) {
    res.status(400).json({ error: "نام کاربری تکراری است" });
  }
});

// PUT /api/users/:id — ADMIN ONLY: edit name/role/level (e.g. set someone as coach)
router.put("/:id", requireAdmin, (req, res) => {
  const { name, role, level, password } = req.body;
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "کاربر پیدا نشد" });

  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      level = COALESCE(?, level),
      password = COALESCE(?, password)
    WHERE id = ?
  `).run(name, role, level, password, req.params.id);

  const updated = db.prepare("SELECT id, name, username, role, level FROM users WHERE id = ?").get(req.params.id);
  res.json({ user: updated });
});

// DELETE /api/users/:id — ADMIN ONLY
router.delete("/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Internal helper used by other routes to award points after a match
function awardPoints(userId, points, won) {
  db.prepare(`
    UPDATE users SET
      points = points + ?,
      wins = wins + ?,
      losses = losses + ?,
      played = played + 1
    WHERE id = ?
  `).run(points, won ? 1 : 0, won ? 0 : 1, userId);
}

module.exports = { router, awardPoints, requireAdmin };
