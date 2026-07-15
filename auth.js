// routes/auth.js
const express = require("express");
const { db } = require("../db/database");
const router = express.Router();

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "نام کاربری و رمز عبور لازم است" });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?")
    .get(username, password);

  if (!user) {
    return res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است" });
  }

  delete user.password; // never send password back
  res.json({ user });
});

module.exports = router;
