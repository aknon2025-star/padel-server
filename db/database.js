const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
  path.join(__dirname, "padel.db")
);


// Create tables
db.exec(`
CREATE TABLE IF NOT EXISTS courts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT
);


CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT UNIQUE
);
`);


// Seed courts if empty
const count = db
  .prepare("SELECT COUNT(*) as c FROM courts")
  .get()
  .c;


if (count === 0) {

  const insert = db.prepare(`
    INSERT INTO courts (name, location)
    VALUES (?, ?)
  `);


  insert.run("Court 1", "Padel Club");
  insert.run("Court 2", "Padel Club");
  insert.run("Court 3", "Padel Club");

}


module.exports = db;
