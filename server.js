// ============================================================
// server.js  –  Main entry point
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true
}));

// app.use(cors({
//   origin: true,
//   credentials: true
// }));
// ── Body parsing ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files ──────────────────────────────────────────
// Serve local upload images (fallback when IMAGE_STORAGE=local)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve frontend

// ── API Routes ────────────────────────────────────────────
app.use('/api/admin',  require('./routes/adminRoutes'));
app.use('/api/store',  require('./routes/storeRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));
//-- notification
// Add this line with the other routes
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Health-check endpoint (also used by keep-alive ping)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), message: 'Worker Review System API is running!' });
});

// Fallback: serve frontend for any non-API route
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    app: 'Worker Review System API'
  });
});




// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum 5 MB.' });
  }
  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// ── Start server ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Worker Review System Backend started!');
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log('');

  // Start keep-alive cron jobs AFTER server is listening
  const { startKeepAlive } = require('./config/keepAlive');
  startKeepAlive();
});

module.exports = app;
