// routes/chat.js
// Lightweight in-app chat. Messages are short text only (max 300 chars),
// auto-pruned in db/database.js to the most recent 200 per channel so the
// SQLite file never grows large.

const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("./database");
const router = express.Router();

const MAX_MESSAGE_LENGTH = 300;

// GET /api/chat/:channel — fetch recent messages (default 'general')
router.get("/:channel", (req, res) => {
  const messages = db.prepare(`
    SELECT * FROM chat_messages WHERE channel = ? ORDER BY created_at ASC LIMIT 200
  `).all(req.params.channel);
  res.json({ messages });
});

// POST /api/chat/:channel — send a message
router.post("/:channel", (req, res) => {
  const { userId, userName, text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "متن پیام خالی است" });
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `پیام نباید بیشتر از ${MAX_MESSAGE_LENGTH} کاراکتر باشد` });
  }

  const id = "msg-" + uuid().slice(0, 8);
  db.prepare(`
    INSERT INTO chat_messages (id, channel, user_id, user_name, text)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.params.channel, userId, userName, text.trim());

  const message = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id);

  // Broadcast over WebSocket if available (attached in server.js)
  if (req.app.locals.broadcastChat) {
    req.app.locals.broadcastChat(req.params.channel, message);
  }

  res.status(201).json({ message });
});

module.exports = router;
