const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, 'SKU code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [30, 'SKU cannot exceed 30 characters']
    },
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [150, 'Item name cannot exceed 150 characters']
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['VACCINES', 'ANTIBIOTICS', 'CRITICAL_CARE', 'COLD_CHAIN', 'MEDICAL_DEVICES', 'CONSUMABLES'],
        message: '{VALUE} is not a valid category'
      }
    },
    unit: {
      type: String,
      required: [true, 'Unit of measure is required'],
      enum: {
        values: ['vials', 'boxes', 'bottles', 'units', 'strips', 'cartons'],
        message: '{VALUE} is not a valid unit'
      },
      default: 'units'
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    reorderPoint: {
      type: Number,
      required: [true, 'Reorder point threshold is required'],
      min: [0, 'Reorder point cannot be negative'],
      default: 100
    },
    reorderQuantity: {
      type: Number,
      min: [1, 'Reorder quantity must be at least 1'],
      default: 200
    },
    requiresColdChain: {
      type: Boolean,
      default: false
    },
    tempRange: {
      type: String,
      default: 'Ambient (15°C - 25°C)'
    },
    description: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

itemSchema.index({ category: 1 });
itemSchema.index({ name: 1 });

module.exports = mongoose.model('Item', itemSchema);
