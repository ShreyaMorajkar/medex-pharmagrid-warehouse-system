const { validationResult } = require('express-validator');

// Middleware to handle express-validator errors centrally
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      message: `Validation failed: ${errorDetails.map((e) => e.message).join('; ')}`,
      errorCode: 'VALIDATION_ERROR',
      errors: errorDetails
    });
  }
  next();
};

module.exports = {
  handleValidationErrors
};
