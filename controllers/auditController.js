const Warehouse = require('../models/Warehouse');
const Item = require('../models/Item');
const StockBalance = require('../models/StockBalance');
const StockMovement = require('../models/StockMovement');

// @desc    Record Stock Audit / Physical Count Adjustment
// @route   POST /api/stock/adjust
// @access  Private (Manager / Admin)
exports.recordAdjustment = async (req, res, next) => {
  try {
    const { warehouseId, itemId, adjustmentType, quantity, reasonCode, batchNo, notes } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (!parsedQty || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Adjustment quantity must be a positive integer',
        errorCode: 'INVALID_QUANTITY'
      });
    }

    if (!['ADJUSTMENT_ADD', 'ADJUSTMENT_DEDUCT'].includes(adjustmentType)) {
      return res.status(400).json({
        success: false,
        message: "adjustmentType must be either 'ADJUSTMENT_ADD' (increase) or 'ADJUSTMENT_DEDUCT' (decrease)",
        errorCode: 'INVALID_ADJUSTMENT_TYPE'
      });
    }

    const validReasonCodes = [
      'DAMAGED_COLD_CHAIN',
      'EXPIRED_LOT',
      'THEFT_LOSS',
      'AUDIT_CORRECTION',
      'OTHER'
    ];

    if (!validReasonCodes.includes(reasonCode)) {
      return res.status(400).json({
        success: false,
        message: `Invalid reasonCode. Allowed: ${validReasonCodes.join(', ')}`,
        errorCode: 'INVALID_REASON_CODE'
      });
    }

    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found',
        errorCode: 'WAREHOUSE_NOT_FOUND'
      });
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
        errorCode: 'ITEM_NOT_FOUND'
      });
    }

    let balanceRecord = await StockBalance.findOne({ warehouseId: warehouse._id, itemId: item._id });
    const balanceBefore = balanceRecord ? balanceRecord.quantity : 0;
    let balanceAfter = balanceBefore;

    if (adjustmentType === 'ADJUSTMENT_DEDUCT') {
      if (balanceBefore < parsedQty) {
        return res.status(400).json({
          success: false,
          message: `Cannot deduct ${parsedQty} units. Current stock at ${warehouse.name} is only ${balanceBefore} units.`,
          errorCode: 'INSUFFICIENT_STOCK_FOR_DEDUCTION'
        });
      }
      balanceAfter = balanceBefore - parsedQty;
    } else {
      // Check capacity
      const allBalances = await StockBalance.find({ warehouseId: warehouse._id });
      const currentUnits = allBalances.reduce((sum, b) => sum + b.quantity, 0);
      if (currentUnits + parsedQty > warehouse.capacity) {
        return res.status(400).json({
          success: false,
          message: 'Adjustment would exceed warehouse total capacity',
          errorCode: 'CAPACITY_EXCEEDED'
        });
      }
      balanceAfter = balanceBefore + parsedQty;
    }

    if (!balanceRecord) {
      balanceRecord = new StockBalance({
        warehouseId: warehouse._id,
        itemId: item._id,
        quantity: balanceAfter,
        batches: [],
        lastUpdated: new Date()
      });
    } else {
      balanceRecord.quantity = balanceAfter;
      balanceRecord.lastUpdated = new Date();
    }

    await balanceRecord.save();

    const auditRef = `AUD-${Date.now().toString().slice(-6)}`;
    const movement = await StockMovement.create({
      warehouseId: warehouse._id,
      itemId: item._id,
      type: adjustmentType,
      quantity: parsedQty,
      balanceBefore,
      balanceAfter,
      batchNo: batchNo || 'AUDIT-ADJ',
      referenceNumber: auditRef,
      reasonCode,
      notes: notes || `Physical count adjustment by ${req.user.name}`,
      performedBy: req.user._id
    });

    return res.status(200).json({
      success: true,
      message: `Stock adjustment recorded: ${adjustmentType === 'ADJUSTMENT_ADD' ? '+' : '-'}${parsedQty} ${item.unit} at ${warehouse.name}`,
      data: {
        movement,
        balance: {
          warehouseName: warehouse.name,
          itemName: item.name,
          balanceBefore,
          balanceAfter
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Movement History Audit Log
// @route   GET /api/movements
// @access  Private (All Roles)
exports.getMovements = async (req, res, next) => {
  try {
    const { warehouseId, itemId, type, reasonCode, page = 1, limit = 50 } = req.query;
    let query = {};

    if (warehouseId) query.warehouseId = warehouseId;
    if (itemId) query.itemId = itemId;
    if (type) query.type = type;
    if (reasonCode) query.reasonCode = reasonCode;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const movements = await StockMovement.find(query)
      .populate('warehouseId', 'name code location')
      .populate('itemId', 'sku name category unit unitPrice')
      .populate('performedBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await StockMovement.countDocuments(query);

    return res.status(200).json({
      success: true,
      count: movements.length,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      data: movements
    });
  } catch (error) {
    next(error);
  }
};
