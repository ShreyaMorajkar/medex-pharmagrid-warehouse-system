const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authenticate JWT Token
const authenticate = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authentication token provided.',
        errorCode: 'UNAUTHORIZED'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_medex_pharmagrid_jwt_key_2025_christ_uni');
    const user = await User.findById(decoded.id).populate('warehouseId', 'name code location');

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account not found or deactivated.',
        errorCode: 'UNAUTHORIZED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Authentication token has expired. Please login again.',
        errorCode: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
      errorCode: 'INVALID_TOKEN'
    });
  }
};

// Authorize specific roles (RBAC)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        errorCode: 'UNAUTHORIZED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user.role}' does not have permission to perform this action. Required: ${roles.join(', ')}`,
        errorCode: 'FORBIDDEN'
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize
};
