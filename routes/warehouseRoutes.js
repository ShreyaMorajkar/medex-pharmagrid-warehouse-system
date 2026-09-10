const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const warehouseValidation = [
  body('code').trim().notEmpty().withMessage('Warehouse code is required'),
  body('name').trim().notEmpty().withMessage('Warehouse name is required'),
  body('location.city').notEmpty().withMessage('Location city is required'),
  body('location.state').notEmpty().withMessage('Location state is required'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
  handleValidationErrors
];

router.use(authenticate);

router.route('/')
  .get(warehouseController.getWarehouses)
  .post(authorize('ADMIN'), warehouseValidation, warehouseController.createWarehouse);

router.route('/:id')
  .get(warehouseController.getWarehouseById)
  .put(authorize('ADMIN'), warehouseController.updateWarehouse)
  .delete(authorize('ADMIN'), warehouseController.deleteWarehouse);

module.exports = router;
