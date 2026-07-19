// ============================================================
// controllers/adminController.js
// Admin login, store management, multi-admin management,
// review moderation, and platform stats
// ============================================================

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const QRCode = require('qrcode');
const path   = require('path');
const fs     = require('fs');
const db     = require('../config/db');

// ────────────────────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────────────────────

// POST /api/admin/login
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Trim whitespace – common mistake when typing credentials
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    const [rows] = await db.query(
      'SELECT * FROM admins WHERE username = ?',
      [cleanUsername]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const admin   = rows[0];
    const isMatch = await bcrypt.compare(cleanPassword, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin', isSuper: admin.is_super },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message  : 'Login successful',
      token,
      username : admin.username,
      isSuper  : admin.is_super === 1
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
}

// ────────────────────────────────────────────────────────────
// MULTI-ADMIN MANAGEMENT
// ────────────────────────────────────────────────────────────

// GET /api/admin/admins  –  list all admins
async function getAdmins(req, res) {
  try {
    const [admins] = await db.query(
      'SELECT id, username, is_super, created_at FROM admins ORDER BY created_at ASC'
    );
    res.json({ admins });
  } catch (err) {
    console.error('Get admins error:', err);
    res.status(500).json({ error: 'Server error fetching admins.' });
  }
}

// POST /api/admin/admins  –  create a new admin account
async function createAdmin(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check duplicate username (check both admins AND store_users to avoid confusion)
    const [existAdmin] = await db.query('SELECT id FROM admins WHERE username = ?', [cleanUsername]);
    if (existAdmin.length > 0) {
      return res.status(400).json({ error: 'Username already exists. Choose a different username.' });
    }

    const [existStore] = await db.query('SELECT id FROM store_users WHERE username = ?', [cleanUsername]);
    if (existStore.length > 0) {
      return res.status(400).json({ error: 'Username already used by a store owner. Choose a different username.' });
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 12);

    const [result] = await db.query(
      'INSERT INTO admins (username, password_hash, is_super) VALUES (?, ?, 0)',
      [cleanUsername, passwordHash]
    );

    res.status(201).json({
      message : 'Admin account created successfully!',
      admin   : { id: result.insertId, username: cleanUsername, is_super: 0 }
    });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ error: 'Server error creating admin.' });
  }
}

