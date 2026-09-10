// MedEx PharmaGrid Dashboard JavaScript

const API_BASE = '/api';

// Demo Credentials for Instant Role Switching
const DEMO_USERS = {
  admin: {
    email: 'admin@medex.com',
    password: 'Password123!',
    label: 'Dr. Vikram Malhotra (Global Ops Director)',
    role: 'ADMIN'
  },
  chennaiManager: {
    email: 'chennai.manager@medex.com',
    password: 'Password123!',
    label: 'Dr. Ananya Iyer (Chennai Bio-Vault Mgr)',
    role: 'MANAGER'
  },
  delhiManager: {
    email: 'delhi.manager@medex.com',
    password: 'Password123!',
    label: 'Rajesh Sharma (Delhi Regional Mgr)',
    role: 'MANAGER'
  },
  hydStaff: {
    email: 'hyd.staff@medex.com',
    password: 'Password123!',
    label: 'Sunil Kumar (Hyd Bulk Depot Staff)',
    role: 'STAFF'
  },
  kolkataStaff: {
    email: 'kolkata.staff@medex.com',
    password: 'Password123!',
    label: 'Pooja Sen (Kolkata Regional Staff)',
    role: 'STAFF'
  }
};

let currentToken = localStorage.getItem('medex_token') || '';
let currentUser = JSON.parse(localStorage.getItem('medex_user') || 'null');
let allWarehouses = [];
let allItems = [];

// API Request Helper
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {})
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }
    return data;
  } catch (error) {
    if (!options.silent) {
      showToast(error.message, 'error');
    }
    throw error;
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon =
    type === 'success'
      ? 'fa-circle-check'
      : type === 'error'
      ? 'fa-circle-exclamation'
      : type === 'warning'
      ? 'fa-triangle-exclamation'
      : 'fa-info-circle';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Switch User Role
async function switchUserRole(roleKey) {
  const creds = DEMO_USERS[roleKey];
  if (!creds) return;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password })
    });
    const data = await res.json();

    if (data.success) {
      currentToken = data.data.token;
      currentUser = data.data.user;
      localStorage.setItem('medex_token', currentToken);
      localStorage.setItem('medex_user', JSON.stringify(currentUser));

      // Update Header UI
      document.getElementById('userName').textContent = currentUser.name;
      const roleTag = document.getElementById('userRoleTag');
      roleTag.textContent = currentUser.role;
      roleTag.className = `role-tag ${currentUser.role}`;

      // Update active button
      document.querySelectorAll('.role-btn').forEach((btn) => btn.classList.remove('active'));
      if (window.event && window.event.target) {
        window.event.target.classList.add('active');
      }

      showToast(`Switched role to ${creds.label}`, 'success');
      loadAllData();
    }
  } catch (error) {
    showToast('Failed to switch role. Check if backend server is running.', 'error');
  }
}

// Tab Navigation
function showTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));

  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find((b) =>
    b.getAttribute('onclick')?.includes(tabName)
  );
  if (activeBtn) activeBtn.classList.add('active');

  const panel = document.getElementById(`tab-${tabName}`);
  if (panel) panel.classList.add('active');
}

