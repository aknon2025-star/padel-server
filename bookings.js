// routes/bookings.js
const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("./database");
const router = express.Router();

const HOURS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];

function hourIndex(h) { return HOURS.indexOf(h); }

function rangeOverlaps(startA, hoursA, startB, hoursB) {
  const aStart = hourIndex(startA), aEnd = aStart + hoursA * 2; // *2 because half-hours possible; we treat index steps as 1hr units, hoursA may be 1.5
  const bStart = hourIndex(startB), bEnd = bStart + hoursB * 2;
  // Simplify: compare using hour-index float math directly
  const aS = aStart, aE = aStart + hoursA;
  const bS = bStart, bE = bStart + hoursB;
  return aS < bE && bS < aE;
}

// ── COURTS ──────────────────────────────────────────────────
router.get("/courts", (req, res) => {
  const courts = db.prepare("SELECT * FROM courts").all();
  res.json({ courts });
});

// GET /api/bookings/courts/:date — all reservations for a date (for grid display)
router.get("/courts-reservations", (req, res) => {
  const { date } = req.query;
  const rows = date
    ? db.prepare("SELECT cr.*, u.name as user_name FROM court_reservations cr JOIN users u ON cr.user_id = u.id WHERE date = ?").all(date)
    : db.prepare("SELECT cr.*, u.name as user_name FROM court_reservations cr JOIN users u ON cr.user_id = u.id").all();
  res.json({ reservations: rows });
});

// POST /api/bookings/court — create a court reservation
router.post("/court", (req, res) => {
  const { courtId, userId, date, startHour, durationHours, needsPartner } = req.body;
  if (!courtId || !userId || !date || !startHour || !durationHours) {
    return res.status(400).json({ error: "اطلاعات ناقص است" });
  }

  // Check conflicts on the same court
  const existing = db.prepare("SELECT * FROM court_reservations WHERE court_id = ? AND date = ?")
    .all(courtId, date);
  const conflict = existing.some(r => rangeOverlaps(startHour, durationHours, r.start_hour, r.duration_hours));
  if (conflict) {
    return res.status(409).json({ error: "این بازه زمانی قبلاً رزرو شده است" });
  }

  const id = "res-" + uuid().slice(0, 8);
  db.prepare(`
    INSERT INTO court_reservations (id, court_id, user_id, date, start_hour, duration_hours, needs_partner)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, courtId, userId, date, startHour, durationHours, needsPartner ? 1 : 0);

  res.status(201).json({ id });
});

// DELETE /api/bookings/court/:id
router.delete("/court/:id", (req, res) => {
  db.prepare("DELETE FROM court_reservations WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ── COACH BOOKINGS ──────────────────────────────────────────
// GET /api/bookings/coach-reservations?date=YYYY-MM-DD
router.get("/coach-reservations", (req, res) => {
  const { date } = req.query;
  const rows = date
    ? db.prepare("SELECT * FROM coach_reservations WHERE date = ?").all(date)
    : db.prepare("SELECT * FROM coach_reservations").all();
  res.json({ reservations: rows });
});

// POST /api/bookings/coach — book a coach; checks BOTH coach availability AND court availability
router.post("/coach", (req, res) => {
  const { coachId, userId, date, startHour, durationHours, courtId } = req.body;
  if (!coachId || !userId || !date || !startHour || !durationHours) {
    return res.status(400).json({ error: "اطلاعات ناقص است" });
  }

  // 1. Check coach isn't already booked
  const coachBookings = db.prepare("SELECT * FROM coach_reservations WHERE coach_id = ? AND date = ?")
    .all(coachId, date);
  const coachBusy = coachBookings.some(r => rangeOverlaps(startHour, durationHours, r.start_hour, r.duration_hours));
  if (coachBusy) {
    return res.status(409).json({ error: "مربی در این بازه زمانی رزرو دیگری دارد" });
  }

  // 2. Check the court (if specified) isn't booked by someone else — prevents court/coach overlap
  if (courtId) {
    const courtBookings = db.prepare("SELECT * FROM court_reservations WHERE court_id = ? AND date = ?")
      .all(courtId, date);
    const courtBusy = courtBookings.some(r => rangeOverlaps(startHour, durationHours, r.start_hour, r.duration_hours));
    if (courtBusy) {
      return res.status(409).json({ error: "زمین در این بازه زمانی رزرو است" });
    }
  }

  const id = "cres-" + uuid().slice(0, 8);
  db.prepare(`
    INSERT INTO coach_reservations (id, coach_id, user_id, date, start_hour, duration_hours)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, coachId, userId, date, startHour, durationHours);

  res.status(201).json({ id });
});

router.delete("/coach/:id", (req, res) => {
  db.prepare("DELETE FROM coach_reservations WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ── FREE PLAYERS ────────────────────────────────────────────
router.get("/free-players", (req, res) => {
  const { date } = req.query;
  const rows = date
    ? db.prepare(`
        SELECT fp.*, u.name, u.level FROM free_players fp
        JOIN users u ON fp.user_id = u.id
        WHERE fp.date = ? AND fp.status = 'available'
      `).all(date)
    : db.prepare(`
        SELECT fp.*, u.name, u.level FROM free_players fp
        JOIN users u ON fp.user_id = u.id
        WHERE fp.status = 'available'
      `).all();
  res.json({ freePlayers: rows });
});

router.post("/free-players", (req, res) => {
  const { userId, date, hour } = req.body;
  const id = "fp-" + uuid().slice(0, 8);
  db.prepare("INSERT INTO free_players (id, user_id, date, hour, status) VALUES (?, ?, ?, ?, 'available')")
    .run(id, userId, date, hour);
  res.status(201).json({ id });
});

router.delete("/free-players/:id", (req, res) => {
  db.prepare("DELETE FROM free_players WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ── INVITES (notifications to free players) ────────────────
router.get("/invites/:userId", (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, u.name as from_name FROM invites i
    JOIN users u ON i.from_user_id = u.id
    WHERE i.to_user_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC
  `).all(req.params.userId);
  res.json({ invites: rows });
});

router.post("/invites", (req, res) => {
  const { fromUserId, toUserId, freePlayerId, message } = req.body;
  const id = "inv-" + uuid().slice(0, 8);
  db.prepare(`
    INSERT INTO invites (id, from_user_id, to_user_id, free_player_id, message, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(id, fromUserId, toUserId, freePlayerId, message || "");
  res.status(201).json({ id });
});

router.put("/invites/:id", (req, res) => {
  const { status } = req.body; // 'accepted' | 'declined'
  db.prepare("UPDATE invites SET status = ? WHERE id = ?").run(status, req.params.id);
  if (status === "accepted") {
    const invite = db.prepare("SELECT * FROM invites WHERE id = ?").get(req.params.id);
    if (invite?.free_player_id) {
      db.prepare("UPDATE free_players SET status = 'matched' WHERE id = ?").run(invite.free_player_id);
    }
  }
  res.json({ success: true });
});

module.exports = router;
