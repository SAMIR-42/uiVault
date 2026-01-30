const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.MYSQLHOST || process.env.DB_HOST,
  user: process.env.MYSQLUSER || process.env.DB_USER,
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQLDATABASE || process.env.DB_NAME,
  port: process.env.MYSQLPORT || 3306,
  ssl: {
    rejectUnauthorized: true,
  },
});

db.connect((err) => {
  if (err) {
    console.error("❌ DB connection failed:", err.message);
    return;
  }
  console.log("✅ MySQL connected");
});

module.exports = db;
