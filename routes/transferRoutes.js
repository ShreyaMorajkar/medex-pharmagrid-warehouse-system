const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const transferController = require('../controllers/transferController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const transferValidation = [
  body('fromWarehouseId').isMongoId().withMessage('Valid source warehouse ID is required'),
  body('toWarehouseId').isMongoId().withMessage('Valid destination warehouse ID is required'),
  body('itemId').isMongoId().withMessage('Valid item ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Transfer quantity must be >= 1'),
  handleValidationErrors
];

const decisionValidation = [
  body('status').isIn(['APPROVED', 'REJECTED']).withMessage("Status must be 'APPROVED' or 'REJECTED'"),
  handleValidationErrors
];

router.use(authenticate);

router.route('/')
  .get(transferController.getTransferRequests)
  .post(transferValidation, transferController.createTransferRequest);

// Workflow step: Manager Approve / Reject
router.put('/:id/decision', authorize('MANAGER', 'ADMIN'), decisionValidation, transferController.decideTransfer);

// Workflow step: Dispatch
router.put('/:id/dispatch', transferController.dispatchTransfer);

// Workflow step: Receive & Complete
router.put('/:id/receive', transferController.receiveTransfer);

module.exports = router;
