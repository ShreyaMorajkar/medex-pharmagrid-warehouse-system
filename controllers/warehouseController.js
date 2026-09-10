const Warehouse = require('../models/Warehouse');
const StockBalance = require('../models/StockBalance');

// @desc    Create a new warehouse
// @route   POST /api/warehouses
// @access  Private (Admin)
exports.createWarehouse = async (req, res, next) => {
  try {
    const { code, name, location, capacity, type, temperatureControlled, tempRange, managerId, status } = req.body;

    const existingCode = await Warehouse.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      return res.status(409).json({
        success: false,
        message: `Warehouse with code '${code}' already exists.`,
        errorCode: 'DUPLICATE_WAREHOUSE_CODE'
      });
    }

    const warehouse = await Warehouse.create({
      code: code.toUpperCase(),
      name,
      location,
      capacity,
      type,
      temperatureControlled: temperatureControlled || false,
      tempRange,
      managerId: managerId || null,
      status: status || 'ACTIVE'
    });

    return res.status(201).json({
      success: true,
      message: 'Warehouse created successfully',
      data: warehouse
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all warehouses with real-time capacity utilization
// @route   GET /api/warehouses
// @access  Private (All Roles)
exports.getWarehouses = async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find().populate('managerId', 'name email').sort({ name: 1 });

    // Calculate current stock utilization per warehouse
    const warehouseSummaries = await Promise.all(
      warehouses.map(async (wh) => {
        const balances = await StockBalance.find({ warehouseId: wh._id });
        const currentStockUnits = balances.reduce((sum, b) => sum + b.quantity, 0);
        const utilizationPct = wh.capacity > 0 ? ((currentStockUnits / wh.capacity) * 100).toFixed(1) : 0;
        const distinctSKUs = balances.filter((b) => b.quantity > 0).length;

        return {
          ...wh.toObject(),
          currentStockUnits,
          utilizationPct: Number(utilizationPct),
          availableCapacity: Math.max(0, wh.capacity - currentStockUnits),
          distinctSKUs
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: warehouseSummaries.length,
      data: warehouseSummaries
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single warehouse by ID with detailed stock breakdown
// @route   GET /api/warehouses/:id
// @access  Private (All Roles)
exports.getWarehouseById = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id).populate('managerId', 'name email');
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: `Warehouse with ID '${req.params.id}' not found`,
        errorCode: 'WAREHOUSE_NOT_FOUND'
      });
    }

    const balances = await StockBalance.find({ warehouseId: warehouse._id })
      .populate('itemId', 'sku name category unit unitPrice reorderPoint requiresColdChain')
      .sort({ quantity: -1 });

    const currentStockUnits = balances.reduce((sum, b) => sum + b.quantity, 0);
    const utilizationPct = warehouse.capacity > 0 ? ((currentStockUnits / warehouse.capacity) * 100).toFixed(1) : 0;

    return res.status(200).json({
      success: true,
      data: {
        warehouse,
        currentStockUnits,
        utilizationPct: Number(utilizationPct),
        availableCapacity: Math.max(0, warehouse.capacity - currentStockUnits),
        stockBalances: balances
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update warehouse details
// @route   PUT /api/warehouses/:id
// @access  Private (Admin)
exports.updateWarehouse = async (req, res, next) => {
  try {
    const { name, location, capacity, type, temperatureControlled, tempRange, managerId, status } = req.body;

    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: `Warehouse with ID '${req.params.id}' not found`,
        errorCode: 'WAREHOUSE_NOT_FOUND'
      });
    }

    // If capacity is reduced, check if current stock exceeds new capacity
    if (capacity && capacity < warehouse.capacity) {
      const balances = await StockBalance.find({ warehouseId: warehouse._id });
      const currentStockUnits = balances.reduce((sum, b) => sum + b.quantity, 0);
      if (currentStockUnits > capacity) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce capacity to ${capacity} units. Current stored stock is ${currentStockUnits} units.`,
          errorCode: 'CAPACITY_REDUCTION_CONFLICT'
        });
      }
    }

    if (name) warehouse.name = name;
    if (location) warehouse.location = location;
    if (capacity) warehouse.capacity = capacity;
    if (type) warehouse.type = type;
    if (temperatureControlled !== undefined) warehouse.temperatureControlled = temperatureControlled;
    if (tempRange) warehouse.tempRange = tempRange;
    if (managerId !== undefined) warehouse.managerId = managerId || null;
    if (status) warehouse.status = status;

    await warehouse.save();

    return res.status(200).json({
      success: true,
      message: 'Warehouse updated successfully',
      data: warehouse
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete warehouse
// @route   DELETE /api/warehouses/:id
// @access  Private (Admin)
exports.deleteWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: `Warehouse with ID '${req.params.id}' not found`,
        errorCode: 'WAREHOUSE_NOT_FOUND'
      });
    }

    // Check if there is active stock stored
    const balances = await StockBalance.find({ warehouseId: warehouse._id, quantity: { $gt: 0 } });
    if (balances.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete warehouse with active inventory. Transfer or adjust stock to 0 first.',
        errorCode: 'WAREHOUSE_HAS_STOCK'
      });
    }

    await Warehouse.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: `Warehouse '${warehouse.name}' deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};
