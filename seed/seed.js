const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const Item = require('../models/Item');
const StockBalance = require('../models/StockBalance');
const StockMovement = require('../models/StockMovement');
const TransferRequest = require('../models/TransferRequest');

const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medex_pharmagrid_db';
    await mongoose.connect(mongoUri);
    console.log(`[Connected to DB for Seeding]: ${mongoUri}`);

    // Clear existing collections
    await User.deleteMany({});
    await Warehouse.deleteMany({});
    await Item.deleteMany({});
    await StockBalance.deleteMany({});
    await StockMovement.deleteMany({});
    await TransferRequest.deleteMany({});
    console.log('🧹 Cleared all existing data collections.');

    // 1. Seed Warehouses
    const warehousesData = [
      {
        code: 'WH-HYD-01',
        name: 'Hyderabad Central Manufacturing & Bulk Depot',
        location: { city: 'Hyderabad', state: 'Telangana', address: 'Plot 42, Genome Valley Biotech Park' },
        capacity: 25000,
        type: 'CENTRAL_HUB',
        temperatureControlled: false,
        tempRange: 'Ambient (15°C - 25°C)',
        status: 'ACTIVE'
      },
      {
        code: 'WH-MAA-02',
        name: 'Chennai Cold-Chain Bio-Vault',
        location: { city: 'Chennai', state: 'Tamil Nadu', address: 'SIPCOT Industrial Park, Sriperumbudur' },
        capacity: 15000,
        type: 'COLD_CHAIN',
        temperatureControlled: true,
        tempRange: '2°C to 8°C (Ultra-Cold -20°C Vault)',
        status: 'ACTIVE'
      },
      {
        code: 'WH-DEL-03',
        name: 'Delhi NCR Northern Distribution Center',
        location: { city: 'Gurugram', state: 'Haryana', address: 'Logistic Park, Manesar NH-48' },
        capacity: 18000,
        type: 'REGIONAL_DEPOT',
        temperatureControlled: false,
        tempRange: 'Ambient (15°C - 25°C)',
        status: 'ACTIVE'
      },
      {
        code: 'WH-CCU-04',
        name: 'Kolkata Eastern Regional Logistics Depot',
        location: { city: 'Kolkata', state: 'West Bengal', address: 'Dankuni Logistics Complex, Hooghly' },
        capacity: 12000,
        type: 'REGIONAL_DEPOT',
        temperatureControlled: false,
        tempRange: 'Ambient (15°C - 25°C)',
        status: 'ACTIVE'
      }
    ];

    const warehouses = await Warehouse.insertMany(warehousesData);
    console.log(`🏢 Seeded ${warehouses.length} Pharmaceutical Warehouses`);

    const hydWH = warehouses.find((w) => w.code === 'WH-HYD-01');
    const maaWH = warehouses.find((w) => w.code === 'WH-MAA-02');
    const delWH = warehouses.find((w) => w.code === 'WH-DEL-03');
    const ccuWH = warehouses.find((w) => w.code === 'WH-CCU-04');

    // 2. Seed Users with distinct roles
    const usersData = [
      {
        name: 'Dr. Vikram Malhotra (Admin)',
        email: 'admin@medex.com',
        password: 'Password123!',
        role: 'ADMIN',
        warehouseId: hydWH._id
      },
      {
        name: 'Dr. Ananya Iyer (Chennai Manager)',
        email: 'chennai.manager@medex.com',
        password: 'Password123!',
        role: 'MANAGER',
        warehouseId: maaWH._id
      },
      {
        name: 'Rajesh Sharma (Delhi Manager)',
        email: 'delhi.manager@medex.com',
        password: 'Password123!',
        role: 'MANAGER',
        warehouseId: delWH._id
      },
      {
        name: 'Sunil Kumar (Hyd Staff)',
        email: 'hyd.staff@medex.com',
        password: 'Password123!',
        role: 'STAFF',
        warehouseId: hydWH._id
      },
      {
        name: 'Pooja Sen (Kolkata Staff)',
        email: 'kolkata.staff@medex.com',
        password: 'Password123!',
        role: 'STAFF',
        warehouseId: ccuWH._id
      }
    ];

    const users = [];
    for (const u of usersData) {
      const createdUser = await User.create(u);
      users.push(createdUser);
    }
    console.log(`👤 Seeded ${users.length} Users with roles [ADMIN, MANAGER, STAFF]`);

    const adminUser = users.find((u) => u.email === 'admin@medex.com');
    const chennaiManager = users.find((u) => u.email === 'chennai.manager@medex.com');
    const delhiManager = users.find((u) => u.email === 'delhi.manager@medex.com');
    const hydStaff = users.find((u) => u.email === 'hyd.staff@medex.com');

    // Update warehouse manager refs
    await Warehouse.findByIdAndUpdate(maaWH._id, { managerId: chennaiManager._id });
    await Warehouse.findByIdAndUpdate(delWH._id, { managerId: delhiManager._id });
    await Warehouse.findByIdAndUpdate(hydWH._id, { managerId: adminUser._id });

    // 3. Seed Items / SKU Master
    const itemsData = [
      {
        sku: 'MED-VAC-101',
        name: 'Covaxin mRNA 0.5ml Vaccine Vials',
        category: 'VACCINES',
        unit: 'vials',
        unitPrice: 1500,
        reorderPoint: 400,
        reorderQuantity: 500,
        requiresColdChain: true,
        tempRange: '2°C to 8°C',
        description: 'Temperature-sensitive vaccine vials with freeze-guard indicator.'
      },
      {
        sku: 'MED-INS-202',
        name: 'Recombinant Human Insulin 100IU/ml (10ml)',
        category: 'COLD_CHAIN',
        unit: 'vials',
        unitPrice: 650,
        reorderPoint: 300,
        reorderQuantity: 400,
        requiresColdChain: true,
        tempRange: '2°C to 8°C',
        description: 'Sterile solution of human insulin for diabetes care.'
      },
      {
        sku: 'MED-ANT-303',
        name: 'Amoxicillin & Clavulanate Potassium 625mg',
        category: 'ANTIBIOTICS',
        unit: 'boxes',
        unitPrice: 320,
        reorderPoint: 200,
        reorderQuantity: 300,
        requiresColdChain: false,
        tempRange: 'Ambient (15°C - 25°C)',
        description: 'Broad-spectrum antibiotic strip boxes of 10 tablets.'
      },
      {
        sku: 'MED-AZI-304',
        name: 'Azithromycin Dihydrate 500mg Tablets',
        category: 'ANTIBIOTICS',
        unit: 'strips',
        unitPrice: 140,
        reorderPoint: 350,
        reorderQuantity: 500,
        requiresColdChain: false,
        tempRange: 'Ambient (15°C - 25°C)',
        description: 'Macrolide antibiotic for respiratory tract infections.'
      },
      {
        sku: 'MED-SAL-401',
        name: '0.9% Sodium Chloride IV Saline Infusion (500ml)',
        category: 'CRITICAL_CARE',
        unit: 'bottles',
        unitPrice: 85,
        reorderPoint: 600,
        reorderQuantity: 1000,
        requiresColdChain: false,
        tempRange: 'Ambient (15°C - 25°C)',
        description: 'Sterile nonpyrogenic IV fluid in flexible plastic bottles.'
      },
      {
        sku: 'MED-OXI-501',
        name: 'Digital Finger Pulse Oximeter Pro OLED',
        category: 'MEDICAL_DEVICES',
        unit: 'units',
        unitPrice: 1850,
        reorderPoint: 80,
        reorderQuantity: 150,
        requiresColdChain: false,
        tempRange: 'Ambient',
        description: 'Precision SpO2 and pulse rate clinical monitoring device.'
      },
      {
        sku: 'MED-GLV-601',
        name: 'Sterile Nitrile Surgical Examination Gloves (Pack of 100)',
        category: 'CONSUMABLES',
        unit: 'boxes',
        unitPrice: 450,
        reorderPoint: 400,
        reorderQuantity: 600,
        requiresColdChain: false,
        tempRange: 'Ambient',
        description: 'Powder-free medical grade blue nitrile examination gloves.'
      },
      {
        sku: 'MED-MSK-602',
        name: 'N95 Particulate Respirator Surgical Masks (Pack of 50)',
        category: 'CONSUMABLES',
        unit: 'boxes',
        unitPrice: 750,
        reorderPoint: 250,
        reorderQuantity: 400,
        requiresColdChain: false,
        tempRange: 'Ambient',
        description: 'NIOSH-certified 5-layer viral filtration masks.'
      }
    ];

    const items = await Item.insertMany(itemsData);
    console.log(`💊 Seeded ${items.length} Medical SKUs`);

    const vacItem = items.find((i) => i.sku === 'MED-VAC-101');
    const insItem = items.find((i) => i.sku === 'MED-INS-202');
    const antItem = items.find((i) => i.sku === 'MED-ANT-303');
    const aziItem = items.find((i) => i.sku === 'MED-AZI-304');
    const salItem = items.find((i) => i.sku === 'MED-SAL-401');
    const oxiItem = items.find((i) => i.sku === 'MED-OXI-501');
    const glvItem = items.find((i) => i.sku === 'MED-GLV-601');
    const mskItem = items.find((i) => i.sku === 'MED-MSK-602');

    // 4. Seed Stock Balances across Warehouses
    const balancesData = [
      // Chennai Cold Chain Vault (High Cold-Chain Stock)
      {
        warehouseId: maaWH._id,
        itemId: vacItem._id,
        quantity: 1800,
        batches: [{ batchNo: 'LOT-VAC-2025A', quantity: 1800, expiryDate: new Date('2026-12-31') }]
      },
      {
        warehouseId: maaWH._id,
        itemId: insItem._id,
        quantity: 1200,
        batches: [{ batchNo: 'LOT-INS-2025B', quantity: 1200, expiryDate: new Date('2026-10-31') }]
      },
      {
        warehouseId: maaWH._id,
        itemId: glvItem._id,
        quantity: 450,
        batches: [{ batchNo: 'LOT-GLV-01', quantity: 450, expiryDate: new Date('2028-01-01') }]
      },

      // Hyderabad Central Manufacturing Depot (High Bulk Stock)
      {
        warehouseId: hydWH._id,
        itemId: antItem._id,
        quantity: 3500,
        batches: [{ batchNo: 'LOT-ANT-901', quantity: 3500, expiryDate: new Date('2027-05-15') }]
      },
      {
        warehouseId: hydWH._id,
        itemId: aziItem._id,
        quantity: 4200,
        batches: [{ batchNo: 'LOT-AZI-802', quantity: 4200, expiryDate: new Date('2027-08-20') }]
      },
      {
        warehouseId: hydWH._id,
        itemId: salItem._id,
        quantity: 5000,
        batches: [{ batchNo: 'LOT-SAL-301', quantity: 5000, expiryDate: new Date('2027-11-30') }]
      },
      {
        warehouseId: hydWH._id,
        itemId: oxiItem._id,
        quantity: 400,
        batches: [{ batchNo: 'LOT-OXI-10', quantity: 400, expiryDate: new Date('2029-01-01') }]
      },
      {
        warehouseId: hydWH._id,
        itemId: glvItem._id,
        quantity: 2800,
        batches: [{ batchNo: 'LOT-GLV-02', quantity: 2800, expiryDate: new Date('2028-03-01') }]
      },
      {
        warehouseId: hydWH._id,
        itemId: mskItem._id,
        quantity: 1600,
        batches: [{ batchNo: 'LOT-MSK-01', quantity: 1600, expiryDate: new Date('2028-06-01') }]
      },

      // Delhi NCR Northern Distribution Center (Intentionally Low on some items for Alerts!)
      {
        warehouseId: delWH._id,
        itemId: antItem._id,
        quantity: 35, // Low stock! (Threshold is 50)
        batches: [{ batchNo: 'LOT-ANT-DEL1', quantity: 35, expiryDate: new Date('2027-05-15') }]
      },
      {
        warehouseId: delWH._id,
        itemId: oxiItem._id,
        quantity: 8, // Critical Low Stock! (Threshold is 20)
        batches: [{ batchNo: 'LOT-OXI-DEL1', quantity: 8, expiryDate: new Date('2029-01-01') }]
      },
      {
        warehouseId: delWH._id,
        itemId: salItem._id,
        quantity: 1200,
        batches: [{ batchNo: 'LOT-SAL-DEL1', quantity: 1200, expiryDate: new Date('2027-11-30') }]
      },
      {
        warehouseId: delWH._id,
        itemId: mskItem._id,
        quantity: 320,
        batches: [{ batchNo: 'LOT-MSK-DEL1', quantity: 320, expiryDate: new Date('2028-06-01') }]
      },

      // Kolkata Regional Depot
      {
        warehouseId: ccuWH._id,
        itemId: aziItem._id,
        quantity: 600,
        batches: [{ batchNo: 'LOT-AZI-CCU1', quantity: 600, expiryDate: new Date('2027-08-20') }]
      },
      {
        warehouseId: ccuWH._id,
        itemId: salItem._id,
        quantity: 850,
        batches: [{ batchNo: 'LOT-SAL-CCU1', quantity: 850, expiryDate: new Date('2027-11-30') }]
      },
      {
        warehouseId: ccuWH._id,
        itemId: glvItem._id,
        quantity: 400,
        batches: [{ batchNo: 'LOT-GLV-CCU1', quantity: 400, expiryDate: new Date('2028-03-01') }]
      }
    ];

    await StockBalance.insertMany(balancesData);
    console.log(`📦 Seeded ${balancesData.length} Warehouse Stock Balances with Low-Stock scenarios`);

    // 5. Seed Initial Stock Movements
    const movementsData = [
      {
        warehouseId: hydWH._id,
        itemId: antItem._id,
        type: 'STOCK_IN',
        quantity: 3500,
        balanceBefore: 0,
        balanceAfter: 3500,
        batchNo: 'LOT-ANT-901',
        referenceNumber: 'PO-2025-001',
        reasonCode: 'PURCHASE_RECEIPT',
        notes: 'Inbound factory batch receipt',
        performedBy: hydStaff._id,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      },
      {
        warehouseId: hydWH._id,
        itemId: salItem._id,
        type: 'STOCK_IN',
        quantity: 5000,
        balanceBefore: 0,
        balanceAfter: 5000,
        batchNo: 'LOT-SAL-301',
        referenceNumber: 'PO-2025-002',
        reasonCode: 'PURCHASE_RECEIPT',
        notes: 'IV infusion bulk receipt',
        performedBy: hydStaff._id,
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        warehouseId: maaWH._id,
        itemId: vacItem._id,
        type: 'STOCK_IN',
        quantity: 1800,
        balanceBefore: 0,
        balanceAfter: 1800,
        batchNo: 'LOT-VAC-2025A',
        referenceNumber: 'PO-2025-003',
        reasonCode: 'PURCHASE_RECEIPT',
        notes: 'Cold-chain vaccine receipt into bio-vault',
        performedBy: chennaiManager._id,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        warehouseId: delWH._id,
        itemId: antItem._id,
        type: 'STOCK_OUT',
        quantity: 150,
        balanceBefore: 185,
        balanceAfter: 35,
        batchNo: 'LOT-ANT-DEL1',
        referenceNumber: 'SO-2025-901',
        reasonCode: 'CUSTOMER_DISPATCH',
        notes: 'Hospital emergency pharmacy dispatch',
        performedBy: delhiManager._id,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      }
    ];

    await StockMovement.insertMany(movementsData);
    console.log(`📜 Seeded ${movementsData.length} Initial Stock Movement Audit Logs`);

    // 6. Seed Sample Inter-Warehouse Transfer Requests
    const transfersData = [
      {
        transferNumber: 'TRF-2025-0001',
        fromWarehouseId: hydWH._id,
        toWarehouseId: delWH._id,
        itemId: oxiItem._id,
        quantity: 50,
        batchNo: 'LOT-OXI-10',
        status: 'PENDING',
        requestedBy: delhiManager._id,
        reason: 'Urgent stock replenishment for Northern regional hospitals'
      },
      {
        transferNumber: 'TRF-2025-0002',
        fromWarehouseId: hydWH._id,
        toWarehouseId: delWH._id,
        itemId: antItem._id,
        quantity: 200,
        batchNo: 'LOT-ANT-901',
        status: 'APPROVED',
        requestedBy: delhiManager._id,
        approvedBy: adminUser._id,
        decisionRemarks: 'Approved by Central Operations Admin',
        reason: 'Restocking low antibiotic inventory in Delhi NCR'
      }
    ];

    await TransferRequest.insertMany(transfersData);
    console.log(`🔄 Seeded ${transfersData.length} Inter-Warehouse Transfer Requests`);

    console.log('\n========================================================');
    console.log('🎉 MEDEX PHARMAGRID SEEDING COMPLETED SUCCESSFULLY!');
    console.log('========================================================');
    console.log('Sample Logins:');
    console.log('  👑 Admin:           admin@medex.com / Password123!');
    console.log('  🏢 Chennai Manager: chennai.manager@medex.com / Password123!');
    console.log('  🏢 Delhi Manager:   delhi.manager@medex.com / Password123!');
    console.log('  👷 Hyd Staff:       hyd.staff@medex.com / Password123!');
    console.log('========================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    process.exit(1);
  }
};

seedDatabase();
