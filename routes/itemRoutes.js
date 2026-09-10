const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const itemValidation = [
  body('sku').trim().notEmpty().withMessage('SKU code is required'),
  body('name').trim().notEmpty().withMessage('Item name is required'),
  body('category')
    .isIn(['VACCINES', 'ANTIBIOTICS', 'CRITICAL_CARE', 'COLD_CHAIN', 'MEDICAL_DEVICES', 'CONSUMABLES'])
    .withMessage('Valid category is required'),
  body('unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be a non-negative number'),
  body('reorderPoint').optional().isInt({ min: 0 }).withMessage('Reorder point must be a non-negative integer'),
  handleValidationErrors
];

router.use(authenticate);

router.route('/')
  .get(itemController.getItems)
  .post(authorize('ADMIN', 'MANAGER'), itemValidation, itemController.createItem);

router.route('/:id')
  .get(itemController.getItemById)
  .put(authorize('ADMIN', 'MANAGER'), itemController.updateItem)
  .delete(authorize('ADMIN'), itemController.deleteItem);

module.exports = router;
