const winston = require('winston');
const { trace, context } = require('@opentelemetry/api');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp'],
      fillWith: () => ({
        traceId: trace.getSpan(context.active())?.spanContext().traceId || 'n/a',
      }),
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/order-api.log' }),
  ],
});

module.exports = logger;