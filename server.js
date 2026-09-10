const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Connect to Database
const connectDB = require('./config/db');
connectDB();

const app = express();

// Body Parser & CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Logging in dev mode
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, 'public')));

// API Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MedEx PharmaGrid Multi-Warehouse Pharmaceutical API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mount Resource Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/transfers', require('./routes/transferRoutes'));
app.use('/api/movements', require('./routes/movementRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));

// 404 Handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found`,
    errorCode: 'ENDPOINT_NOT_FOUND'
  });
});

// Fallback to frontend for single page navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized Error Handling Middleware
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🏥 MedEx PharmaGrid Server running on http://localhost:${PORT}`);
    console.log(`📊 Interactive UI Dashboard available at http://localhost:${PORT}`);
    console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
