const Warehouse = require('../models/Warehouse');
const Item = require('../models/Item');
const StockBalance = require('../models/StockBalance');
const StockMovement = require('../models/StockMovement');

// @desc    Record Stock-In (Purchases / Inbound Shipments)
// @route   POST /api/stock/in
// @access  Private (Staff / Manager / Admin)
exports.recordStockIn = async (req, res, next) => {
  try {
    const { warehouseId, itemId, quantity, batchNo, expiryDate, referenceNumber, notes, reasonCode } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (!parsedQty || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock-in quantity must be a positive integer greater than 0',
        errorCode: 'INVALID_QUANTITY'
      });
    }

    // 1. Verify Warehouse existence & status
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse || warehouse.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Invalid warehouse selected or warehouse is inactive.',
        errorCode: 'WAREHOUSE_INACTIVE'
      });
    }

    // 2. Verify Item existence & active status
    const item = await Item.findById(itemId);
    if (!item || !item.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item selected or item is inactive.',
        errorCode: 'ITEM_INACTIVE'
      });
    }

    // 3. Cold-chain compatibility check
    if (item.requiresColdChain && !warehouse.temperatureControlled) {
      return res.status(400).json({
        success: false,
        message: `Cold-chain violation: Item '${item.name}' requires temperature control, but warehouse '${warehouse.name}' is not temperature-controlled.`,
        errorCode: 'COLD_CHAIN_MISMATCH'
      });
    }

    // 4. Warehouse Capacity Check
    const allBalances = await StockBalance.find({ warehouseId: warehouse._id });
    const currentTotalUnits = allBalances.reduce((sum, b) => sum + b.quantity, 0);

    if (currentTotalUnits + parsedQty > warehouse.capacity) {
      return res.status(400).json({
        success: false,
        message: `Warehouse capacity exceeded! Current stock: ${currentTotalUnits}, Max capacity: ${warehouse.capacity}, Incoming: ${parsedQty}. Available space: ${warehouse.capacity - currentTotalUnits} units.`,
        errorCode: 'CAPACITY_EXCEEDED'
      });
    }

    // 5. Update Running Stock Balance (Upsert)
    let balanceRecord = await StockBalance.findOne({ warehouseId: warehouse._id, itemId: item._id });
    const balanceBefore = balanceRecord ? balanceRecord.quantity : 0;
    const balanceAfter = balanceBefore + parsedQty;

    const formattedBatch = (batchNo || `LOT-${Date.now().toString().slice(-6)}`).toUpperCase();

    if (!balanceRecord) {
      balanceRecord = new StockBalance({
        warehouseId: warehouse._id,
        itemId: item._id,
        quantity: parsedQty,
        batches: [
          {
            batchNo: formattedBatch,
            quantity: parsedQty,
            expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          }
        ],
        lastUpdated: new Date()
      });
    } else {
      balanceRecord.quantity = balanceAfter;
      balanceRecord.lastUpdated = new Date();

      // Check if batch already exists in subdocument
      const existingBatch = balanceRecord.batches.find((b) => b.batchNo === formattedBatch);
      if (existingBatch) {
        existingBatch.quantity += parsedQty;
      } else {
        balanceRecord.batches.push({
          batchNo: formattedBatch,
          quantity: parsedQty,
          expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });
      }
    }

    await balanceRecord.save();

    // 6. Record Immutable Stock Movement Audit
    const movement = await StockMovement.create({
      warehouseId: warehouse._id,
      itemId: item._id,
      type: 'STOCK_IN',
      quantity: parsedQty,
      balanceBefore,
      balanceAfter,
      batchNo: formattedBatch,
      referenceNumber: referenceNumber || `PO-${Date.now().toString().slice(-6)}`,
      reasonCode: reasonCode || 'PURCHASE_RECEIPT',
      notes: notes || 'Inbound stock receipt confirmed',
      performedBy: req.user._id
    });

    return res.status(201).json({
      success: true,
      message: `Successfully received ${parsedQty} ${item.unit} of ${item.name} into ${warehouse.name}`,
      data: {
        movement,
        balance: {
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          itemId: item._id,
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

// @desc    Record Stock-Out (Sales Dispatch / Consumption)
// @route   POST /api/stock/out
// @access  Private (Staff / Manager / Admin)
exports.recordStockOut = async (req, res, next) => {
  try {
    const { warehouseId, itemId, quantity, batchNo, referenceNumber, reasonCode, notes } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (!parsedQty || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock-out quantity must be a positive integer greater than 0',
        errorCode: 'INVALID_QUANTITY'
      });
    }

    // 1. Verify Warehouse & Item
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse || warehouse.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Invalid warehouse selected or warehouse is inactive.',
        errorCode: 'WAREHOUSE_INACTIVE'
      });
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found.',
        errorCode: 'ITEM_NOT_FOUND'
      });
    }

    // 2. Fetch Running Stock Balance
    const balanceRecord = await StockBalance.findOne({ warehouseId: warehouse._id, itemId: item._id });
    const currentStock = balanceRecord ? balanceRecord.quantity : 0;

    // 3. Prevent Negative Stock
    if (currentStock < parsedQty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for '${item.name}' at '${warehouse.name}'. Available: ${currentStock} ${item.unit}, Requested: ${parsedQty} ${item.unit}.`,
        errorCode: 'INSUFFICIENT_STOCK'
      });
    }

    const balanceBefore = currentStock;
    const balanceAfter = currentStock - parsedQty;

    balanceRecord.quantity = balanceAfter;
    balanceRecord.lastUpdated = new Date();

    // Deduct from batches (FIFO or specific batch)
    if (batchNo) {
      const bIdx = balanceRecord.batches.findIndex((b) => b.batchNo === batchNo.toUpperCase());
      if (bIdx > -1) {
        balanceRecord.batches[bIdx].quantity = Math.max(0, balanceRecord.batches[bIdx].quantity - parsedQty);
      }
    } else if (balanceRecord.batches && balanceRecord.batches.length > 0) {
      let remainingToDeduct = parsedQty;
      for (const batch of balanceRecord.batches) {
        if (batch.quantity <= remainingToDeduct) {
          remainingToDeduct -= batch.quantity;
          batch.quantity = 0;
        } else {
          batch.quantity -= remainingToDeduct;
          remainingToDeduct = 0;
          break;
        }
      }
    }

    await balanceRecord.save();

    // 4. Record Immutable Stock Movement
    const movement = await StockMovement.create({
      warehouseId: warehouse._id,
      itemId: item._id,
      type: 'STOCK_OUT',
      quantity: parsedQty,
      balanceBefore,
      balanceAfter,
      batchNo: batchNo || 'FIFO-DISPATCH',
      referenceNumber: referenceNumber || `SO-${Date.now().toString().slice(-6)}`,
      reasonCode: reasonCode || 'CUSTOMER_DISPATCH',
      notes: notes || 'Outbound dispatch completed',
      performedBy: req.user._id
    });

    const isLowStockAfter = balanceAfter <= Math.ceil(item.reorderPoint / 4);

    return res.status(200).json({
      success: true,
      message: `Successfully dispatched ${parsedQty} ${item.unit} of ${item.name} from ${warehouse.name}`,
      data: {
        movement,
        balance: {
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          itemId: item._id,
          itemName: item.name,
          balanceBefore,
          balanceAfter,
          isLowStock: isLowStockAfter
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Running Stock Balances (All or Filtered)
// @route   GET /api/stock/balance
// @access  Private (All Roles)
exports.getStockBalances = async (req, res, next) => {
  try {
    const { warehouseId, itemId, lowStockOnly } = req.query;
    let filter = {};

    if (warehouseId) filter.warehouseId = warehouseId;
    if (itemId) filter.itemId = itemId;

    const balances = await StockBalance.find(filter)
      .populate('warehouseId', 'name code location type capacity')
      .populate('itemId', 'sku name category unit unitPrice reorderPoint requiresColdChain')
      .sort({ quantity: -1 });

    let results = balances.map((b) => {
      const item = b.itemId;
      const reorderThreshold = item ? Math.ceil(item.reorderPoint / 4) : 50;
      const isLowStock = b.quantity <= reorderThreshold;
      const stockValuation = item ? b.quantity * item.unitPrice : 0;

      let status = 'OPTIMAL';
      if (b.quantity === 0) status = 'OUT_OF_STOCK';
      else if (isLowStock) status = 'LOW_STOCK';

      return {
        _id: b._id,
        warehouseId: b.warehouseId,
        warehouse: b.warehouseId,
        itemId: b.itemId,
        item: b.itemId,
        quantity: b.quantity,
        batches: b.batches,
        status,
        isLowStock,
        stockValuation,
        lastUpdated: b.lastUpdated || b.updatedAt || new Date(),
        updatedAt: b.updatedAt || b.lastUpdated || new Date()
      };
    });

    if (lowStockOnly === 'true') {
      results = results.filter((r) => r.isLowStock || r.status === 'OUT_OF_STOCK');
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    next(error);
  }
};
