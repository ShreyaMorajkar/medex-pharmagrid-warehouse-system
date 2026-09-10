// Centralized Error Handling Middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  console.error(`[Error] ${req.method} ${req.url} ->`, err);

  // Mongoose bad ObjectId (CastError)
  if (err.name === 'CastError') {
    return res.status(404).json({
      success: false,
      message: `Resource not found with id of '${err.value}'`,
      errorCode: 'RESOURCE_NOT_FOUND'
    });
  }

  // Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const val = err.keyValue ? err.keyValue[field] : '';
    return res.status(409).json({
      success: false,
      message: `Duplicate value error: A record with ${field} '${val}' already exists.`,
      errorCode: 'DUPLICATE_KEY_ERROR',
      field
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      success: false,
      message: `Validation Error: ${messages.join('. ')}`,
      errorCode: 'VALIDATION_ERROR',
      errors: messages
    });
  }

  // Fallback 500 Internal Server Error
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
    errorCode: error.errorCode || 'INTERNAL_SERVER_ERROR'
  });
};

module.exports = errorHandler;
