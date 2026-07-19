// ============================================================
// controllers/storeController.js
// Store owner: login, dashboard, worker CRUD, reviews
// Images stored on Cloudinary (https URL) or local disk
// ============================================================

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const fs      = require('fs');
const db      = require('../config/db');
const { uploadBuffer, deleteImage, extractPublicId } = require('../config/cloudinary');

// Helper: save buffer to local disk (fallback when Cloudinary not configured)
async function saveLocally(buffer, originalname) {
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(originalname)}`;
  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, buffer);
  return `uploads/${filename}`;
}

// Helper: pick storage mode based on env
async function handleImageUpload(file, oldImagePath = null) {
  const mode = (process.env.IMAGE_STORAGE || 'cloudinary').toLowerCase();

  if (mode === 'cloudinary') {
    const oldPublicId = extractPublicId(oldImagePath);
    const result = await uploadBuffer(file.buffer, 'worker-review/workers', oldPublicId || null);
    return result.secure_url;   // full https URL stored in DB
  } else {
    // local storage (delete old file first)
    if (oldImagePath && !oldImagePath.startsWith('http')) {
      const oldFull = path.join(__dirname, '..', oldImagePath);
      if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull);
    }
    return saveLocally(file.buffer, file.originalname);
  }
}

// ────────────────────────────────────────────────────────────

// POST /api/store/login
async function login(req, res) {
  try {
    const username = (req.body.username || '').trim();
    const password = (req.body.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const [rows] = await db.query(
      `SELECT su.*, s.subscription_status, s.store_name
       FROM store_users su
       JOIN stores s ON su.store_id = s.id
       WHERE su.username = ?`,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user    = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (user.subscription_status === 'disabled') {
      return res.status(403).json({
        error  : 'subscription_expired',
        message: 'Your subscription has expired. Please contact the application admin.'
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, storeId: user.store_id, role: 'store' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message   : 'Login successful',
      token,
      username  : user.username,
      store_name: user.store_name,
      store_id  : user.store_id
    });
  } catch (err) {
    console.error('Store login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
}

// GET /api/store/dashboard
async function getDashboard(req, res) {
  try {
    const storeId = req.user.storeId;

    // In getDashboard, update the store query:
const [[store]] = await db.query(`
  SELECT *,
    DATEDIFF(subscription_end, CURDATE()) AS days_remaining,
    CASE
      WHEN subscription_end IS NULL THEN 'unknown'
      WHEN subscription_end < CURDATE() THEN 'expired'
      WHEN DATEDIFF(subscription_end, CURDATE()) <= 7 THEN 'expiring_soon'
      ELSE 'active'
    END AS subscription_health
  FROM stores WHERE id = ?
`, [storeId]);
   const [[stats]] = await db.query(`
  SELECT
    COUNT(*) AS total_reviews,
    SUM(CASE WHEN review_type='good' THEN 1 ELSE 0 END) AS good_reviews,
    SUM(CASE WHEN review_type='bad' THEN 1 ELSE 0 END) AS bad_reviews,
    ROUND(AVG(rating),1) AS avg_rating,

    SUM(
      CASE
        WHEN DATE(created_at) = CURDATE()
        THEN 1
        ELSE 0
      END
    ) AS today_reviews

  FROM reviews
  WHERE store_id = ?
