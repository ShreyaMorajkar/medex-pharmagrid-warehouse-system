const mongoose = require('mongoose');

const batchSubSchema = new mongoose.Schema(
  {
    batchNo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Batch quantity cannot be negative']
    },
    expiryDate: {
      type: Date
    },
    receivedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const stockBalanceSchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Stock balance cannot be negative'],
      default: 0
    },
    batches: [batchSubSchema],
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Compound index to ensure uniqueness and fast O(1) query per warehouse-item pair
stockBalanceSchema.index({ warehouseId: 1, itemId: 1 }, { unique: true });
stockBalanceSchema.index({ warehouseId: 1 });
stockBalanceSchema.index({ itemId: 1 });

module.exports = mongoose.model('StockBalance', stockBalanceSchema);
