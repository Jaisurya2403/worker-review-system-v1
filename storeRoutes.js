const express = require('express');
const router  = express.Router();
const storeController = require('../controllers/storeController');
const { verifyStore }  = require('../middleware/authMiddleware');
const { checkSubscription } = require('../middleware/subscriptionMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post('/login', storeController.login);

router.get ('/dashboard',       verifyStore, checkSubscription, storeController.getDashboard);
router.post('/workers',         verifyStore, checkSubscription, upload.single('image'), storeController.addWorker);
router.get ('/workers',         verifyStore, checkSubscription, storeController.getWorkers);
router.put ('/workers/:id',     verifyStore, checkSubscription, upload.single('image'), storeController.updateWorker);
router.delete('/workers/:id',   verifyStore, checkSubscription, storeController.deleteWorker);
router.get ('/reviews',         verifyStore, checkSubscription, storeController.getReviews);
router.get ('/reviews/stats',   verifyStore, checkSubscription, storeController.getReviewStats);
router.get('/analytics', verifyStore, checkSubscription, storeController.getAnalytics);

module.exports = router;
