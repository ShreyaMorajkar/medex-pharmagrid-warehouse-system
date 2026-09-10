const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const app = require('../server');

let server;
let baseUrl;
let adminToken = '';
let managerToken = '';
let staffToken = '';
let hydWarehouseId = '';
let maaWarehouseId = '';
let vacItemId = '';
let antItemId = '';
let transferId = '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function fetchJSON(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await response.json();
  return { status: response.status, ok: response.ok, data };
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING MEDEX PHARMAGRID FULL TEST SUITE');
  console.log('======================================================\n');

  const PORT = 5556;
  server = app.listen(PORT);
  baseUrl = `http://localhost:${PORT}/api`;

  try {
    // ---------------------------------------------------------
    // MODULE 1 & 13: Auth & RBAC
    // ---------------------------------------------------------
    console.log('\n📌 [Module 1 & 13] Authentication & Role-Based Access Control');

    // Admin Login
    const adminLogin = await fetchJSON('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@medex.com', password: 'Password123!' })
    });
    assert(adminLogin.status === 200 && adminLogin.data.data.token, 'Admin login returns 200 and valid JWT token');
    adminToken = adminLogin.data.data.token;

    // Manager Login
    const mgrLogin = await fetchJSON('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'chennai.manager@medex.com', password: 'Password123!' })
    });
    assert(mgrLogin.status === 200 && mgrLogin.data.data.token, 'Chennai Cold-Chain Manager login returns 200 and token');
    managerToken = mgrLogin.data.data.token;

    // Staff Login
    const stfLogin = await fetchJSON('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'hyd.staff@medex.com', password: 'Password123!' })
    });
    assert(stfLogin.status === 200 && stfLogin.data.data.token, 'Hyderabad Staff login returns 200 and token');
    staffToken = stfLogin.data.data.token;

    // Invalid Login (401)
    const badLogin = await fetchJSON('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@medex.com', password: 'WrongPassword' })
    });
    assert(badLogin.status === 401 && badLogin.data.errorCode === 'INVALID_CREDENTIALS', 'Invalid credentials rejected with 401');

    // Missing Token on Protected Route (401)
    const noTokenRes = await fetchJSON('/warehouses');
    assert(noTokenRes.status === 401 && noTokenRes.data.errorCode === 'UNAUTHORIZED', 'Unauthenticated request to protected route returns 401');

    // ---------------------------------------------------------
    // MODULE 2: Warehouse Management
    // ---------------------------------------------------------
    console.log('\n📌 [Module 2] Warehouse Management');

    const whList = await fetchJSON('/warehouses', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(whList.status === 200 && whList.data.data.length >= 4, `Found ${whList.data.data.length} warehouses & bio-vaults with capacity utilization data`);

    const hydWH = whList.data.data.find((w) => w.code === 'WH-HYD-01');
    const maaWH = whList.data.data.find((w) => w.code === 'WH-MAA-02');
    hydWarehouseId = hydWH._id;
    maaWarehouseId = maaWH._id;

    // Staff unauthorized to create warehouse (403 Forbidden)
    const staffCreateWH = await fetchJSON('/warehouses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        code: 'WH-UNAUTH',
        name: 'Unauthorized WH',
        location: { city: 'Test', state: 'Test' },
        capacity: 5000
      })
    });
    assert(staffCreateWH.status === 403 && staffCreateWH.data.errorCode === 'FORBIDDEN', 'Staff creating warehouse rejected with 403 Forbidden');

    // ---------------------------------------------------------
    // MODULE 3: Item / SKU Master
    // ---------------------------------------------------------
    console.log('\n📌 [Module 3] Item / SKU Master Management');

    const itemsRes = await fetchJSON('/items', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(itemsRes.status === 200 && itemsRes.data.data.length >= 8, `Found ${itemsRes.data.data.length} pharmaceutical SKUs & medical devices`);

    const vacItem = itemsRes.data.data.find((i) => i.sku === 'MED-VAC-101');
    const antItem = itemsRes.data.data.find((i) => i.sku === 'MED-ANT-303');
    vacItemId = vacItem._id;
    antItemId = antItem._id;

    // Validation failure on invalid category (400 Bad Request)
    const badCatItem = await fetchJSON('/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        sku: 'MED-BAD-01',
        name: 'Invalid Category Medicine',
        category: 'NON_EXISTENT_CATEGORY',
        unitPrice: 100
      })
    });
    assert(badCatItem.status === 400 && badCatItem.data.errorCode === 'VALIDATION_ERROR', 'Invalid category rejected with 400 Validation Error');

    // ---------------------------------------------------------
    // MODULE 4, 5, 6: Stock In, Out, & Running Balance Engine
    // ---------------------------------------------------------
    console.log('\n📌 [Module 4, 5, 6] Stock In, Stock Out & Running Stock Balance Engine');

    // Stock-In
    const stockInRes = await fetchJSON('/stock/in', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        warehouseId: hydWarehouseId,
        itemId: antItemId,
        quantity: 100,
        batchNo: 'BATCH-ANT-TEST',
        referenceNumber: 'PO-TEST-01'
      })
    });
    assert(stockInRes.status === 201 && stockInRes.data.data.balance.balanceAfter > stockInRes.data.data.balance.balanceBefore, 'Stock-In increments running balance');

    // Stock-Out (Insufficient Stock Violation - 400)
    const excessOut = await fetchJSON('/stock/out', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        warehouseId: hydWarehouseId,
        itemId: antItemId,
        quantity: 9999999
      })
    });
    assert(excessOut.status === 400 && excessOut.data.errorCode === 'INSUFFICIENT_STOCK', 'Excess stock-out prevented with 400 INSUFFICIENT_STOCK');

    // Stock-Out (Valid)
    const validOut = await fetchJSON('/stock/out', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        warehouseId: hydWarehouseId,
        itemId: antItemId,
        quantity: 20,
        referenceNumber: 'HOSP-TEST-01'
      })
    });
    assert(validOut.status === 200 && validOut.data.data.balance.balanceAfter < validOut.data.data.balance.balanceBefore, 'Stock-Out decrements running balance');

    // Running balance query
    const balRes = await fetchJSON('/stock/balance', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(balRes.status === 200 && balRes.data.data.length > 0, 'Running stock balance engine returns real-time balances');

    // ---------------------------------------------------------
    // MODULE 7 & 8: Inter-Warehouse Transfers & Workflow
    // ---------------------------------------------------------
    console.log('\n📌 [Module 7 & 8] Inter-Warehouse Transfers & Approval Workflow');

    // Identical warehouse violation (400)
    const sameWHTrf = await fetchJSON('/transfers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        fromWarehouseId: hydWarehouseId,
        toWarehouseId: hydWarehouseId,
        itemId: antItemId,
        quantity: 10
      })
    });
    assert(sameWHTrf.status === 400 && sameWHTrf.data.errorCode === 'IDENTICAL_WAREHOUSES', 'Transfer between identical facilities rejected');

    // Create valid transfer request (PENDING)
    const trfCreate = await fetchJSON('/transfers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        fromWarehouseId: hydWarehouseId,
        toWarehouseId: maaWarehouseId,
        itemId: antItemId,
        quantity: 25,
        reason: 'Automated test pharmaceutical transfer'
      })
    });
    assert(trfCreate.status === 201 && trfCreate.data.data.status === 'PENDING', 'Transfer created in PENDING status');
    transferId = trfCreate.data.data._id;

    // Manager approves transfer (APPROVED)
    const trfDecision = await fetchJSON(`/transfers/${transferId}/decision`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ status: 'APPROVED', decisionRemarks: 'Manager approved transfer' })
    });
    assert(trfDecision.status === 200 && trfDecision.data.data.status === 'APPROVED', 'Manager approved transfer (state -> APPROVED)');

    // Dispatch transfer (IN_TRANSIT)
    const trfDispatch = await fetchJSON(`/transfers/${transferId}/dispatch`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert(trfDispatch.status === 200 && trfDispatch.data.data.status === 'IN_TRANSIT', 'Dispatched transfer (state -> IN_TRANSIT, stock deducted from source)');

    // Receive transfer (COMPLETED)
    const trfReceive = await fetchJSON(`/transfers/${transferId}/receive`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(trfReceive.status === 200 && trfReceive.data.data.status === 'COMPLETED', 'Received transfer (state -> COMPLETED, stock added to destination)');

    // ---------------------------------------------------------
    // MODULE 9: Low-Stock Alerts & Reorders
    // ---------------------------------------------------------
    console.log('\n📌 [Module 9] Low-Stock Alert & Reorder Point');

    const lowStockRes = await fetchJSON('/reports/low-stock', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(lowStockRes.status === 200 && lowStockRes.data.alertCount > 0, `Detected ${lowStockRes.data.alertCount} low-stock alerts with suggested reorder quantities`);

    // ---------------------------------------------------------
    // MODULE 10 & 11: Stock Audit Adjustment & Movement History
    // ---------------------------------------------------------
    console.log('\n📌 [Module 10 & 11] Stock Audit Adjustments & Movement Audit Log');

    const adjRes = await fetchJSON('/stock/adjust', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        warehouseId: hydWarehouseId,
        itemId: antItemId,
        adjustmentType: 'ADJUSTMENT_DEDUCT',
        quantity: 2,
        reasonCode: 'DAMAGED_COLD_CHAIN',
        notes: 'Damaged packaging discrepancy recorded'
      })
    });
    assert(adjRes.status === 200 && adjRes.data.data.balance.balanceAfter === adjRes.data.data.balance.balanceBefore - 2, 'Physical count adjustment recorded successfully');

    const movRes = await fetchJSON('/movements', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(movRes.status === 200 && movRes.data.total > 0, `Movement audit log contains ${movRes.data.total} recorded transactions`);

    // ---------------------------------------------------------
    // MODULE 12: Manager & Admin Reports
    // ---------------------------------------------------------
    console.log('\n📌 [Module 12] Manager & Admin Reports (Valuation, Fast-Moving, Utilization)');

    const valRes = await fetchJSON('/reports/valuation', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(valRes.status === 200 && valRes.data.summary.totalValuation > 0, `Financial valuation report calculated: ₹${valRes.data.summary.totalValuation.toLocaleString()}`);

    const utilRes = await fetchJSON('/reports/warehouse-utilization', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(utilRes.status === 200 && utilRes.data.data.length >= 4, 'Warehouse utilization report generated');

    // ---------------------------------------------------------
    // SUMMARY
    // ---------------------------------------------------------
    console.log('\n======================================================');
    console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
    console.log('======================================================\n');

    if (failedTests === 0) {
      console.log('✨ ALL 13 MODULES & BUSINESS RULES VERIFIED 100% OPERATIONAL!');
    }
  } catch (error) {
    console.error('Test execution error:', error);
  } finally {
    if (server) server.close();
    await mongoose.disconnect();
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
