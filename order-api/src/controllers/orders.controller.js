const { trace, SpanStatusCode } = require('@opentelemetry/api');
const Order = require('../models/order.model');
const { publishMessage } = require('../services/rabbitmq.service');
const logger = require('../utils/logger');

async function createOrder(req, res, next) {
  const tracer = trace.getTracer('order-api');
  return tracer.startActiveSpan('create-order', async (span) => {
    try {
      const { customerId, customerEmail, items, shippingAddress } = req.body;

      span.addEvent('Validating order input');
      if (!customerId || !customerEmail || !items || !shippingAddress) {
        const error = new Error('Missing required fields');
        error.status = 400;
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      }

      span.addEvent('Calculating total amount');
      const totalAmount = items.reduce((total, item) => {
        if (!item.price || !item.quantity) {
          const error = new Error('Item price or quantity missing');
          error.status = 400;
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        }
        return total + (item.price * item.quantity);
      }, 0);

      span.addEvent('Creating order document');
      const order = new Order({
        customerId,
        customerEmail,
        items,
        shippingAddress,
        totalAmount,
        status: 'CREATED',
        paymentStatus: 'PENDING',
      });

      // span.addEvent('Saving order to MongoDB');
      // await order.save();
      // logger.info(`Order created: ${order._id}`, {
      //   traceId: span.spanContext().traceId,
      //   spanId: span.spanContext().spanId,
      //   traceFlags: span.spanContext().traceFlags.toString(16),
      // });

      // seprate span for MongDB save
      await tracer.startActiveSpan('save-order-mongodb', async (mongoSpan) => {
        try {
          mongoSpan.addEvent('Saving Order to MongoDB');
          await order.save();
          mongoSpan.setAttribute('order.id', order._id.toString());
          mongoSpan.setStatus({ code: SpanStatusCode.OK });
          logger.info(`Order created: ${order._id}`, {
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
            traceFlags: span.spanContext().traceFlags.toString(16),
          });
        } catch (error) {
          mongoSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          mongoSpan.end();
        }
      });
      
      // Set at parent level
      span.setAttribute('order.id', order._id.toString());

      // span.addEvent('Publishing message to RabbitMQ');
      // await publishMessage({ orderId: order._id.toString() });

       // Separate span for RabbitMQ publish
      await tracer.startActiveSpan('publish-rabbitmq', async (rabbitSpan) => {
        try {
          rabbitSpan.addEvent('Publishing message to RabbitMQ');
          await publishMessage({ orderId: order._id.toString() });
          rabbitSpan.setAttribute('order.id', order._id.toString());
          rabbitSpan.setStatus({ code: SpanStatusCode.OK });
          logger.info(`Published message to order_queue: {"orderId":"${order._id}"}`, {
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
            traceFlags: span.spanContext().traceFlags.toString(16),
          });
        } catch (error) {
          rabbitSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          rabbitSpan.end();
        }
      });
    
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(201).json({ orderId: order._id.toString(), status: order.status });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      logger.error(`Error: ${error.message}`, {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
      next(error);
    } finally {
      span.end();
    }
  });
}

async function getOrder(req, res, next) {
  const tracer = trace.getTracer('order-api');
  return tracer.startActiveSpan('get-order', async (span) => {
    try {
      span.addEvent('Fetching order from MongoDB');
      const order = await Order.findById(req.params.id);
      if (!order) {
        const error = new Error('Order not found');
        error.status = 404;
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      }
      span.setAttribute('order.id', order._id.toString());
      span.setStatus({ code: SpanStatusCode.OK });
      res.json(order);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      logger.error(`Error: ${error.message}`, {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
      next(error);
    } finally {
      span.end();
    }
  });
}

module.exports = { createOrder, getOrder };