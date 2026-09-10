const TransferRequest = require('../models/TransferRequest');
const Warehouse = require('../models/Warehouse');
const Item = require('../models/Item');
const StockBalance = require('../models/StockBalance');
const StockMovement = require('../models/StockMovement');

// @desc    Create an Inter-Warehouse Transfer Request
// @route   POST /api/transfers
// @access  Private (Staff / Manager / Admin)
exports.createTransferRequest = async (req, res, next) => {
  try {
    const { fromWarehouseId, toWarehouseId, itemId, quantity, batchNo, reason } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (!parsedQty || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Transfer quantity must be a positive integer',
        errorCode: 'INVALID_QUANTITY'
      });
    }

    // 1. Cannot transfer to same warehouse
    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({
        success: false,
        message: 'Source and destination warehouses cannot be the same.',
        errorCode: 'IDENTICAL_WAREHOUSES'
      });
    }

    // 2. Validate Warehouses
    const fromWarehouse = await Warehouse.findById(fromWarehouseId);
    const toWarehouse = await Warehouse.findById(toWarehouseId);

    if (!fromWarehouse || fromWarehouse.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Source warehouse is invalid or inactive.',
        errorCode: 'SOURCE_WAREHOUSE_INVALID'
      });
    }

    if (!toWarehouse || toWarehouse.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Destination warehouse is invalid or inactive.',
        errorCode: 'DESTINATION_WAREHOUSE_INVALID'
      });
    }

    // 3. Validate Item & Cold-Chain compatibility at destination
    const item = await Item.findById(itemId);
    if (!item || !item.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Item is invalid or inactive.',
        errorCode: 'ITEM_INVALID'
      });
    }

    if (item.requiresColdChain && !toWarehouse.temperatureControlled) {
      return res.status(400).json({
        success: false,
        message: `Destination warehouse '${toWarehouse.name}' is not equipped for cold-chain item '${item.name}'.`,
        errorCode: 'COLD_CHAIN_UNSUPPORTED'
      });
    }

    // 4. Check available stock at source
    const sourceBalance = await StockBalance.findOne({ warehouseId: fromWarehouse._id, itemId: item._id });
    const availableStock = sourceBalance ? sourceBalance.quantity : 0;

    if (availableStock < parsedQty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock at source warehouse '${fromWarehouse.name}'. Available: ${availableStock}, Requested: ${parsedQty}.`,
        errorCode: 'INSUFFICIENT_SOURCE_STOCK'
      });
    }

    // 5. Generate Transfer Number (TRF-YYYY-XXXX)
    const count = await TransferRequest.countDocuments();
    const transferNumber = `TRF-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const transfer = await TransferRequest.create({
      transferNumber,
      fromWarehouseId: fromWarehouse._id,
      toWarehouseId: toWarehouse._id,
      itemId: item._id,
      quantity: parsedQty,
      batchNo: batchNo || 'AUTO-SELECT',
      status: 'PENDING',
      requestedBy: req.user._id,
      reason: reason || 'Inventory balancing between facilities'
    });

    const populatedTransfer = await TransferRequest.findById(transfer._id)
      .populate('fromWarehouseId', 'name code location')
      .populate('toWarehouseId', 'name code location')
      .populate('itemId', 'sku name unit')
      .populate('requestedBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: `Transfer request ${transferNumber} created and pending manager approval.`,
      data: populatedTransfer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all transfer requests with filters
// @route   GET /api/transfers
// @access  Private (All Roles)
exports.getTransferRequests = async (req, res, next) => {
  try {
    const { status, warehouseId } = req.query;
    let query = {};

    if (status) query.status = status;
    if (warehouseId) {
      query.$or = [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }];
    }

    const transfers = await TransferRequest.find(query)
      .populate('fromWarehouseId', 'name code location')
      .populate('toWarehouseId', 'name code location')
      .populate('itemId', 'sku name unit unitPrice requiresColdChain')
      .populate('requestedBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: transfers.length,
      data: transfers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manager approves or rejects transfer request
// @route   PUT /api/transfers/:id/decision
// @access  Private (Manager / Admin)
exports.decideTransfer = async (req, res, next) => {
  try {
    const { status, decisionRemarks } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'APPROVED' or 'REJECTED'",
        errorCode: 'INVALID_STATUS'
      });
    }

    const transfer = await TransferRequest.findById(req.params.id)
      .populate('fromWarehouseId', 'name code')
      .populate('toWarehouseId', 'name code')
      .populate('itemId', 'name sku unit');

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer request not found',
        errorCode: 'TRANSFER_NOT_FOUND'
      });
    }

    if (transfer.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot decide transfer with status '${transfer.status}'. Only PENDING transfers can be approved/rejected.`,
        errorCode: 'INVALID_TRANSITION'
      });
    }

    transfer.status = status;
    transfer.approvedBy = req.user._id;
    transfer.decisionRemarks = decisionRemarks || `Transfer ${status.toLowerCase()} by ${req.user.name}`;
    await transfer.save();

    return res.status(200).json({
      success: true,
      message: `Transfer ${transfer.transferNumber} has been ${status.toLowerCase()}`,
      data: transfer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Dispatch approved transfer (Moves stock out of source to IN_TRANSIT)
// @route   PUT /api/transfers/:id/dispatch
// @access  Private (Staff / Manager / Admin)
exports.dispatchTransfer = async (req, res, next) => {
  try {
    const transfer = await TransferRequest.findById(req.params.id)
      .populate('fromWarehouseId')
      .populate('toWarehouseId')
      .populate('itemId');

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer request not found',
        errorCode: 'TRANSFER_NOT_FOUND'
      });
    }

    if (transfer.status !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: `Only APPROVED transfers can be dispatched. Current status is '${transfer.status}'.`,
        errorCode: 'INVALID_TRANSITION'
      });
    }

    // Deduct stock from source warehouse
    const sourceBalance = await StockBalance.findOne({
      warehouseId: transfer.fromWarehouseId._id,
      itemId: transfer.itemId._id
    });

    if (!sourceBalance || sourceBalance.quantity < transfer.quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock at source warehouse to dispatch transfer. Available: ${sourceBalance?.quantity || 0}, Required: ${transfer.quantity}`,
        errorCode: 'INSUFFICIENT_STOCK'
      });
    }

    const balBefore = sourceBalance.quantity;
    const balAfter = balBefore - transfer.quantity;

    sourceBalance.quantity = balAfter;
    sourceBalance.lastUpdated = new Date();
    await sourceBalance.save();

    // Log StockMovement for source warehouse
    await StockMovement.create({
      warehouseId: transfer.fromWarehouseId._id,
      itemId: transfer.itemId._id,
      type: 'TRANSFER_OUT',
      quantity: transfer.quantity,
      balanceBefore: balBefore,
      balanceAfter: balAfter,
      batchNo: transfer.batchNo,
      referenceNumber: transfer.transferNumber,
      reasonCode: 'INTERNAL_TRANSFER',
      notes: `Dispatched transfer to ${transfer.toWarehouseId.name}`,
      performedBy: req.user._id
    });

    transfer.status = 'IN_TRANSIT';
    transfer.dispatchedAt = new Date();
    await transfer.save();

    return res.status(200).json({
      success: true,
      message: `Transfer ${transfer.transferNumber} dispatched and is now IN_TRANSIT.`,
      data: transfer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Receive in-transit transfer at destination warehouse (Completes transfer)
// @route   PUT /api/transfers/:id/receive
// @access  Private (Staff / Manager / Admin)
exports.receiveTransfer = async (req, res, next) => {
  try {
    const transfer = await TransferRequest.findById(req.params.id)
      .populate('fromWarehouseId')
      .populate('toWarehouseId')
      .populate('itemId');

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer request not found',
        errorCode: 'TRANSFER_NOT_FOUND'
      });
    }

    if (transfer.status !== 'IN_TRANSIT') {
      return res.status(400).json({
        success: false,
        message: `Only IN_TRANSIT transfers can be received. Current status is '${transfer.status}'.`,
        errorCode: 'INVALID_TRANSITION'
      });
    }

    // Check destination warehouse capacity
    const destBalances = await StockBalance.find({ warehouseId: transfer.toWarehouseId._id });
    const currentDestUnits = destBalances.reduce((sum, b) => sum + b.quantity, 0);

    if (currentDestUnits + transfer.quantity > transfer.toWarehouseId.capacity) {
      return res.status(400).json({
        success: false,
        message: `Destination warehouse capacity exceeded! Cannot receive shipment.`,
        errorCode: 'CAPACITY_EXCEEDED'
      });
    }

    // Add stock to destination balance
    let destBalance = await StockBalance.findOne({
      warehouseId: transfer.toWarehouseId._id,
      itemId: transfer.itemId._id
    });

    const balBefore = destBalance ? destBalance.quantity : 0;
    const balAfter = balBefore + transfer.quantity;

    if (!destBalance) {
      destBalance = new StockBalance({
        warehouseId: transfer.toWarehouseId._id,
        itemId: transfer.itemId._id,
        quantity: transfer.quantity,
        batches: [
          {
            batchNo: transfer.batchNo || `LOT-TRF-${Date.now().toString().slice(-4)}`,
            quantity: transfer.quantity,
            expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000)
          }
        ],
        lastUpdated: new Date()
      });
    } else {
      destBalance.quantity = balAfter;
      destBalance.lastUpdated = new Date();
      destBalance.batches.push({
        batchNo: transfer.batchNo || `LOT-TRF-${Date.now().toString().slice(-4)}`,
        quantity: transfer.quantity,
        expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000)
      });
    }

    await destBalance.save();

    // Log StockMovement for destination warehouse
    await StockMovement.create({
      warehouseId: transfer.toWarehouseId._id,
      itemId: transfer.itemId._id,
      type: 'TRANSFER_IN',
      quantity: transfer.quantity,
      balanceBefore: balBefore,
      balanceAfter: balAfter,
      batchNo: transfer.batchNo,
      referenceNumber: transfer.transferNumber,
      reasonCode: 'INTERNAL_TRANSFER',
      notes: `Received transfer from ${transfer.fromWarehouseId.name}`,
      performedBy: req.user._id
    });

    transfer.status = 'COMPLETED';
    transfer.receivedAt = new Date();
    await transfer.save();

    return res.status(200).json({
      success: true,
      message: `Transfer ${transfer.transferNumber} received successfully at ${transfer.toWarehouseId.name}. Transfer completed.`,
      data: transfer
    });
  } catch (error) {
    next(error);
  }
};