`, [storeId]);

    const [workerStats] = await db.query(`
      SELECT
        w.id, w.worker_name, w.role, w.image_path,
        COUNT(r.id) AS total_reviews,
        SUM(CASE WHEN r.review_type='good' THEN 1 ELSE 0 END) AS good_reviews,
        SUM(CASE WHEN r.review_type='bad'  THEN 1 ELSE 0 END) AS bad_reviews,
        ROUND(AVG(r.rating),1) AS avg_rating
      FROM workers w
      LEFT JOIN reviews r ON r.worker_id = w.id
      WHERE w.store_id = ? AND w.status = 'active'
      GROUP BY w.id
      ORDER BY good_reviews DESC
    `, [storeId]);

    const bestWorker   = workerStats.length > 0 ? workerStats[0] : null;
    const needsImprov  = workerStats.length > 0
      ? [...workerStats].sort((a, b) => (b.bad_reviews||0) - (a.bad_reviews||0))[0]
      : null;

    const [monthlyTrend] = await db.query(`
      SELECT DATE_FORMAT(created_at,'%Y-%m') AS month,
             COUNT(*) AS total,
             SUM(CASE WHEN review_type='good' THEN 1 ELSE 0 END) AS good,
             SUM(CASE WHEN review_type='bad'  THEN 1 ELSE 0 END) AS bad
      FROM reviews
      WHERE store_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month ORDER BY month ASC
    `, [storeId]);

    res.json({ store, stats, worker_stats: workerStats, best_worker: bestWorker, worker_needs_improvement: needsImprov, monthly_trend: monthlyTrend });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error fetching dashboard.' });
  }
}

// POST /api/store/workers
async function addWorker(req, res) {
  try {
    const storeId     = req.user.storeId;
    const worker_name = (req.body.worker_name || '').trim();
    const role        = (req.body.role || '').trim();

    if (!worker_name) {
      return res.status(400).json({ error: 'Worker name is required.' });
    }

    let imagePath = null;
    if (req.file) {
      try {
        imagePath = await handleImageUpload(req.file);
      } catch (uploadErr) {
        console.error('Image upload error:', uploadErr.message);
        return res.status(500).json({ error: 'Image upload failed. Please try again.' });
      }
    }

    const [result] = await db.query(
      'INSERT INTO workers (store_id, worker_name, role, image_path) VALUES (?, ?, ?, ?)',
      [storeId, worker_name, role, imagePath]
    );

    res.status(201).json({
      message: 'Worker added successfully!',
      worker : { id: result.insertId, worker_name, role, image_path: imagePath }
    });
  } catch (err) {
    console.error('Add worker error:', err);
    res.status(500).json({ error: 'Server error adding worker.' });
  }
}

// GET /api/store/workers
async function getWorkers(req, res) {
  try {
    const [workers] = await db.query(
      'SELECT * FROM workers WHERE store_id = ? ORDER BY created_at DESC',
      [req.user.storeId]
    );
    res.json({ workers });
  } catch (err) {
    console.error('Get workers error:', err);
    res.status(500).json({ error: 'Server error fetching workers.' });
  }
}

// PUT /api/store/workers/:id
async function updateWorker(req, res) {
  try {
    console.log("Received status:", req.body.status);
    const storeId     = req.user.storeId;
    const { id }      = req.params;
    const worker_name = (req.body.worker_name || '').trim();
    const role        = req.body.role !== undefined ? req.body.role.trim() : undefined;
    const status      = req.body.status;

    const [check] = await db.query(
      'SELECT * FROM workers WHERE id = ? AND store_id = ?', [id, storeId]
    );
    if (check.length === 0) return res.status(404).json({ error: 'Worker not found.' });

    const existing  = check[0];
    let imagePath   = existing.image_path;

    if (req.file) {
      try {
        imagePath = await handleImageUpload(req.file, existing.image_path);
      } catch (uploadErr) {
        console.error('Image upload error:', uploadErr.message);
        return res.status(500).json({ error: 'Image upload failed. Please try again.' });
      }
    }

    console.log("Existing status:", existing.status);
console.log("New status:", status);

    await db.query(
      'UPDATE workers SET worker_name=?, role=?, image_path=?, status=? WHERE id=? AND store_id=?',
      [
        worker_name || existing.worker_name,
        role        !== undefined ? role : existing.role,
        imagePath,
        status      || existing.status,
        id, storeId
      ]
    );

    res.json({ message: 'Worker updated successfully.', image_path: imagePath });
  } catch (err) {
    console.error('Update worker error:', err);
    res.status(500).json({ error: 'Server error updating worker.' });
  }
}

// DELETE /api/store/workers/:id  (soft delete → inactive)
// DELETE /api/store/workers/:id
async function deleteWorker(req, res) {
  try {
    const storeId = req.user.storeId;
    const { id } = req.params;

    const [check] = await db.query(
      'SELECT * FROM workers WHERE id = ? AND store_id = ?',
      [id, storeId]
    );

    if (check.length === 0) {
      return res.status(404).json({ error: 'Worker not found.' });
    }

    const worker = check[0];

    // Delete image from Cloudinary
    if (worker.image_path) {
      try {
        await deleteImage(worker.image_path);
      } catch (err) {
        console.warn('Could not delete worker image:', err.message);
      }
    }

    // Delete reviews of this worker
    await db.query(
      'DELETE FROM reviews WHERE worker_id = ?',
      [id]
    );

    // Delete worker
    await db.query(
      'DELETE FROM workers WHERE id = ? AND store_id = ?',
      [id, storeId]
    );

    res.json({
      success: true,
      message: 'Worker deleted permanently.'
    });

  } catch (err) {
    console.error('Delete worker error:', err);
    res.status(500).json({
      error: 'Server error deleting worker.'
    });
  }
}

// GET /api/store/reviews
async function getReviews(req, res) {
  try {
    const storeId = req.user.storeId;
    const { worker_id, review_type, rating, date_from, date_to, page = 1, limit = 20 } = req.query;
    const offset  = (page - 1) * limit;

    let where  = 'WHERE r.store_id = ?';
    const params = [storeId];

    if (worker_id)  { where += ' AND r.worker_id = ?';    params.push(worker_id); }
    if (review_type && ['good','bad'].includes(review_type)) { where += ' AND r.review_type = ?'; params.push(review_type); }
    if (rating)     { where += ' AND r.rating = ?';       params.push(parseInt(rating)); }
    if (date_from)  { where += ' AND DATE(r.created_at) >= ?'; params.push(date_from); }
    if (date_to)    { where += ' AND DATE(r.created_at) <= ?'; params.push(date_to); }

    const [reviews] = await db.query(`
      SELECT r.id, r.rating, r.review_type, r.description, r.created_at,
             w.worker_name, w.role, w.image_path
      FROM reviews r
      JOIN workers w ON r.worker_id = w.id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM reviews r ${where}`, params
    );

    res.json({ reviews, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ error: 'Server error fetching reviews.' });
  }
}

// GET /api/store/reviews/stats
async function getReviewStats(req, res) {
  try {
    const storeId = req.user.storeId;

    const [[overall]] = await db.query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN review_type='good' THEN 1 ELSE 0 END) AS good,
             SUM(CASE WHEN review_type='bad'  THEN 1 ELSE 0 END) AS bad,
             ROUND(AVG(rating),1) AS avg_rating
      FROM reviews WHERE store_id=?
    `, [storeId]);

    const [workerStats] = await db.query(`
      SELECT w.worker_name, COUNT(r.id) AS total,
             SUM(CASE WHEN r.review_type='good' THEN 1 ELSE 0 END) AS good,
             SUM(CASE WHEN r.review_type='bad'  THEN 1 ELSE 0 END) AS bad,
             ROUND(AVG(r.rating),1) AS avg_rating
      FROM workers w
      LEFT JOIN reviews r ON r.worker_id = w.id
      WHERE w.store_id=? AND w.status='active'
      GROUP BY w.id, w.worker_name
    `, [storeId]);

    const [ratingDist] = await db.query(
      'SELECT rating, COUNT(*) AS count FROM reviews WHERE store_id=? GROUP BY rating ORDER BY rating',
      [storeId]
    );

    res.json({ overall, worker_stats: workerStats, rating_distribution: ratingDist });
  } catch (err) {
    console.error('Get review stats error:', err);
    res.status(500).json({ error: 'Server error fetching stats.' });
  }
}







