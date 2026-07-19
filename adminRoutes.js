const express = require('express');
const router  = express.Router();
const adminController = require('../controllers/adminController');
const { verifyAdmin }  = require('../middleware/authMiddleware');

// ── Public ────────────────────────────────────────────────
router.post('/login', adminController.login);

// ── Admin management (all require admin token) ────────────
router.get   ('/admins',              verifyAdmin, adminController.getAdmins);
router.post  ('/admins',              verifyAdmin, adminController.createAdmin);
router.put   ('/admins/:id/password', verifyAdmin, adminController.changeAdminPassword);
router.delete('/admins/:id',          verifyAdmin, adminController.deleteAdmin);

// ── Store management ──────────────────────────────────────
router.post  ('/stores',            verifyAdmin, adminController.createStore);
router.get   ('/stores',            verifyAdmin, adminController.getStores);
router.put('/stores/:id',           verifyAdmin, adminController.updateStore);
router.put   ('/stores/:id/status', verifyAdmin, adminController.updateStoreStatus);
// Add this line with the other store routes
router.put('/stores/:id/subscription', verifyAdmin, adminController.updateSubscription);
router.delete('/stores/:id',        verifyAdmin, adminController.deleteStore);

// ── Stats & reviews ───────────────────────────────────────
router.get   ('/stats',          verifyAdmin, adminController.getStats);
router.get   ('/reviews',        verifyAdmin, adminController.getAllReviews);
router.delete('/reviews/:id',    verifyAdmin, adminController.deleteReview);

module.exports = router;
