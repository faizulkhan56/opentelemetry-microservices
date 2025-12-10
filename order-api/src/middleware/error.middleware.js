const logger = require('../utils/logger');

function errorMiddleware(err, req, res, next) {
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
}

module.exports = errorMiddleware; 