// GET /api/store/analytics
async function getAnalytics(req, res) {
  try {
    const storeId = req.user.storeId;

const [dailyTrend] = await db.query(`
  SELECT
    DATE_FORMAT(DATE(created_at), '%Y-%m-%d') AS day,
    COUNT(*) AS total,
    SUM(CASE WHEN review_type='good' THEN 1 ELSE 0 END) AS good,
    SUM(CASE WHEN review_type='bad'  THEN 1 ELSE 0 END) AS bad,
    ROUND(AVG(rating),1) AS avg_rating
  FROM reviews
  WHERE store_id = ? AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  GROUP BY DATE_FORMAT(DATE(created_at), '%Y-%m-%d')
  ORDER BY day ASC
`, [storeId]);

    // Hourly distribution
    const [hourlyDist] = await db.query(`
      SELECT HOUR(created_at) AS hour, COUNT(*) AS count
      FROM reviews WHERE store_id = ?
      GROUP BY HOUR(created_at) ORDER BY hour ASC
    `, [storeId]);

    // Day of week distribution
    const [weekdayDist] = await db.query(`
      SELECT DAYNAME(created_at) AS day_name,
             DAYOFWEEK(created_at) AS day_num,
             COUNT(*) AS count
      FROM reviews WHERE store_id = ?
      GROUP BY day_name, day_num ORDER BY day_num ASC
    `, [storeId]);

    // Rating distribution
    const [ratingDist] = await db.query(`
      SELECT rating, COUNT(*) AS count
      FROM reviews WHERE store_id = ? AND rating IS NOT NULL
      GROUP BY rating ORDER BY rating DESC
    `, [storeId]);

    // Worker performance with scores
    const [workerPerf] = await db.query(`
      SELECT
        w.id, w.worker_name, w.role, w.image_path,
        COUNT(r.id)   AS total_reviews,
        SUM(CASE WHEN r.review_type='good' THEN 1 ELSE 0 END) AS good_reviews,
        SUM(CASE WHEN r.review_type='bad'  THEN 1 ELSE 0 END) AS bad_reviews,
        ROUND(AVG(r.rating),1) AS avg_rating,
        ROUND(
          (SUM(CASE WHEN r.review_type='good' THEN 1 ELSE 0 END) * 60
          + ROUND(AVG(r.rating),1) * 8
          + COUNT(r.id) * 2)
          / GREATEST(COUNT(r.id), 1)
        , 1) AS performance_score
      FROM workers w
      LEFT JOIN reviews r ON r.worker_id = w.id
      WHERE w.store_id = ? AND w.status = 'active'
      GROUP BY w.id
      ORDER BY performance_score DESC
    `, [storeId]);

    // This month vs last month
    const [[thisMonth]] = await db.query(`
      SELECT COUNT(*) AS count,
             ROUND(AVG(rating),1) AS avg_rating,
             SUM(CASE WHEN review_type='good' THEN 1 ELSE 0 END) AS good
      FROM reviews
      WHERE store_id = ?
        AND MONTH(created_at) = MONTH(NOW())
        AND YEAR(created_at)  = YEAR(NOW())
    `, [storeId]);

    const [[lastMonth]] = await db.query(`
      SELECT COUNT(*) AS count,
             ROUND(AVG(rating),1) AS avg_rating,
             SUM(CASE WHEN review_type='good' THEN 1 ELSE 0 END) AS good
      FROM reviews
      WHERE store_id = ?
        AND MONTH(created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))
        AND YEAR(created_at)  = YEAR(DATE_SUB(NOW(),  INTERVAL 1 MONTH))
    `, [storeId]);

const [[allTime]] = await db.query(`
  SELECT COUNT(*) AS total_all_time FROM reviews WHERE store_id = ?
`, [storeId]);

    res.json({
      daily_trend  : dailyTrend,
      hourly_dist  : hourlyDist,
      weekday_dist : weekdayDist,
      rating_dist  : ratingDist,
      worker_perf  : workerPerf,
      this_month   : thisMonth,
      last_month   : lastMonth,
      all_time     : allTime 
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error fetching analytics.' });
  }
} 

module.exports = {
  login, getDashboard,
  addWorker, getWorkers, updateWorker, deleteWorker,
  getReviews, getReviewStats,
  getAnalytics
};
