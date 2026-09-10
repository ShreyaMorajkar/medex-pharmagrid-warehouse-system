const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// Low-stock alert report & reorder suggestions
router.get('/low-stock', reportController.getLowStockAlerts);

// Warehouse utilization report
router.get('/warehouse-utilization', reportController.getWarehouseUtilization);

// Financial Valuation (Manager / Admin only)
router.get('/valuation', authorize('MANAGER', 'ADMIN'), reportController.getValuationReport);

// Fast-Moving SKU velocity report (Manager / Admin only)
router.get('/fast-moving', authorize('MANAGER', 'ADMIN'), reportController.getFastMovingReport);

module.exports = router;
