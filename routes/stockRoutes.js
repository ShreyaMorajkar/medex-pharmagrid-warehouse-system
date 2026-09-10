const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const stockController = require('../controllers/stockController');
const auditController = require('../controllers/auditController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const stockInValidation = [
  body('warehouseId').isMongoId().withMessage('Valid warehouse ID is required'),
  body('itemId').isMongoId().withMessage('Valid item ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be an integer >= 1'),
  handleValidationErrors
];

const stockOutValidation = [
  body('warehouseId').isMongoId().withMessage('Valid warehouse ID is required'),
  body('itemId').isMongoId().withMessage('Valid item ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be an integer >= 1'),
  handleValidationErrors
];

const adjustmentValidation = [
  body('warehouseId').isMongoId().withMessage('Valid warehouse ID is required'),
  body('itemId').isMongoId().withMessage('Valid item ID is required'),
  body('adjustmentType').isIn(['ADJUSTMENT_ADD', 'ADJUSTMENT_DEDUCT']).withMessage('Invalid adjustmentType'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be an integer >= 1'),
  body('reasonCode').notEmpty().withMessage('Reason code is required'),
  handleValidationErrors
];

router.use(authenticate);

// Stock In / Out
router.post('/in', stockInValidation, stockController.recordStockIn);
router.post('/out', stockOutValidation, stockController.recordStockOut);

// Stock Balances (Running Balance Engine)
router.get('/balance', stockController.getStockBalances);

// Stock Audit / Physical Adjustment
router.post('/adjust', authorize('MANAGER', 'ADMIN'), adjustmentValidation, auditController.recordAdjustment);

module.exports = router;
