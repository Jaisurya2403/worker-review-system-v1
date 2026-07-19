const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notificationController');
const { verifyAdmin, verifyStore } = require('../middleware/authMiddleware');

// ── Admin routes ──────────────────────────────────────────
router.post  ('/admin/send',           verifyAdmin, ctrl.sendNotification);
router.get   ('/admin/store/:storeId', verifyAdmin, ctrl.getStoreNotifications);
router.delete('/admin/:id',            verifyAdmin, ctrl.deleteNotification);

// ── Store routes (read-all MUST be before :id/read) ───────
router.get('/store/unread-count',  verifyStore, ctrl.getUnreadCount);
router.get('/store/my',            verifyStore, ctrl.getMyNotifications);
router.put('/store/read-all',      verifyStore, ctrl.markAllAsRead);
router.put('/store/:id/read',      verifyStore, ctrl.markAsRead);

module.exports = router;
