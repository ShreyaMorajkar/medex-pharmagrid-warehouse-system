const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse ID is required']
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: [true, 'Item ID is required']
    },
    type: {
      type: String,
      required: [true, 'Movement type is required'],
      enum: {
        values: [
          'STOCK_IN',
          'STOCK_OUT',
          'TRANSFER_OUT',
          'TRANSFER_IN',
          'ADJUSTMENT_ADD',
          'ADJUSTMENT_DEDUCT'
        ],
        message: '{VALUE} is not a valid movement type'
      }
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    balanceBefore: {
      type: Number,
      required: [true, 'Balance before is required'],
      min: [0, 'Balance before cannot be negative']
    },
    balanceAfter: {
      type: Number,
      required: [true, 'Balance after is required'],
      min: [0, 'Balance after cannot be negative']
    },
    batchNo: {
      type: String,
      trim: true,
      uppercase: true
    },
    referenceNumber: {
      type: String,
      trim: true
    },
    reasonCode: {
      type: String,
      enum: {
        values: [
          'PURCHASE_RECEIPT',
          'CUSTOMER_DISPATCH',
          'INTERNAL_TRANSFER',
          'DAMAGED_COLD_CHAIN',
          'EXPIRED_LOT',
          'THEFT_LOSS',
          'AUDIT_CORRECTION',
          'OTHER'
        ],
        message: '{VALUE} is not a valid reason code'
      },
      default: 'PURCHASE_RECEIPT'
    },
    notes: {
      type: String,
      trim: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    }
  },
  {
    timestamps: true
  }
);

stockMovementSchema.index({ warehouseId: 1, createdAt: -1 });
stockMovementSchema.index({ itemId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1 });
stockMovementSchema.index({ performedBy: 1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
