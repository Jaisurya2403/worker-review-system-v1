// ============================================================
// config/db.js  –  MySQL connection pool
// Supports both local MySQL and Aiven cloud MySQL (with SSL)
// ============================================================

const mysql  = require('mysql2');
require('dotenv').config();

// Build SSL option: Aiven requires SSL; local dev doesn't
const sslOption = process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: false }   // Aiven uses self-signed cert
  : false;

const pool = mysql.createPool({
  host             : process.env.DB_HOST     || 'localhost',
  port             : parseInt(process.env.DB_PORT || '3306'),
  user             : process.env.DB_USER     || 'root',
  password         : process.env.DB_PASSWORD || '',
  database         : process.env.DB_NAME     || 'worker_review_db',
  ssl              : sslOption,
  waitForConnections: true,
  connectionLimit  : 10,
  queueLimit       : 0,
  // Keep connections alive (important for Aiven idle timeout)
  enableKeepAlive  : true,
  keepAliveInitialDelay: 30000
});

const promisePool = pool.promise();

// Test connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection FAILED:', err.message);
    console.error('   Check your .env DB_ variables and make sure MySQL is running.');
  } else {
    console.log('✅ Database connected successfully!');
    connection.release();
  }
});

module.exports = promisePool;
