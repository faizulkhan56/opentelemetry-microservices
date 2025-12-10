require('./tracing');
const { connectMongoDB } = require('./services/mongodb.service');
const { connectRabbitMQ } = require('./services/rabbitmq.service');
const { processOrderMessage } = require('./consumers/order.consumer');
const logger = require('./utils/logger');

async function start() {
  try {
    await connectMongoDB();
    await connectRabbitMQ(processOrderMessage);
    logger.info('Order Processor Service started');
  } catch (error) {
    logger.error('Failed to start Order Processor Service:', error);
    process.exit(1);
  }
}

start();