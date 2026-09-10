const Item = require('../models/Item');
const StockBalance = require('../models/StockBalance');

// @desc    Create new inventory item / SKU
// @route   POST /api/items
// @access  Private (Admin / Manager)
exports.createItem = async (req, res, next) => {
  try {
    const {
      sku,
      name,
      category,
      unit,
      unitPrice,
      reorderPoint,
      reorderQuantity,
      requiresColdChain,
      tempRange,
      description
    } = req.body;

    const existingSKU = await Item.findOne({ sku: sku.toUpperCase() });
    if (existingSKU) {
      return res.status(409).json({
        success: false,
        message: `Item with SKU '${sku}' already exists.`,
        errorCode: 'DUPLICATE_SKU'
      });
    }

    const item = await Item.create({
      sku: sku.toUpperCase(),
      name,
      category,
      unit: unit || 'units',
      unitPrice,
      reorderPoint: reorderPoint !== undefined ? reorderPoint : 100,
      reorderQuantity: reorderQuantity || 200,
      requiresColdChain: requiresColdChain || false,
      tempRange: tempRange || (requiresColdChain ? '2°C to 8°C' : 'Ambient (15°C - 25°C)'),
      description
    });

    return res.status(201).json({
      success: true,
      message: 'Item SKU created successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all items with aggregated global stock and low stock status
// @route   GET /api/items
// @access  Private (All Roles)
exports.getItems = async (req, res, next) => {
  try {
    const { category, requiresColdChain, search } = req.query;
    let query = { isActive: true };

    if (category) query.category = category;
    if (requiresColdChain !== undefined) query.requiresColdChain = requiresColdChain === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    const items = await Item.find(query).sort({ name: 1 });

    // Aggregate global stock balance for each item
    const itemsWithStock = await Promise.all(
      items.map(async (item) => {
        const balances = await StockBalance.find({ itemId: item._id }).populate('warehouseId', 'name code');
        const totalQuantity = balances.reduce((sum, b) => sum + b.quantity, 0);
        const isLowStock = totalQuantity <= item.reorderPoint;
        const totalValuation = totalQuantity * item.unitPrice;

        return {
          ...item.toObject(),
          totalQuantity,
          isLowStock,
          totalValuation,
          warehouseBalances: balances.map((b) => ({
            warehouseId: b.warehouseId?._id,
            warehouseCode: b.warehouseId?.code,
            warehouseName: b.warehouseId?.name,
            quantity: b.quantity,
            isLow: b.quantity <= Math.ceil(item.reorderPoint / 4)
          }))
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: itemsWithStock.length,
      data: itemsWithStock
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single item by ID
// @route   GET /api/items/:id
// @access  Private (All Roles)
exports.getItemById = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Item with ID '${req.params.id}' not found`,
        errorCode: 'ITEM_NOT_FOUND'
      });
    }

    const balances = await StockBalance.find({ itemId: item._id }).populate('warehouseId', 'name code location type');
    const totalQuantity = balances.reduce((sum, b) => sum + b.quantity, 0);

    return res.status(200).json({
      success: true,
      data: {
        item,
        totalQuantity,
        isLowStock: totalQuantity <= item.reorderPoint,
        warehouseBalances: balances
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update item details
// @route   PUT /api/items/:id
// @access  Private (Admin / Manager)
exports.updateItem = async (req, res, next) => {
  try {
    const { name, category, unit, unitPrice, reorderPoint, reorderQuantity, requiresColdChain, tempRange, description, isActive } = req.body;

    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Item with ID '${req.params.id}' not found`,
        errorCode: 'ITEM_NOT_FOUND'
      });
    }

    if (name) item.name = name;
    if (category) item.category = category;
    if (unit) item.unit = unit;
    if (unitPrice !== undefined) item.unitPrice = unitPrice;
    if (reorderPoint !== undefined) item.reorderPoint = reorderPoint;
    if (reorderQuantity !== undefined) item.reorderQuantity = reorderQuantity;
    if (requiresColdChain !== undefined) item.requiresColdChain = requiresColdChain;
    if (tempRange) item.tempRange = tempRange;
    if (description !== undefined) item.description = description;
    if (isActive !== undefined) item.isActive = isActive;

    await item.save();

    return res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete item
// @route   DELETE /api/items/:id
// @access  Private (Admin)
exports.deleteItem = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Item with ID '${req.params.id}' not found`,
        errorCode: 'ITEM_NOT_FOUND'
      });
    }

    const balances = await StockBalance.find({ itemId: item._id, quantity: { $gt: 0 } });
    if (balances.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete item '${item.sku}' because active stock exists in one or more warehouses.`,
        errorCode: 'ITEM_HAS_ACTIVE_STOCK'
      });
    }

    await Item.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: `Item '${item.sku}' deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};
