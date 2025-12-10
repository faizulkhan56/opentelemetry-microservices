const { trace, SpanStatusCode, context, propagation } = require('@opentelemetry/api');
const Order = require('../models/order.model');
const logger = require('../utils/logger');

async function processOrderMessage(msg, channel) {
  if (!msg || !channel) {
    logger.error('Invalid message or channel');
    return;
  }

  const tracer = trace.getTracer('order-processor');
  const headers = msg.properties.headers || {};
  const parentContext = propagation.extract(context.active(), headers);

  return tracer.startActiveSpan('process-order', { kind: 1 }, parentContext, async (span) => {
    try {
      const { orderId } = JSON.parse(msg.content.toString());
      span.setAttribute('order.id', orderId);
      logger.info(`Processing order ${orderId}`, {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        traceFlags: span.spanContext().traceFlags.toString(16),
      });

      // span.addEvent('Fetching order from MongoDB');
      // const order = await Order.findById(orderId);
      // if (!order) {
      //   span.setStatus({ code: SpanStatusCode.ERROR, message: 'Order not found' });
      //   logger.error(`Order ${orderId} not found`, {
      //     traceId: span.spanContext().traceId,
      //     spanId: span.spanContext().spanId,
      //   });
      //   channel.nack(msg, false, false); // Do not requeue
      //   return;
      // }

      let order;
      // Separate span for MongoDB fetch 
      await tracer.startActiveSpan('fetch-order-mongodb', async (fetchSpan) => {
        try {
          fetchSpan.addEvent('Fetching order from MongoDB');
          order = await Order.findById(orderId);
          fetchSpan.setAttribute('order.id', orderId);
          if (!order) {
            fetchSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Order not found' });
            logger.error(`Order ${orderId} not found`, {
              traceId: span.spanContext().traceId,
              spanId: span.spanContext().spanId,
            });
            channel.nack(msg, false, false); // Do not requeue
            return;
          }
          fetchSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          fetchSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          fetchSpan.end();
        }
      });

      if (order.status !== 'CREATED') {
        span.addEvent(`Order already processed, status: ${order.status}`);
        logger.warn(`Order ${orderId} already processed, status: ${order.status}`, {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
        });
        channel.ack(msg);
        return;
      }

      // span.addEvent('Processing order business logic');
      // order.status = 'PROCESSING';
      // order.processedAt = new Date();
      // await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate work
      // order.status = Math.random() > 0.1 ? 'SHIPPED' : 'CANCELLED'; // 90% success
      // order.paymentStatus = order.status === 'SHIPPED' ? 'PAID' : 'FAILED';
      // order.trackingNumber = order.status === 'SHIPPED' ? `TRK${orderId}` : null;


      // Separate span for business logic
      await tracer.startActiveSpan('process-order-logic', async (logicSpan) => {
        try {
          logicSpan.addEvent('Processing order business logic');
          order.status = 'PROCESSING';
          order.processedAt = new Date();
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate work
          order.status = Math.random() > 0.1 ? 'SHIPPED' : 'CANCELLED'; // 90% success
          order.paymentStatus = order.status === 'SHIPPED' ? 'PAID' : 'FAILED';
          order.trackingNumber = order.status === 'SHIPPED' ? `TRK${orderId}` : null;
          logicSpan.setAttribute('order.id', orderId);
          logicSpan.setAttribute('order.status', order.status);
          logicSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          logicSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          logicSpan.end();
        }
      });

      // span.addEvent('Updating order in MongoDB');
      // await order.save();
      // logger.info(`Order ${orderId} processed, status: ${order.status}`, {
      //   traceId: span.spanContext().traceId,
      //   spanId: span.spanContext().spanId,
      // });

      // Separate span for MongoDB update
      await tracer.startActiveSpan('update-order-mongodb', async (updateSpan) => {
        try {
          updateSpan.addEvent('Updating order in MongoDB');
          await order.save();
          updateSpan.setAttribute('order.id', orderId);
          updateSpan.setAttribute('order.status', order.status);
          updateSpan.setStatus({ code: SpanStatusCode.OK });
          logger.info(`Order ${orderId} processed, status: ${order.status}`, {
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
          });
        } catch (error) {
          updateSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          updateSpan.end();
        }
      });

      span.setStatus({ code: SpanStatusCode.OK });
      channel.ack(msg);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      logger.error(`Error processing order: ${error.message}`, {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
      if (channel && msg) {
        channel.nack(msg, false, true); // Requeue on failure
      }
    } finally {
      span.end();
    }
  });
}

module.exports = { processOrderMessage };