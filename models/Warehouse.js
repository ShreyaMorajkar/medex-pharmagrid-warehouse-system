const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Warehouse code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [20, 'Code cannot exceed 20 characters']
    },
    name: {
      type: String,
      required: [true, 'Warehouse name is required'],
      trim: true,
      maxlength: [120, 'Name cannot exceed 120 characters']
    },
    location: {
      city: { type: String, required: [true, 'City is required'], trim: true },
      state: { type: String, required: [true, 'State is required'], trim: true },
      address: { type: String, trim: true }
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1 unit']
    },
    type: {
      type: String,
      enum: {
        values: ['CENTRAL_HUB', 'COLD_CHAIN', 'REGIONAL_DEPOT', 'TRANSIT_VAULT'],
        message: '{VALUE} is not a valid warehouse type'
      },
      default: 'REGIONAL_DEPOT'
    },
    temperatureControlled: {
      type: Boolean,
      default: false
    },
    tempRange: {
      type: String,
      default: 'Ambient (15°C - 25°C)'
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'],
        message: '{VALUE} is not a valid status'
      },
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true
  }
);

warehouseSchema.index({ name: 1 });
warehouseSchema.index({ status: 1 });

module.exports = mongoose.model('Warehouse', warehouseSchema);