// PUT /api/admin/admins/:id/password  –  change another admin's password
async function changeAdminPassword(req, res) {
  try {
    const { id }          = req.params;
    const { new_password } = req.body;
    const requesterId     = req.user.id;
    const requesterIsSuper = req.user.isSuper;

    if (!new_password || new_password.trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const [target] = await db.query('SELECT id, is_super FROM admins WHERE id = ?', [id]);
    if (target.length === 0) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    // Non-super admins can only change their OWN password
    if (!requesterIsSuper && parseInt(id) !== requesterId) {
      return res.status(403).json({ error: 'You can only change your own password.' });
    }

    const passwordHash = await bcrypt.hash(new_password.trim(), 12);
    await db.query('UPDATE admins SET password_hash = ? WHERE id = ?', [passwordHash, id]);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change admin password error:', err);
    res.status(500).json({ error: 'Server error changing password.' });
  }
}

// DELETE /api/admin/admins/:id  –  delete an admin (cannot delete super-admin)
async function deleteAdmin(req, res) {
  try {
    const { id }          = req.params;
    const requesterId     = req.user.id;
    const requesterIsSuper = req.user.isSuper;

    if (!requesterIsSuper) {
      return res.status(403).json({ error: 'Only the super-admin can delete admin accounts.' });
    }

    const [target] = await db.query('SELECT id, username, is_super FROM admins WHERE id = ?', [id]);
    if (target.length === 0) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    if (target[0].is_super) {
      return res.status(400).json({ error: 'Cannot delete the super-admin account.' });
    }

    if (parseInt(id) === requesterId) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    await db.query('DELETE FROM admins WHERE id = ?', [id]);
    res.json({ message: `Admin "${target[0].username}" deleted successfully.` });
  } catch (err) {
    console.error('Delete admin error:', err);
    res.status(500).json({ error: 'Server error deleting admin.' });
  }
}

// ────────────────────────────────────────────────────────────
// STORE MANAGEMENT
// ────────────────────────────────────────────────────────────

// POST /api/admin/stores
// POST /api/admin/stores
async function createStore(req, res) {
  try {
    const {
      store_name, store_address,
      owner_username, owner_password,
      subscription_days = 30           // ← NEW: default 30 days
    } = req.body;

    if (!store_name || !owner_username || !owner_password) {
      return res.status(400).json({ error: 'Store name, owner username, and password are required.' });
    }

    const cleanUser = owner_username.trim();
    const cleanPass = owner_password.trim();
    const days      = parseInt(subscription_days) || 30;

    if (cleanPass.length < 6) {
      return res.status(400).json({ error: 'Owner password must be at least 6 characters.' });
    }

    // Check username uniqueness
    const [existStore] = await db.query('SELECT id FROM store_users WHERE username = ?', [cleanUser]);
    if (existStore.length > 0) return res.status(400).json({ error: 'Store owner username already exists.' });

    const [existAdmin] = await db.query('SELECT id FROM admins WHERE username = ?', [cleanUser]);
    if (existAdmin.length > 0) return res.status(400).json({ error: 'Username already used by an admin.' });

    // Calculate subscription dates
    const startDate = new Date();
    const endDate   = new Date();
    endDate.setDate(endDate.getDate() + days);
    const fmt = d => d.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Generate QR slug
    const baseSlug = store_name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g,'-').substring(0,30);
    const qrSlug   = `${baseSlug}-${Date.now().toString().slice(-5)}`;

    // Insert store with subscription dates
    const [storeResult] = await db.query(
      `INSERT INTO stores
        (store_name, store_address, qr_slug, subscription_status,
         subscription_start, subscription_end, subscription_days)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`,
      [store_name.trim(), store_address || '', qrSlug, fmt(startDate), fmt(endDate), days]
    );
    const storeId = storeResult.insertId;

    // Generate QR code
    const baseUrl    = process.env.BASE_URL || 'http://localhost:5500';
    const qrUrl      = `${baseUrl}/customer-review.html?store=${qrSlug}`;
    const qrDir      = path.join(__dirname, '../uploads/qrcodes');
    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
    await QRCode.toFile(path.join(qrDir, `store-${storeId}.png`), qrUrl, { width: 300, margin: 2 });
    const qrCodePath = `uploads/qrcodes/store-${storeId}.png`;
    await db.query('UPDATE stores SET qr_code_path = ? WHERE id = ?', [qrCodePath, storeId]);

    // Create store owner account
    const passwordHash = await bcrypt.hash(cleanPass, 12);
    await db.query(
      'INSERT INTO store_users (store_id, username, password_hash) VALUES (?, ?, ?)',
      [storeId, cleanUser, passwordHash]
    );

    res.status(201).json({
      message : 'Store created successfully!',
      store   : {
        id: storeId, store_name, qr_slug: qrSlug,
        qr_url: qrUrl, qr_code_path: qrCodePath,
        subscription_start: fmt(startDate),
        subscription_end  : fmt(endDate),
        subscription_days : days
      },
      owner: { username: cleanUser }
    });
  } catch (err) {
    console.error('Create store error:', err);
    res.status(500).json({ error: 'Server error creating store.' });
  }
}

// GET /api/admin/stores
async function getStores(req, res) {
  try {
    const [stores] = await db.query(`
      SELECT
        s.id, s.store_name, s.store_address, s.qr_slug,
        s.subscription_status, s.qr_code_path, s.created_at,
        s.subscription_start, s.subscription_end, s.subscription_days,
        DATEDIFF(s.subscription_end, CURDATE()) AS days_remaining,
        su.username AS owner_username,
        COUNT(DISTINCT w.id)  AS worker_count,
        COUNT(DISTINCT r.id)  AS review_count
      FROM stores s
      LEFT JOIN store_users su ON su.store_id = s.id
      LEFT JOIN workers     w  ON w.store_id  = s.id AND w.status = 'active'
      LEFT JOIN reviews     r  ON r.store_id  = s.id
      GROUP BY s.id, su.username
      ORDER BY s.created_at DESC
    `);
    res.json({ stores });
  } catch (err) {
    console.error('Get stores error:', err);
    res.status(500).json({ error: 'Server error fetching stores.' });
  }
}

// PUT /api/admin/stores/:id/status
async function updateStoreStatus(req, res) {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "active" or "disabled".' });
    }

    const [result] = await db.query(
      'UPDATE stores SET subscription_status = ? WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Store not found.' });

    res.json({ message: `Store ${status === 'active' ? 'enabled' : 'disabled'} successfully.` });
  } catch (err) {
    console.error('Update store status error:', err);
    res.status(500).json({ error: 'Server error updating store status.' });
  }
}

// DELETE /api/admin/stores/:id
async function deleteStore(req, res) {
  try {
    const [result] = await db.query('DELETE FROM stores WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Store not found.' });
    res.json({ message: 'Store deleted successfully.' });
  } catch (err) {
    console.error('Delete store error:', err);
    res.status(500).json({ error: 'Server error deleting store.' });
  }
}

// ────────────────────────────────────────────────────────────
// STATS & REVIEWS
// ────────────────────────────────────────────────────────────

