// db/database.js
// استفاده از دیتابیس اصلی پروژه و جلوگیری از ساخت دیتابیس دوم

const { db } = require("../database");

module.exports = db;
