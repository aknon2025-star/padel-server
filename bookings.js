// routes/bookings.js

const express = require("express");
const { v4: uuid } = require("uuid");

const database = require("./database");
const db = database.db || database;

const router = express.Router();

const HOURS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
];

function rangeOverlaps(
  startA,
  durationA,
  startB,
  durationB
) {
  const a = HOURS.indexOf(startA);
  const b = HOURS.indexOf(startB);

  if (a < 0 || b < 0) {
    return false;
  }

  const parsedDurationA = Number(durationA);
  const parsedDurationB = Number(durationB);

  if (
    !Number.isFinite(parsedDurationA) ||
    !Number.isFinite(parsedDurationB)
  ) {
    return false;
  }

  return (
    a < b + parsedDurationB &&
    b < a + parsedDurationA
  );
}

// ======================================================
// دریافت همه رزروهای یک روز
// GET /api/bookings/courts-reservations
// ======================================================

router.get(
  "/courts-reservations",
  (req, res) => {
    try {
      const { date } = req.query;

      const sql = `
        SELECT
          cr.*,
          u.name AS user_name,
          c.name AS court_name
        FROM court_reservations cr
        LEFT JOIN users u
          ON u.id = cr.user_id
        LEFT JOIN courts c
          ON c.id = cr.court_id
      `;

      let rows;

      if (date) {
        rows = db
          .prepare(`
            ${sql}
            WHERE cr.date = ?
            ORDER BY cr.start_hour
          `)
          .all(date);
      } else {
        rows = db
          .prepare(`
            ${sql}
            ORDER BY cr.date, cr.start_hour
          `)
          .all();
      }

      return res.status(200).json({
        success: true,
        reservations: rows,
      });
    } catch (error) {
      console.error(
        "GET /api/bookings/courts-reservations failed:"
      );
      console.error(error);

      return res.status(500).json({
        success: false,
        error: "Cannot load reservations",
        details: error.message,
      });
    }
  }
);

// ======================================================
// دریافت رزروهای یک زمین خاص
// GET /api/bookings/court/:id/reservations
// ======================================================

router.get(
  "/court/:id/reservations",
  (req, res) => {
    try {
      const courtId = req.params.id;
      const { date } = req.query;

      const query = `
        SELECT
          cr.*,
          u.name AS user_name,
          c.name AS court_name
        FROM court_reservations cr
        LEFT JOIN users u
          ON u.id = cr.user_id
        LEFT JOIN courts c
          ON c.id = cr.court_id
        WHERE cr.court_id = ?
      `;

      let rows;

      if (date) {
        rows = db
          .prepare(`
            ${query}
            AND cr.date = ?
            ORDER BY cr.start_hour
          `)
          .all(
            courtId,
            date
          );
      } else {
        rows = db
          .prepare(`
            ${query}
            ORDER BY cr.date, cr.start_hour
          `)
          .all(courtId);
      }

      return res.status(200).json({
        success: true,
        courtId,
        reservations: rows,
      });
    } catch (error) {
      console.error(
        `GET /api/bookings/court/${req.params.id}/reservations failed:`
      );
      console.error(error);

      return res.status(500).json({
        success: false,
        error: "Cannot load court reservations",
        details: error.message,
      });
    }
  }
);

// ======================================================
// ثبت رزرو زمین
// POST /api/bookings/court
// ======================================================

router.post(
  "/court",
  (req, res) => {
    try {
      const {
        courtId,
        userId,
        date,
        startHour,
        durationHours,
        needsPartner,
      } = req.body ?? {};

      if (
        courtId === undefined ||
        courtId === null ||
        String(courtId).trim().isEmpty ||
        !userId ||
        !date ||
        !startHour ||
        durationHours === undefined ||
        durationHours === null
      ) {
        return res.status(400).json({
          success: false,
          error: "اطلاعات ناقص است",
          received: {
            courtId,
            userId,
            date,
            startHour,
            durationHours,
            needsPartner,
          },
        });
      }

      const normalizedCourtId =
        Number.isNaN(Number(courtId))
          ? courtId
          : Number(courtId);

      const normalizedDuration =
        Number(durationHours);

      if (
        !Number.isFinite(normalizedDuration) ||
        normalizedDuration <= 0
      ) {
        return res.status(400).json({
          success: false,
          error: "مدت رزرو نامعتبر است",
        });
      }

      if (!HOURS.includes(startHour)) {
        return res.status(400).json({
          success: false,
          error: "ساعت شروع نامعتبر است",
          allowedHours: HOURS,
        });
      }

      const court = db
        .prepare(`
          SELECT id
          FROM courts
          WHERE id = ?
        `)
        .get(normalizedCourtId);

      if (!court) {
        return res.status(404).json({
          success: false,
          error: "زمین موردنظر پیدا نشد",
        });
      }

      const user = db
        .prepare(`
          SELECT id
          FROM users
          WHERE id = ?
        `)
        .get(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "کاربر موردنظر در سرور پیدا نشد",
          userId,
        });
      }

      const existingReservations = db
        .prepare(`
          SELECT
            start_hour,
            duration_hours
          FROM court_reservations
          WHERE court_id = ?
            AND date = ?
        `)
        .all(
          normalizedCourtId,
          date
        );

      const conflict =
        existingReservations.some(
          (reservation) =>
            rangeOverlaps(
              startHour,
              normalizedDuration,
              reservation.start_hour,
              reservation.duration_hours
            )
        );

      if (conflict) {
        return res.status(409).json({
          success: false,
          error: "این زمان قبلاً رزرو شده است",
        });
      }

      const id =
        `res-${uuid().slice(0, 8)}`;

      const insertResult = db
        .prepare(`
          INSERT INTO court_reservations (
            id,
            court_id,
            user_id,
            date,
            start_hour,
            duration_hours,
            needs_partner
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          normalizedCourtId,
          userId,
          date,
          startHour,
          normalizedDuration,
          needsPartner ? 1 : 0
        );

      return res.status(201).json({
        success: true,
        id,
        changes: insertResult.changes,
        reservation: {
          id,
          courtId: normalizedCourtId,
          userId,
          date,
          startHour,
          durationHours: normalizedDuration,
          needsPartner: Boolean(needsPartner),
        },
      });
    } catch (error) {
      console.error(
        "POST /api/bookings/court failed:"
      );
      console.error(error);

      return res.status(500).json({
        success: false,
        error: "Reservation failed",
        details: error.message,
      });
    }
  }
);

// ======================================================
// حذف رزرو
// DELETE /api/bookings/court/:id
// ======================================================

router.delete(
  "/court/:id",
  (req, res) => {
    try {
      const result = db
        .prepare(`
          DELETE FROM court_reservations
          WHERE id = ?
        `)
        .run(req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: "رزرو پیدا نشد",
        });
      }

      return res.status(200).json({
        success: true,
        deletedId: req.params.id,
      });
    } catch (error) {
      console.error(
        `DELETE /api/bookings/court/${req.params.id} failed:`
      );
      console.error(error);

      return res.status(500).json({
        success: false,
        error: "Cannot delete reservation",
        details: error.message,
      });
    }
  }
);

module.exports = router;
