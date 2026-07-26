// courts.js
// Court routes

const express = require("express");
const db = require("./db/database");

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET ALL COURTS
// GET /api/courts
// ─────────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  try {
    const courts = db
      .prepare(`
        SELECT
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
        FROM courts
        ORDER BY id ASC
      `)
      .all();

    return res.status(200).json(courts);
  } catch (error) {
    console.error(
      "GET /api/courts failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Cannot load courts",
      details: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET SINGLE COURT
// GET /api/courts/:id
// ─────────────────────────────────────────────────────────────

router.get("/:id", (req, res) => {
  try {
    const court = db
      .prepare(`
        SELECT
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
        FROM courts
        WHERE id = ?
      `)
      .get(req.params.id);

    if (!court) {
      return res.status(404).json({
        success: false,
        error: "Court not found",
      });
    }

    return res.status(200).json(court);
  } catch (error) {
    console.error(
      `GET /api/courts/${req.params.id} failed:`,
      error
    );

    return res.status(500).json({
      success: false,
      error: "Cannot load court",
      details: error.message,
    });
  }
});

module.exports = router;
