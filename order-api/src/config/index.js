// Load environment variables from .env file
require('dotenv').config();
const config = {
    mongoUri: process.env.MONGO_URI || 'mongodb://mongodb:27017/orders_db?replicaSet=rs0',
    rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',
    otelExporterEnpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo:4317',
    otelServiceName: process.env.OTEL_SERVICE_NAME,
    queueName: 'order_queue',
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
};
  
module.exports = config;