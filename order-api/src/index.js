require('./tracing');

const express = require('express');
const { connectMongoDB } = require('./services/mongodb.service');
const { connectRabbitMQ } = require('./services/rabbitmq.service');
const ordersRoutes = require('./routes/orders.routes');
const errorMiddleware = require('./middleware/error.middleware');
const logger = require('./utils/logger');
const config = require('./config');

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Routes
app.use('/orders', ordersRoutes);

// Error handling middleware
app.use(errorMiddleware);

async function start() {
  try {
    await connectMongoDB();
    await connectRabbitMQ();
    app.listen(config.port, () => {
      logger.info(`Order API Service running on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start Order API Service:', error);
    process.exit(1);
  }
}

start();