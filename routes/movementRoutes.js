const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Get Movement History Log
router.get('/', auditController.getMovements);

module.exports = router;
