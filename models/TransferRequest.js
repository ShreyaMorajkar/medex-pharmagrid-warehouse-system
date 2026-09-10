const mongoose = require('mongoose');

const transferRequestSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    fromWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Source warehouse ID is required']
    },
    toWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Destination warehouse ID is required']
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: [true, 'Item ID is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Transfer quantity is required'],
      min: [1, 'Transfer quantity must be at least 1']
    },
    batchNo: {
      type: String,
      trim: true,
      uppercase: true
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'],
        message: '{VALUE} is not a valid transfer status'
      },
      default: 'PENDING'
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester ID is required']
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    decisionRemarks: {
      type: String,
      trim: true
    },
    reason: {
      type: String,
      trim: true
    },
    dispatchedAt: {
      type: Date
    },
    receivedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

transferRequestSchema.index({ status: 1 });
transferRequestSchema.index({ fromWarehouseId: 1 });
transferRequestSchema.index({ toWarehouseId: 1 });
transferRequestSchema.index({ itemId: 1 });

module.exports = mongoose.model('TransferRequest', transferRequestSchema);
