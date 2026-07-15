// courts.js
// Court routes

const express = require("express");
const db = require("./db/database");

const router = express.Router();


// GET all courts
router.get("/", (req, res) => {
  try {
    const courts = db
      .prepare(`
        SELECT *
        FROM courts
        ORDER BY id ASC
      `)
      .all();

    res.json(courts);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Cannot load courts"
    });
  }
});


// GET single court
router.get("/:id", (req, res) => {

  try {

    const court = db
      .prepare(`
        SELECT *
        FROM courts
        WHERE id = ?
      `)
      .get(req.params.id);


    if (!court) {
      return res.status(404).json({
        error:"Court not found"
      });
    }


    res.json(court);


  } catch(err){

    console.error(err);

    res.status(500).json({
      error:"Server error"
    });

  }

});


module.exports = router;
