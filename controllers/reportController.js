const StockBalance = require('../models/StockBalance');
const StockMovement = require('../models/StockMovement');
const Warehouse = require('../models/Warehouse');
const Item = require('../models/Item');

// @desc    Get Low Stock Alerts and Reorder Suggestions
// @route   GET /api/reports/low-stock
// @access  Private (All Roles)
exports.getLowStockAlerts = async (req, res, next) => {
  try {
    const balances = await StockBalance.find()
      .populate('warehouseId', 'name code location type')
      .populate('itemId', 'sku name category unit unitPrice reorderPoint reorderQuantity requiresColdChain');

    const lowStockItems = [];

    for (const b of balances) {
      if (!b.itemId || !b.warehouseId) continue;

      // Warehouse-level threshold is approximately 25% of global reorder point
      const threshold = Math.ceil(b.itemId.reorderPoint / 4);
      if (b.quantity <= threshold) {
        const shortage = Math.max(0, threshold - b.quantity);
        const suggestedReorder = shortage + b.itemId.reorderQuantity;

        lowStockItems.push({
          warehouse: {
            id: b.warehouseId._id,
            name: b.warehouseId.name,
            code: b.warehouseId.code,
            location: b.warehouseId.location
          },
          item: {
            id: b.itemId._id,
            sku: b.itemId.sku,
            name: b.itemId.name,
            category: b.itemId.category,
            unit: b.itemId.unit,
            unitPrice: b.itemId.unitPrice,
            reorderPoint: b.itemId.reorderPoint,
            requiresColdChain: b.itemId.requiresColdChain
          },
          currentStock: b.quantity,
          threshold,
          shortage,
          suggestedReorderQuantity: suggestedReorder,
          estimatedReorderCost: suggestedReorder * b.itemId.unitPrice,
          severity: b.quantity === 0 ? 'CRITICAL_OUT_OF_STOCK' : 'WARNING_LOW_STOCK'
        });
      }
    }

    return res.status(200).json({
      success: true,
      alertCount: lowStockItems.length,
      criticalCount: lowStockItems.filter((i) => i.severity === 'CRITICAL_OUT_OF_STOCK').length,
      data: lowStockItems
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Inventory Financial Valuation Report
// @route   GET /api/reports/valuation
// @access  Private (Manager / Admin)
exports.getValuationReport = async (req, res, next) => {
  try {
    const balances = await StockBalance.find()
      .populate('warehouseId', 'name code location')
      .populate('itemId', 'sku name category unit unitPrice');

    let totalValuation = 0;
    let totalUnits = 0;
    const categoryBreakdown = {};
    const warehouseBreakdown = {};

    for (const b of balances) {
      if (!b.itemId || !b.warehouseId) continue;

      const itemVal = b.quantity * (b.itemId.unitPrice || 0);
      totalValuation += itemVal;
      totalUnits += b.quantity;

      // Category aggregation
      const cat = b.itemId.category || 'OTHER';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { category: cat, totalUnits: 0, totalValuation: 0, distinctItems: 0 };
      }
      categoryBreakdown[cat].totalUnits += b.quantity;
      categoryBreakdown[cat].totalValuation += itemVal;
      categoryBreakdown[cat].distinctItems += 1;

      // Warehouse aggregation
      const whCode = b.warehouseId.code;
      if (!warehouseBreakdown[whCode]) {
        warehouseBreakdown[whCode] = {
          warehouseName: b.warehouseId.name,
          warehouseCode: whCode,
          totalUnits: 0,
          totalValuation: 0
        };
      }
      warehouseBreakdown[whCode].totalUnits += b.quantity;
      warehouseBreakdown[whCode].totalValuation += itemVal;
    }

    return res.status(200).json({
      success: true,
      summary: {
        totalValuation,
        totalUnits,
        currency: 'INR (₹)'
      },
      warehouseBreakdown: Object.values(warehouseBreakdown),
      categoryBreakdown: Object.values(categoryBreakdown)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Fast-Moving & Velocity Report
// @route   GET /api/reports/fast-moving
// @access  Private (Manager / Admin)
exports.getFastMovingReport = async (req, res, next) => {
  try {
    // Aggregate stock-out movements per item
    const movementAggregation = await StockMovement.aggregate([
      { $match: { type: 'STOCK_OUT' } },
      {
        $group: {
          _id: '$itemId',
          totalDispatchedUnits: { $sum: '$quantity' },
          dispatchEventsCount: { $sum: 1 },
          lastDispatchedAt: { $max: '$createdAt' }
        }
      },
      { $sort: { totalDispatchedUnits: -1 } },
      { $limit: 10 }
    ]);

    const populatedReport = await Promise.all(
      movementAggregation.map(async (row) => {
        const item = await Item.findById(row._id);
        return {
          itemId: row._id,
          sku: item ? item.sku : 'N/A',
          name: item ? item.name : 'Unknown Item',
          category: item ? item.category : 'N/A',
          unit: item ? item.unit : 'units',
          totalDispatchedUnits: row.totalDispatchedUnits,
          dispatchEventsCount: row.dispatchEventsCount,
          lastDispatchedAt: row.lastDispatchedAt
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: populatedReport.length,
      data: populatedReport
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Warehouse Capacity & Utilization Analytics
// @route   GET /api/reports/warehouse-utilization
// @access  Private (All Roles)
exports.getWarehouseUtilization = async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find().sort({ name: 1 });

    const report = await Promise.all(
      warehouses.map(async (wh) => {
        const balances = await StockBalance.find({ warehouseId: wh._id });
        const storedUnits = balances.reduce((sum, b) => sum + b.quantity, 0);
        const utilizationPct = wh.capacity > 0 ? Number(((storedUnits / wh.capacity) * 100).toFixed(1)) : 0;
        const distinctSKUs = balances.filter((b) => b.quantity > 0).length;

        let status = 'HEALTHY';
        if (utilizationPct > 90) status = 'NEAR_CAPACITY';
        else if (utilizationPct < 20) status = 'UNDERUTILIZED';

        return {
          warehouseId: wh._id,
          code: wh.code,
          name: wh.name,
          city: wh.location.city,
          capacity: wh.capacity,
          storedUnits,
          availableUnits: Math.max(0, wh.capacity - storedUnits),
          utilizationPercentage: utilizationPct,
          distinctSKUs,
          temperatureControlled: wh.temperatureControlled,
          tempRange: wh.tempRange,
          status
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};