// GET /api/admin/stats
async function getStats(req, res) {
  try {
    const [[row]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM stores)                                        AS total_stores,
        (SELECT COUNT(*) FROM stores WHERE subscription_status = 'active')  AS active_stores,
        (SELECT COUNT(*) FROM stores WHERE subscription_status = 'disabled') AS disabled_stores,
        (SELECT COUNT(*) FROM reviews)                                        AS total_reviews,
        (SELECT COUNT(*) FROM reviews WHERE review_type = 'good')            AS good_reviews,
        (SELECT COUNT(*) FROM reviews WHERE review_type = 'bad')             AS bad_reviews,
        (SELECT COUNT(*) FROM workers WHERE status = 'active')               AS total_workers,
        (SELECT COUNT(*) FROM admins)                                         AS total_admins
    `);
    res.json(row);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Server error fetching stats.' });
  }
}

// GET /api/admin/reviews
async function getAllReviews(req, res) {
  try {
    const { store_id, review_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = '';
    const params = [];

    if (store_id)   { where += ' AND r.store_id = ?';      params.push(store_id); }
    if (review_type && ['good','bad'].includes(review_type)) {
      where += ' AND r.review_type = ?'; params.push(review_type);
    }

    const [reviews] = await db.query(`
      SELECT r.id, r.rating, r.review_type, r.description, r.created_at,
             w.worker_name, w.role, s.store_name
      FROM reviews r
      JOIN workers w ON r.worker_id = w.id
      JOIN stores  s ON r.store_id  = s.id
      WHERE 1=1 ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM reviews r WHERE 1=1 ${where}`, params
    );

    res.json({ reviews, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Get all reviews error:', err);
    res.status(500).json({ error: 'Server error fetching reviews.' });
  }
}

// DELETE /api/admin/reviews/:id
async function deleteReview(req, res) {
  try {
    const [result] = await db.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Review not found.' });
    res.json({ message: 'Review deleted successfully.' });
  } catch (err) {
    console.error('Delete review error:', err);
    res.status(500).json({ error: 'Server error deleting review.' });
  }
}


const updateStore = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      store_name,
      store_address,
      owner_username,
      owner_password
    } = req.body;

    // Update store details
    await db.query(
      `
      UPDATE stores
      SET
        store_name = ?,
        store_address = ?
      WHERE id = ?
      `,
      [store_name, store_address, id]
    );

    // Update username
    await db.query(
      `
      UPDATE store_users
      SET username = ?
      WHERE store_id = ?
      `,
      [owner_username, id]
    );

    // Update password only if entered
    if (owner_password && owner_password.trim() !== '') {

      const bcrypt = require('bcryptjs');

      const hashedPassword =
        await bcrypt.hash(owner_password, 10);

      await db.query(
        `
        UPDATE store_users
        SET password_hash = ?
        WHERE store_id = ?
        `,
        [hashedPassword, id]
      );
    }

    res.json({
      success: true,
      message: 'Store updated successfully'
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Failed to update store'
    });

  }
};

// PUT /api/admin/stores/:id/subscription
// Admin sets new subscription_days from today (or extends from current end date)
async function updateSubscription(req, res) {
  try {
    const { id }                          = req.params;
    const { subscription_days, extend_from } = req.body;
    // extend_from: "today" (default) or "current_end" (adds days from expiry date)

    const days = parseInt(subscription_days);
    if (!days || days < 1 || days > 3650) {
      return res.status(400).json({ error: 'subscription_days must be between 1 and 3650.' });
    }

    // Get current store
    const [rows] = await db.query(
      'SELECT id, store_name, subscription_end FROM stores WHERE id = ?', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Store not found.' });

    const fmt = d => d.toISOString().split('T')[0];

    let startDate = new Date();                       // default: start from today
    let endDate   = new Date();

    if (extend_from === 'current_end' && rows[0].subscription_end) {
      // Extend from the current expiry date (good for renewals before expiry)
      startDate = new Date(rows[0].subscription_end);
      endDate   = new Date(rows[0].subscription_end);
    }

    endDate.setDate(endDate.getDate() + days);

    await db.query(
      `UPDATE stores
       SET subscription_start  = ?,
           subscription_end    = ?,
           subscription_days   = ?,
           subscription_status = 'active'
       WHERE id = ?`,
      [fmt(startDate), fmt(endDate), days, id]
    );

    res.json({
      message            : `Subscription updated. Active until ${fmt(endDate)}.`,
      subscription_start : fmt(startDate),
      subscription_end   : fmt(endDate),
      subscription_days  : days
    });
  } catch (err) {
    console.error('Update subscription error:', err);
    res.status(500).json({ error: 'Server error updating subscription.' });
  }
}

module.exports = {
  login,
  getAdmins,
  createAdmin,
  changeAdminPassword,
  deleteAdmin,

  createStore,
  getStores,
  updateStore,
  updateStoreStatus,
  updateSubscription,
  deleteStore,

  getStats,
  getAllReviews,
  deleteReview
};

