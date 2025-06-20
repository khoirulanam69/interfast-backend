
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Default error
  let error = {
    success: false,
    message: 'Internal server error'
  };

  // Validation errors
  if (err.name === 'ValidationError') {
    error.message = 'Validation error';
    error.errors = Object.values(err.errors).map(val => val.message);
    return res.status(400).json(error);
  }

  // MikroTik connection errors
  if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
    error.message = 'Cannot connect to MikroTik router';
    return res.status(503).json(error);
  }

  // Authentication errors
  if (err.message.includes('authentication') || err.message.includes('login')) {
    error.message = 'MikroTik authentication failed';
    return res.status(401).json(error);
  }

  // Custom application errors
  if (err.statusCode) {
    error.message = err.message;
    return res.status(err.statusCode).json(error);
  }

  // Development vs production error details
  if (process.env.NODE_ENV === 'development') {
    error.message = err.message;
    error.stack = err.stack;
  }

  res.status(500).json(error);
};

module.exports = errorHandler;
