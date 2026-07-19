// ============================================================
// controllers/notificationController.js
// ============================================================

const db = require('../config/db');

// ── ADMIN: Send notification to a store ──────────────────
async function sendNotification(req, res) {
  try {
    const { store_id, title, message, type = 'admin_message' } = req.body;
    const sentBy = req.user.username;

    if (!store_id || !title || !message) {
      return res.status(400).json({ error: 'store_id, title, and message are required.' });
    }

    if (title.trim().length < 2) {
      return res.status(400).json({ error: 'Title must be at least 2 characters.' });
    }

    if (message.trim().length < 2) {
      return res.status(400).json({ error: 'Message must be at least 2 characters.' });
    }

    // Verify store exists
    const [storeRows] = await db.query('SELECT id, store_name FROM stores WHERE id = ?', [store_id]);
    if (storeRows.length === 0) {
      return res.status(404).json({ error: 'Store not found.' });
    }

    const [result] = await db.query(
      `INSERT INTO notifications (store_id, type, title, message, sent_by)
       VALUES (?, ?, ?, ?, ?)`,
      [store_id, type, title.trim(), message.trim(), sentBy]
    );

    res.status(201).json({
      message        : `Notification sent to "${storeRows[0].store_name}" successfully!`,
      notification_id: result.insertId
    });
  } catch (err) {
    console.error('Send notification error:', err);
    res.status(500).json({ error: 'Server error sending notification.' });
  }
}

// ── ADMIN: Get all notifications for a specific store ─────
async function getStoreNotifications(req, res) {
  try {
    const { storeId } = req.params;
    const [rows] = await db.query(
      `SELECT * FROM notifications WHERE store_id = ? ORDER BY created_at DESC LIMIT 50`,
      [storeId]
    );
    res.json({ notifications: rows });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Server error fetching notifications.' });
  }
}

// ── ADMIN: Delete a notification ──────────────────────────
async function deleteNotification(req, res) {
  try {
    const [result] = await db.query('DELETE FROM notifications WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Notification deleted.' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

// ── STORE: Get my notifications ───────────────────────────
async function getMyNotifications(req, res) {
  try {
    const storeId = req.user.storeId;
    const [rows]  = await db.query(
      `SELECT * FROM notifications WHERE store_id = ? ORDER BY created_at DESC LIMIT 50`,
      [storeId]
    );
    res.json({ notifications: rows });
  } catch (err) {
    console.error('Get my notifications error:', err);
    res.status(500).json({ error: 'Server error fetching notifications.' });
  }
}

// ── STORE: Mark one notification as read ──────────────────
async function markAsRead(req, res) {
  try {
    const storeId = req.user.storeId;
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND store_id = ?',
      [req.params.id, storeId]
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
}

// ── STORE: Mark all notifications as read ─────────────────
async function markAllAsRead(req, res) {
  try {
    const storeId = req.user.storeId;
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE store_id = ?',
      [storeId]
    );
    res.json({ message: 'All marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
}

// ── STORE: Get unread count (for badge) ───────────────────
async function getUnreadCount(req, res) {
  try {
    const storeId = req.user.storeId;
    const [[{ count }]] = await db.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE store_id = ? AND is_read = 0',
      [storeId]
    );
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
}

module.exports = {
  sendNotification, getStoreNotifications, deleteNotification,
  getMyNotifications, markAsRead, markAllAsRead, getUnreadCount
};