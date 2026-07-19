// ============================================================
// controllers/publicController.js
// Customer-facing routes — no authentication required
// ============================================================

const db = require('../config/db');

// GET /api/public/store/:qrSlug
async function getStoreBySlug(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id, store_name, store_address, subscription_status FROM stores WHERE qr_slug = ?',
      [req.params.qrSlug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Store not found. Please scan the correct QR code.' });
    }

    const store = rows[0];
    if (store.subscription_status === 'disabled') {
      return res.status(403).json({
        error  : 'store_disabled',
        message: 'This store is currently not accepting reviews. Please contact the store.'
      });
    }

    res.json({ store: { id: store.id, store_name: store.store_name, store_address: store.store_address } });
  } catch (err) {
    console.error('Get store error:', err);
    res.status(500).json({ error: 'Server error fetching store.' });
  }
}

// GET /api/public/store/:qrSlug/workers
async function getWorkers(req, res) {
  try {
    const [storeRows] = await db.query(
      'SELECT id, subscription_status FROM stores WHERE qr_slug = ?',
      [req.params.qrSlug]
    );

    if (storeRows.length === 0) {
      return res.status(404).json({ error: 'Store not found.' });
    }

    if (storeRows[0].subscription_status === 'disabled') {
      return res.status(403).json({ error: 'This store is currently unavailable.' });
    }

    const [workers] = await db.query(
      "SELECT id, worker_name, role, image_path FROM workers WHERE store_id=? AND status='active' ORDER BY worker_name",
      [storeRows[0].id]
    );

    res.json({ workers });
  } catch (err) {
    console.error('Get workers error:', err);
    res.status(500).json({ error: 'Server error fetching workers.' });
  }
}

// POST /api/public/store/:qrSlug/reviews
async function submitReview(req, res) {
  try {
    const { worker_id, rating, review_type, description } = req.body;

    if (!worker_id || !review_type) {
      return res.status(400).json({ error: 'Worker and review type (good/bad) are required.' });
    }

    if (!['good', 'bad'].includes(review_type)) {
      return res.status(400).json({ error: 'Review type must be "good" or "bad".' });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    const [storeRows] = await db.query(
      'SELECT id, subscription_status FROM stores WHERE qr_slug = ?',
      [req.params.qrSlug]
    );

    if (storeRows.length === 0) return res.status(404).json({ error: 'Store not found.' });
    if (storeRows[0].subscription_status === 'disabled') {
      return res.status(403).json({ error: 'This store is not accepting reviews at this time.' });
    }

    const storeId = storeRows[0].id;

    const [workerRows] = await db.query(
      "SELECT id FROM workers WHERE id=? AND store_id=? AND status='active'",
      [worker_id, storeId]
    );

    if (workerRows.length === 0) {
      return res.status(404).json({ error: 'Worker not found or no longer active.' });
    }

    const finalRating = rating || (review_type === 'good' ? 5 : 1);
    await db.query(
      'INSERT INTO reviews (store_id, worker_id, rating, review_type, description) VALUES (?,?,?,?,?)',
      [storeId, worker_id, finalRating, review_type, description || null]
    );

    res.status(201).json({ message: 'Thank you for your feedback! Your review has been submitted.' });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ error: 'Server error submitting review.' });
  }
}

module.exports = { getStoreBySlug, getWorkers, submitReview };