// Modal Helpers
function openModal(modalId) {
  populateDropdowns();
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// Populate Select Dropdowns
function populateDropdowns() {
  const whSelects = document.querySelectorAll('.select-warehouses');
  whSelects.forEach((sel) => {
    const isOptional = sel.name === 'initialWarehouseId';
    sel.innerHTML = isOptional ? '<option value="">-- None (Do not add initial stock) --</option>' : '';
    allWarehouses.forEach((wh) => {
      sel.innerHTML += `<option value="${wh._id}">${wh.code} — ${wh.name} (${wh.city})</option>`;
    });
  });

  const itemSelects = document.querySelectorAll('.select-items');
  itemSelects.forEach((sel) => {
    sel.innerHTML = '';
    allItems.forEach((it) => {
      sel.innerHTML += `<option value="${it._id}">${it.sku} — ${it.name} [₹${it.unitPrice}/${it.unit}]</option>`;
    });
  });
}

// Format Currency
function formatINR(val) {
  return '₹' + Number(val || 0).toLocaleString('en-IN');
}

// ==========================================
// DATA LOADING & RENDERING
// ==========================================

async function loadAllData() {
  try {
    await Promise.all([
      fetchKPIs(),
      fetchWarehouses(),
      fetchItems(),
      fetchStockBalances(),
      fetchTransfers(),
      fetchAlerts(),
      fetchMovements(),
      fetchReports()
    ]);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// 1. KPIs
async function fetchKPIs() {
  try {
    const isExecutive = currentUser && ['ADMIN', 'MANAGER'].includes(currentUser.role);

    const promises = [
      apiRequest('/warehouses', { silent: true }),
      apiRequest('/reports/low-stock', { silent: true }),
      apiRequest('/transfers?status=PENDING', { silent: true })
    ];

    if (isExecutive) {
      promises.push(apiRequest('/reports/valuation', { silent: true }));
    }

    const results = await Promise.all(promises);
    const whRes = results[0];
    const alertsRes = results[1];
    const trfRes = results[2];
    const valRes = isExecutive ? results[3] : null;

    if (valRes) {
      document.getElementById('kpiValuation').textContent = formatINR(valRes.summary?.totalValuation || 0);
      document.getElementById('kpiTotalUnits').textContent = (valRes.summary?.totalUnits || 0).toLocaleString();
    } else {
      document.getElementById('kpiValuation').textContent = '🔒 (Mgr / Admin)';
    }

    document.getElementById('kpiWarehouses').textContent = (whRes?.data || []).length;
    document.getElementById('kpiLowStock').textContent = alertsRes?.alertCount || 0;
    document.getElementById('kpiPendingTransfers').textContent = (trfRes?.data || []).length;
  } catch (err) {
    console.error('KPI fetch failed:', err);
  }
}

// 2. Warehouses & Bio-Vaults
async function fetchWarehouses() {
  try {
    const res = await apiRequest('/warehouses', { silent: true });
    allWarehouses = res.data || [];

    const container = document.getElementById('warehousesContainer');
    container.innerHTML = '';

    allWarehouses.forEach((wh) => {
      const used = wh.currentUtilization || 0;
      const cap = wh.capacity || 10000;
      const pct = Math.min(100, Math.round((used / cap) * 100));

      let barColor = '#10b981';
      if (pct > 80) barColor = '#f59e0b';
      if (pct > 95) barColor = '#ef4444';

      const card = document.createElement('div');
      card.className = 'warehouse-card';
      card.innerHTML = `
        <div class="warehouse-header">
          <div>
            <h3>${wh.name}</h3>
            <span class="facility-code">${wh.code}</span>
          </div>
          <span class="badge ${wh.type === 'COLD_CHAIN' ? 'badge-info' : 'badge-success'}">
            ${wh.type.replace('_', ' ')}
          </span>
        </div>

        <div class="capacity-bar-bg">
          <div class="capacity-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
        </div>
        <div class="capacity-labels">
          <span>Capacity: ${pct}% Utilized</span>
          <span>${used.toLocaleString()} / ${cap.toLocaleString()} Units</span>
        </div>

        <div class="warehouse-details">
          <div><i class="fa-solid fa-location-dot"></i> ${wh.location?.city || ''}, ${wh.location?.state || ''}</div>
          <div><i class="fa-solid fa-temperature-arrow-down"></i> ${wh.tempRange || (wh.temperatureControlled ? '2°C - 8°C' : 'Ambient')}</div>
          <div><i class="fa-solid fa-circle-check"></i> Status: <strong style="color: #10b981;">${wh.status}</strong></div>
        </div>
      `;
      container.appendChild(card);
    });

    populateDropdowns();
  } catch (err) {
    console.error('Warehouse fetch failed:', err);
  }
}

// 3. Items / SKU Master with Full CRUD
async function fetchItems() {
  try {
    const res = await apiRequest('/items', { silent: true });
    allItems = res.data || [];

    const tbody = document.getElementById('itemsTableBody');
    tbody.innerHTML = '';

    allItems.forEach((it) => {
      const isCold = it.requiresColdChain;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${it.sku}</strong></td>
        <td>
          <div style="font-weight: 600; color: #fff;">${it.name}</div>
          <small style="color: var(--text-muted);">${it.description || ''}</small>
        </td>
        <td><span class="badge badge-info">${(it.category || '').replace('_', ' ')}</span></td>
        <td>${formatINR(it.unitPrice)} <small>/ ${it.unit}</small></td>
        <td><span class="badge badge-warning">${it.reorderPoint} ${it.unit}</span></td>
        <td>
          ${
            isCold
              ? `<span class="badge badge-info"><i class="fa-solid fa-snowflake"></i> 2°C - 8°C</span>`
              : `<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">Ambient</span>`
          }
        </td>
        <td><strong style="color: #38bdf8;">${(it.totalStock || 0).toLocaleString()} ${it.unit}</strong></td>
        <td><span class="badge ${it.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${it.status}</span></td>
        <td>
          <div class="action-btn-group">
            <button class="btn btn-sm btn-icon btn-outline-info" title="View Per-Warehouse Breakdown" onclick="viewItemBreakdown('${it._id}')">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-icon btn-outline-success" title="Quick Add Stock" onclick="quickStockIn('${it._id}')">
              <i class="fa-solid fa-plus"></i>
            </button>
            <button class="btn btn-sm btn-icon btn-outline-warning" title="Edit SKU" onclick="openEditItemModal('${it._id}')">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-sm btn-icon btn-outline-danger" title="Delete SKU" onclick="handleDeleteItem('${it._id}', '${it.sku}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    populateDropdowns();
  } catch (err) {
    console.error('Items fetch failed:', err);
  }
}

// 4. Stock Balances Matrix
async function fetchStockBalances() {
  try {
    const res = await apiRequest('/stock/balance', { silent: true });
    const balances = res.data || [];

    let calculatedTotalUnits = 0;

    const tbody = document.getElementById('stockBalancesTableBody');
    tbody.innerHTML = '';

    if (balances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No stock balance records found.</td></tr>`;
      return;
    }

    balances.forEach((bal) => {
      calculatedTotalUnits += (bal.quantity || 0);
      const wh = bal.warehouse || bal.warehouseId;
      const it = bal.item || bal.itemId;
      const whName = wh ? `${wh.code} (${wh.location?.city || wh.city || ''})` : 'N/A';
      const itName = it ? it.name : 'Unknown SKU';
      const itSku = it ? it.sku : '';
      const cat = it ? it.category : '';
      const price = it ? (it.unitPrice || 0) : 0;
      const unit = it ? (it.unit || 'units') : 'units';
      const val = bal.stockValuation !== undefined ? bal.stockValuation : (bal.quantity * price);
      const dateVal = bal.lastUpdated || bal.updatedAt;
      const dateStr = dateVal ? new Date(dateVal).toLocaleString() : new Date().toLocaleString();

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${whName}</strong></td>
        <td>
          <span style="font-weight: 600; color: #fff;">${itName}</span>
          <small style="display: block; color: var(--text-muted); font-size: 0.75rem;">${itSku}</small>
        </td>
        <td><span class="badge badge-info">${cat ? cat.replace('_', ' ') : 'GENERAL'}</span></td>
        <td><strong style="color: #38bdf8; font-size: 1rem;">${(bal.quantity || 0).toLocaleString()}</strong> ${unit}</td>
        <td>${formatINR(val)}</td>
        <td>
          <span class="badge ${(bal.quantity || 0) > 0 ? 'badge-success' : 'badge-danger'}">
            ${(bal.quantity || 0) > 0 ? 'IN STOCK' : 'OUT OF STOCK'}
          </span>
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</td>
      `;
      tbody.appendChild(tr);
    });

    // If STAFF, set Total Units KPI directly from running balances
    if (currentUser?.role === 'STAFF') {
      document.getElementById('kpiTotalUnits').textContent = calculatedTotalUnits.toLocaleString();
    }
  } catch (err) {
    console.error('Balance fetch failed:', err);
  }
}

// 5. Transfers & State Machine Workflow
async function fetchTransfers() {
  try {
    const res = await apiRequest('/transfers', { silent: true });
    const transfers = res.data || [];

    const tbody = document.getElementById('transfersTableBody');
    tbody.innerHTML = '';

    if (transfers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No transfer requests found.</td></tr>`;
      return;
    }

    const isManagerOrAdmin = currentUser && ['ADMIN', 'MANAGER'].includes(currentUser.role);

    transfers.forEach((trf) => {
      const fromWh = trf.fromWarehouseId ? `${trf.fromWarehouseId.code}` : 'N/A';
      const toWh = trf.toWarehouseId ? `${trf.toWarehouseId.code}` : 'N/A';
      const itName = trf.itemId ? trf.itemId.name : 'Unknown Item';
      const reqBy = trf.requestedBy ? trf.requestedBy.name : 'System';

      let statusBadge = 'badge-warning';
      if (trf.status === 'APPROVED') statusBadge = 'badge-info';
      if (trf.status === 'IN_TRANSIT') statusBadge = 'badge-info';
      if (trf.status === 'COMPLETED') statusBadge = 'badge-success';
      if (trf.status === 'REJECTED' || trf.status === 'CANCELLED') statusBadge = 'badge-danger';

      // Contextual Workflow Action Buttons with RBAC
      let actionsHtml = `<span style="color: var(--text-muted); font-size: 0.8rem;">None</span>`;

      if (trf.status === 'PENDING') {
        if (isManagerOrAdmin) {
          actionsHtml = `
            <div class="action-btn-group">
              <button class="btn btn-sm btn-success" onclick="handleTransferDecision('${trf._id}', 'APPROVED')"><i class="fa-solid fa-check"></i> Approve</button>
              <button class="btn btn-sm btn-danger" onclick="handleTransferDecision('${trf._id}', 'REJECTED')"><i class="fa-solid fa-xmark"></i> Reject</button>
            </div>
          `;
        } else {
          actionsHtml = `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Awaiting Mgr Approval</span>`;
        }
      } else if (trf.status === 'APPROVED') {
        actionsHtml = `
          <button class="btn btn-sm btn-primary" onclick="handleDispatchTransfer('${trf._id}')"><i class="fa-solid fa-truck-fast"></i> Dispatch</button>
        `;
      } else if (trf.status === 'IN_TRANSIT') {
        if (isManagerOrAdmin) {
          actionsHtml = `
            <button class="btn btn-sm btn-success" onclick="handleReceiveTransfer('${trf._id}')"><i class="fa-solid fa-box-open"></i> Receive</button>
          `;
        } else {
          actionsHtml = `<span class="badge badge-info"><i class="fa-solid fa-truck-arrow-right"></i> In Transit</span>`;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${trf.transferNumber}</strong></td>
        <td><span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">${fromWh}</span></td>
        <td><span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">${toWh}</span></td>
        <td>${itName}</td>
        <td><strong>${trf.quantity}</strong></td>
        <td><span class="badge ${statusBadge}">${trf.status}</span></td>
        <td><small>${reqBy}</small></td>
        <td><small style="color: var(--text-muted);">${trf.reason || trf.decisionRemarks || '-'}</small></td>
        <td>${actionsHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Transfers fetch failed:', err);
  }
}

// 6. Low Stock Alerts & Reorders
async function fetchAlerts() {
  try {
    const res = await apiRequest('/reports/low-stock', { silent: true });
    const alerts = res.data || [];

    const tbody = document.getElementById('alertsTableBody');
    tbody.innerHTML = '';

    if (alerts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No low-stock alerts. All inventory levels are healthy! 🎉</td></tr>`;
      return;
    }

    alerts.forEach((alt) => {
      const tr = document.createElement('tr');
      const isOut = alt.severity === 'OUT_OF_STOCK';
      tr.innerHTML = `
        <td>
          <span class="badge ${isOut ? 'badge-danger' : 'badge-warning'}">
            <i class="fa-solid ${isOut ? 'fa-triangle-exclamation' : 'fa-bell'}"></i> ${alt.severity.replace('_', ' ')}
          </span>
        </td>
        <td><strong>${alt.warehouseCode}</strong> (${alt.city})</td>
        <td>
          <span style="font-weight: 600; color: #fff;">${alt.itemName}</span>
          <small style="display: block; color: var(--text-muted); font-size: 0.75rem;">${alt.sku}</small>
        </td>
        <td><strong style="color: ${isOut ? '#ef4444' : '#f59e0b'}; font-size: 1rem;">${alt.currentStock}</strong> ${alt.unit}</td>
        <td>${alt.reorderPoint} ${alt.unit}</td>
        <td><span style="color: #ef4444; font-weight: 600;">-${alt.shortage} ${alt.unit}</span></td>
        <td><strong style="color: #10b981;">+${alt.suggestedReorderQuantity} ${alt.unit}</strong></td>
        <td>${formatINR(alt.estimatedReorderCost)}</td>
        <td>
          <button class="btn btn-sm btn-success" onclick="quickRestock('${alt.warehouseId}', '${alt.itemId}', ${alt.suggestedReorderQuantity})">
            <i class="fa-solid fa-cart-plus"></i> Reorder
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Alerts fetch failed:', err);
  }
}

// 7. Audit & Movement Log
async function fetchMovements() {
  try {
    const res = await apiRequest('/movements?limit=30', { silent: true });
    const movements = res.data || [];

    const tbody = document.getElementById('movementsTableBody');
    tbody.innerHTML = '';

    if (movements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No movement log records found.</td></tr>`;
      return;
    }

    movements.forEach((mov) => {
      const isPositive = ['INBOUND_RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_ADD'].includes(mov.movementType);
      const badgeClass = isPositive ? 'badge-success' : 'badge-danger';
      const sign = isPositive ? '+' : '-';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(mov.createdAt).toLocaleString()}</td>
        <td><span class="badge ${badgeClass}">${mov.movementType.replace('_', ' ')}</span></td>
        <td><strong>${mov.warehouseId?.code || 'N/A'}</strong></td>
        <td>${mov.itemId?.name || 'Unknown Item'}</td>
        <td><strong style="color: ${isPositive ? '#10b981' : '#ef4444'};">${sign}${mov.quantity}</strong></td>
        <td>
          <span style="color: var(--text-muted);">${mov.balanceBefore}</span> &rarr; 
          <strong style="color: #fff;">${mov.balanceAfter}</strong>
        </td>
        <td><small style="color: var(--text-muted);">${mov.reasonCode || mov.referenceNumber || '-'}</small></td>
        <td><small>${mov.performedBy?.name || 'System'}</small></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Movements fetch failed:', err);
  }
}

// 8. Reports & Valuation Analytics (With RBAC Handling)
async function fetchReports() {
  const isExecutive = currentUser && ['ADMIN', 'MANAGER'].includes(currentUser.role);
  const catContainer = document.getElementById('categoryValuationList');
  const whContainer = document.getElementById('warehouseValuationList');
  const tbody = document.getElementById('fastMovingTableBody');

  if (!isExecutive) {
    const restrictedMessage = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-lock" style="font-size: 1.5rem; color: #f59e0b; margin-bottom: 0.5rem; display: block;"></i>
        <strong style="color: #fff;">Executive Access Only</strong><br>
        <small>Financial valuations and turnover analytics are restricted to Manager and Admin roles under RBAC.</small>
      </div>
    `;
    catContainer.innerHTML = restrictedMessage;
    whContainer.innerHTML = restrictedMessage;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;"><i class="fa-solid fa-shield-halved" style="color: #f59e0b;"></i> Fast-Moving Turnover Velocity reports require Manager or Admin credentials.</td></tr>`;
    return;
  }

  try {
    const [valRes, fastRes] = await Promise.all([
      apiRequest('/reports/valuation', { silent: true }),
      apiRequest('/reports/fast-moving?limit=8', { silent: true })
    ]);

    // Category Breakdown
    catContainer.innerHTML = '';
    (valRes.byCategory || []).forEach((cat) => {
      const item = document.createElement('div');
      item.className = 'report-row';
      item.innerHTML = `
        <div>
          <strong>${(cat._id || 'Unassigned').replace('_', ' ')}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${cat.itemCount} SKUs · ${cat.totalUnits.toLocaleString()} units</div>
        </div>
        <div style="font-weight: 700; color: #38bdf8;">${formatINR(cat.totalValuation)}</div>
      `;
      catContainer.appendChild(item);
    });

    // Warehouse Breakdown
    whContainer.innerHTML = '';
    (valRes.byWarehouse || []).forEach((wh) => {
      const item = document.createElement('div');
      item.className = 'report-row';
      item.innerHTML = `
        <div>
          <strong>${wh.warehouseCode} — ${wh.warehouseName}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${wh.city}, ${wh.state} · ${wh.totalUnits.toLocaleString()} units</div>
        </div>
        <div style="font-weight: 700; color: #10b981;">${formatINR(wh.totalValuation)}</div>
      `;
      whContainer.appendChild(item);
    });

    // Fast-Moving SKUs
    tbody.innerHTML = '';
    (fastRes.data || []).forEach((fm) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${fm.sku}</strong></td>
        <td><span style="font-weight: 600; color: #fff;">${fm.name}</span></td>
        <td><span class="badge badge-info">${(fm.category || '').replace('_', ' ')}</span></td>
        <td><strong style="color: #f59e0b; font-size: 1rem;">${(fm.totalDispatchedQuantity || 0).toLocaleString()}</strong></td>
        <td><span class="badge badge-success">${fm.dispatchEventsCount || 0} dispatches</span></td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${fm.lastDispatched ? new Date(fm.lastDispatched).toLocaleString() : 'N/A'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Reports fetch failed:', err);
  }
}

// ==========================================
// FORM SUBMISSIONS & EVENT HANDLERS
// ==========================================

// Add Warehouse
async function handleCreateWarehouse(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    code: form.code.value.trim().toUpperCase(),
    name: form.name.value.trim(),
    location: {
      city: form.city.value.trim(),
      state: form.state.value.trim()
    },
    capacity: Number(form.capacity.value),
    type: form.type.value,
    temperatureControlled: form.temperatureControlled.checked
  };

  try {
    await apiRequest('/warehouses', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Warehouse facility created successfully!', 'success');
    closeModal('modalWarehouse');
    form.reset();
    loadAllData();
  } catch (err) {
    // handled in apiRequest
  }
}

// Add Item
async function handleCreateItem(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    sku: form.sku.value.trim().toUpperCase(),
    name: form.name.value.trim(),
    category: form.category.value,
    unit: form.unit.value,
    unitPrice: Number(form.unitPrice.value),
    reorderPoint: Number(form.reorderPoint.value),
    requiresColdChain: form.requiresColdChain.checked,
    initialWarehouseId: form.initialWarehouseId.value || undefined,
    initialQuantity: form.initialQuantity.value ? Number(form.initialQuantity.value) : 0
  };

  try {
    await apiRequest('/items', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Pharmaceutical SKU created successfully!', 'success');
    closeModal('modalItem');
    form.reset();
    loadAllData();
  } catch (err) {
    // handled in apiRequest
  }
}

// Open Edit Item Modal
function openEditItemModal(itemId) {
  const item = allItems.find((i) => i._id === itemId);
  if (!item) return;

  document.getElementById('editItemId').value = item._id;
  document.getElementById('editItemSku').value = item.sku;
  document.getElementById('editItemName').value = item.name;
  document.getElementById('editItemCategory').value = item.category;
  document.getElementById('editItemUnit').value = item.unit;
  document.getElementById('editItemPrice').value = item.unitPrice;
  document.getElementById('editItemReorder').value = item.reorderPoint;

  openModal('modalEditItem');
}

// Handle Edit Item
async function handleEditItem(e) {
  e.preventDefault();
  const form = e.target;
  const id = document.getElementById('editItemId').value;
  const payload = {
    name: form.name.value.trim(),
    category: form.category.value,
    unit: form.unit.value,
    unitPrice: Number(form.unitPrice.value),
    reorderPoint: Number(form.reorderPoint.value)
  };

  try {
    await apiRequest(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('SKU updated successfully!', 'success');
    closeModal('modalEditItem');
    loadAllData();
  } catch (err) {
    // handled
  }
}

// Handle Delete Item
async function handleDeleteItem(itemId, sku) {
  if (!confirm(`Are you sure you want to delete SKU [${sku}]? This action cannot be undone.`)) {
    return;
  }

  try {
    await apiRequest(`/items/${itemId}`, {
      method: 'DELETE'
    });
    showToast(`SKU ${sku} deleted successfully`, 'success');
    loadAllData();
  } catch (err) {
    // handled
  }
}

// View Item Per-Warehouse Breakdown Modal
async function viewItemBreakdown(itemId) {
  try {
    const res = await apiRequest(`/items/${itemId}`);
    const it = res.data;

    document.getElementById('itemDetailsTitle').innerHTML = `<i class="fa-solid fa-circle-info"></i> ${it.sku} — ${it.name}`;

    let breakdownHtml = `
      <div style="margin-bottom: 1rem;">
        <p><strong>Category:</strong> ${it.category.replace('_', ' ')} | <strong>Unit Price:</strong> ₹${it.unitPrice} | <strong>Reorder Point:</strong> ${it.reorderPoint} ${it.unit}</p>
        <p><strong>Total Network Stock:</strong> <span style="color: #38bdf8; font-weight: 700;">${it.totalStock || 0} ${it.unit}</span></p>
      </div>
      <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">Stock Distribution across Facilities:</h4>
      <table style="width: 100%; font-size: 0.85rem;">
        <thead>
          <tr>
            <th>Warehouse</th>
            <th>Location</th>
            <th>Quantity</th>
            <th>Valuation</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (!it.warehouseBreakdown || it.warehouseBreakdown.length === 0) {
      breakdownHtml += `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No stock recorded in any facility.</td></tr>`;
    } else {
      it.warehouseBreakdown.forEach((wb) => {
        const val = wb.quantity * it.unitPrice;
        breakdownHtml += `
          <tr>
            <td><strong>${wb.warehouseCode}</strong></td>
            <td>${wb.city}, ${wb.state}</td>
            <td><strong style="color: #10b981;">${wb.quantity.toLocaleString()} ${it.unit}</strong></td>
            <td>${formatINR(val)}</td>
          </tr>
        `;
      });
    }

    breakdownHtml += `</tbody></table>`;
    document.getElementById('itemDetailsContent').innerHTML = breakdownHtml;
    openModal('modalItemDetails');
  } catch (err) {
    // handled
  }
}

// Quick Stock In
function quickStockIn(itemId) {
  openModal('modalStockIn');
  const sel = document.querySelector('#modalStockIn select[name="itemId"]');
  if (sel) sel.value = itemId;
}

// Quick Restock from Low-Stock Alert
function quickRestock(whId, itemId, qty) {
  openModal('modalStockIn');
  const whSel = document.querySelector('#modalStockIn select[name="warehouseId"]');
  const itSel = document.querySelector('#modalStockIn select[name="itemId"]');
  const qtyIn = document.querySelector('#modalStockIn input[name="quantity"]');

  if (whSel) whSel.value = whId;
  if (itSel) itSel.value = itemId;
  if (qtyIn) qtyIn.value = qty;
}

// Stock-In Form
async function handleStockIn(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    warehouseId: form.warehouseId.value,
    itemId: form.itemId.value,
    quantity: Number(form.quantity.value),
    batchNo: form.batchNo.value.trim() || undefined,
    referenceNumber: form.referenceNumber.value.trim() || undefined
  };

  try {
    await apiRequest('/stock/in', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Inbound stock received successfully!', 'success');
    closeModal('modalStockIn');
    form.reset();
    loadAllData();
  } catch (err) {
    // handled
  }
}

// Stock-Out Form
async function handleStockOut(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    warehouseId: form.warehouseId.value,
    itemId: form.itemId.value,
    quantity: Number(form.quantity.value),
    referenceNumber: form.referenceNumber.value.trim() || undefined
  };

  try {
    await apiRequest('/stock/out', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Stock dispatched successfully!', 'success');
    closeModal('modalStockOut');
    form.reset();
    loadAllData();
  } catch (err) {
    // handled
  }
}

// Adjustment Form
async function handleAdjustment(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    warehouseId: form.warehouseId.value,
    itemId: form.itemId.value,
    adjustmentType: form.adjustmentType.value,
    quantity: Number(form.quantity.value),
    reasonCode: form.reasonCode.value,
    notes: form.notes.value.trim() || undefined
  };

  try {
    await apiRequest('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Stock count adjustment recorded successfully!', 'success');
    closeModal('modalAdjustment');
    form.reset();
    loadAllData();
  } catch (err) {
    // handled
  }
}

// Transfer Request Form
async function handleCreateTransfer(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    fromWarehouseId: form.fromWarehouseId.value,
    toWarehouseId: form.toWarehouseId.value,
    itemId: form.itemId.value,
    quantity: Number(form.quantity.value),
    reason: form.reason.value.trim() || undefined
  };

  try {
    await apiRequest('/transfers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Transfer request submitted successfully!', 'success');
    closeModal('modalTransfer');
    form.reset();
    loadAllData();
  } catch (err) {
    // handled
  }
}

// Transfer State Machine Actions
async function handleTransferDecision(transferId, status) {
  const remarks = prompt(`Enter optional remarks for ${status}:`) || '';
  try {
    await apiRequest(`/transfers/${transferId}/decision`, {
      method: 'PUT',
      body: JSON.stringify({ status, decisionRemarks: remarks })
    });
    showToast(`Transfer marked as ${status}`, 'success');
    loadAllData();
  } catch (err) {
    // handled
  }
}

async function handleDispatchTransfer(transferId) {
  try {
    await apiRequest(`/transfers/${transferId}/dispatch`, {
      method: 'PUT'
    });
    showToast('Transfer dispatched and placed IN_TRANSIT', 'success');
    loadAllData();
  } catch (err) {
    // handled
  }
}

async function handleReceiveTransfer(transferId) {
  try {
    await apiRequest(`/transfers/${transferId}/receive`, {
      method: 'PUT'
    });
    showToast('Transfer received and stock added to destination!', 'success');
    loadAllData();
  } catch (err) {
    // handled
  }
}

// ==========================================
// INITIALIZATION
// ==========================================

window.addEventListener('DOMContentLoaded', async () => {
  if (!currentToken) {
    await switchUserRole('admin');
  } else {
    if (currentUser) {
      document.getElementById('userName').textContent = currentUser.name;
      const roleTag = document.getElementById('userRoleTag');
      roleTag.textContent = currentUser.role;
      roleTag.className = `role-tag ${currentUser.role}`;
    }
    loadAllData();
  }
});
