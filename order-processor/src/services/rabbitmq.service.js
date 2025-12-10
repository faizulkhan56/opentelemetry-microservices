const amqp = require('amqplib');
const logger = require('../utils/logger');
const config = require('../config');

let channel;

async function connectRabbitMQ(consumerCallback) {
  try {
    const connection = await amqp.connect(config.rabbitmqUrl);
    channel = await connection.createChannel();
    await channel.assertQueue(config.queueName, { durable: true });
    logger.info('Connected to RabbitMQ');

    // Wrap consumerCallback to pass channel explicitly
    await channel.consume(config.queueName, async (msg) => {
      await consumerCallback(msg, channel);
    }, { noAck: false });

    return channel;
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ:', error);
    throw error;
  }
}

module.exports = { connectRabbitMQ };