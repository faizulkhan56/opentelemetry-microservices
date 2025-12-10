# OpenTelemetry Implementation Documentation

## Table of Contents
1. [Overview](#overview)
2. [Tracing Initialization](#tracing-initialization)
3. [Span Creation & Management](#span-creation--management)
4. [Context Propagation](#context-propagation)
5. [Logger Integration](#logger-integration)
6. [Event Tracking](#event-tracking)
7. [Service Connectivity](#service-connectivity)
8. [Complete Trace Flow](#complete-trace-flow)
9. [Reference Guide](#reference-guide)

---

## Overview

This project implements distributed tracing using OpenTelemetry to track requests across multiple microservices. The implementation provides:

- **Distributed Tracing**: Track requests across Order API and Order Processor
- **Context Propagation**: Maintain trace context through RabbitMQ messages
- **Span Hierarchy**: Parent-child span relationships
- **Event Tracking**: Detailed events within spans
- **Error Tracking**: Automatic error status in spans
- **Logger Correlation**: Logs include trace IDs for correlation

---

## Tracing Initialization

### Order API: `order-api/src/tracing.js`

```javascript
// Initialize OpenTelemetry diagnostics first
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// Load instrumentations before other dependencies
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
```

**Key Points:**
1. **Early Initialization**: Must be required first (`require('./tracing')` in `index.js`)
2. **Auto-Instrumentation**: Automatically instruments Express, MongoDB, RabbitMQ, Winston
3. **OTLP Exporter**: Sends traces to Tempo via gRPC (port 4317)
4. **Service Name**: Identifies service in traces (`order-api`)

**Configuration:**
```javascript
const instrumentations = getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-express': { enabled: true },  // HTTP requests
  '@opentelemetry/instrumentation-mongodb': { enabled: true },  // MongoDB queries
  '@opentelemetry/instrumentation-amqplib': { enabled: true },   // RabbitMQ
  '@opentelemetry/instrumentation-winston': { enabled: true },  // Logging
  '@opentelemetry/instrumentation-grpc': { enabled: true },     // gRPC (for OTLP)
});
```

### Order Processor: `order-processor/src/tracing.js`

Similar setup but without Express instrumentation (no HTTP server):

```javascript
const instrumentations = getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-mongodb': { enabled: true },
  '@opentelemetry/instrumentation-amqplib': { enabled: true },
  '@opentelemetry/instrumentation-winston': { enabled: true },
  '@opentelemetry/instrumentation-grpc': { enabled: true },
});
```

**Why No Express?**: Order Processor doesn't have HTTP endpoints, only consumes from RabbitMQ.

---

## Span Creation & Management

### Manual Span Creation

#### Order API Controller: `order-api/src/controllers/orders.controller.js`

**Parent Span - createOrder:**
```javascript
const tracer = trace.getTracer('order-api');
return tracer.startActiveSpan('create-order', async (span) => {
  try {
    // Business logic
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  } finally {
    span.end();  // Always end the span
  }
});
```

**Child Span - MongoDB Save:**
```javascript
await tracer.startActiveSpan('save-order-mongodb', async (mongoSpan) => {
  try {
    mongoSpan.addEvent('Saving Order to MongoDB');
    await order.save();
    mongoSpan.setAttribute('order.id', order._id.toString());
    mongoSpan.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    mongoSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    mongoSpan.end();
  }
});
```

**Child Span - RabbitMQ Publish:**
```javascript
await tracer.startActiveSpan('publish-rabbitmq', async (rabbitSpan) => {
  try {
    rabbitSpan.addEvent('Publishing message to RabbitMQ');
    await publishMessage({ orderId: order._id.toString() });
    rabbitSpan.setAttribute('order.id', order._id.toString());
    rabbitSpan.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    rabbitSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    rabbitSpan.end();
  }
});
```

### Span Hierarchy in Order API

```
create-order (parent span)
├── save-order-mongodb (child span)
└── publish-rabbitmq (child span)
```

### Order Processor Consumer: `order-processor/src/consumers/order.consumer.js`

**Parent Span - processOrder:**
```javascript
const tracer = trace.getTracer('order-processor');
const parentContext = propagation.extract(context.active(), headers);
return tracer.startActiveSpan('process-order', { kind: 1 }, parentContext, async (span) => {
  // This span is a child of the span from order-api
});
```

**Child Spans:**
```javascript
await tracer.startActiveSpan('fetch-order-mongodb', async (fetchSpan) => {
  // Fetches order from MongoDB
});

await tracer.startActiveSpan('process-order-logic', async (logicSpan) => {
  // Business logic processing
});

await tracer.startActiveSpan('update-order-mongodb', async (updateSpan) => {
  // Updates order in MongoDB
});
```

### Complete Span Hierarchy

```
create-order (order-api)
├── save-order-mongodb (order-api)
└── publish-rabbitmq (order-api)
    │
    └── process-order (order-processor) [CONTEXT PROPAGATED]
        ├── fetch-order-mongodb (order-processor)
        ├── process-order-logic (order-processor)
        └── update-order-mongodb (order-processor)
```

---

## Context Propagation

### How Context Propagation Works

Context propagation maintains trace continuity across service boundaries. In this system, it flows:
1. **Order API** → **RabbitMQ** (via message headers)
2. **RabbitMQ** → **Order Processor** (extracted from message headers)

### Step 1: Injecting Context (Order API)

**File**: `order-api/src/services/rabbitmq.service.js`

```javascript
const { context, propagation } = require('@opentelemetry/api');

async function publishMessage(message) {
  const headers = {};
  // Inject current trace context into headers
  propagation.inject(context.active(), headers);
  
  channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    headers,  // Context is in headers
  });
}
```

**What Happens:**
- `context.active()` gets the current active span context
- `propagation.inject()` serializes trace context into headers
- Headers contain: `traceparent`, `tracestate` (W3C Trace Context format)
- These headers are sent with the RabbitMQ message

**Example Headers:**
```javascript
{
  traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  tracestate: ""
}
```

### Step 2: Extracting Context (Order Processor)

**File**: `order-processor/src/consumers/order.consumer.js`

```javascript
const { context, propagation } = require('@opentelemetry/api');

async function processOrderMessage(msg, channel) {
  const tracer = trace.getTracer('order-processor');
  const headers = msg.properties.headers || {};
  
  // Extract trace context from message headers
  const parentContext = propagation.extract(context.active(), headers);
  
  // Create span with extracted context as parent
  return tracer.startActiveSpan('process-order', { kind: 1 }, parentContext, async (span) => {
    // This span is now a child of the span from order-api
  });
}
```

**What Happens:**
- `msg.properties.headers` contains the injected context
- `propagation.extract()` deserializes trace context from headers
- `parentContext` contains the parent span context
- New span is created as a child of the parent span

**Span Kind:**
- `{ kind: 1 }` = `SpanKind.CONSUMER` (indicates this is a message consumer)

### Visual Representation

```
Order API Service
│
├─ Span: create-order
│  │
│  └─ Span: publish-rabbitmq
│     │
│     └─ [Context Injected into Headers]
│        │
│        ▼
│     RabbitMQ Message
│     Headers: { traceparent: "...", tracestate: "" }
│        │
│        ▼
│     [Context Extracted from Headers]
│        │
│        ▼
Order Processor Service
│
└─ Span: process-order (CHILD of create-order)
   │
   └─ Same Trace ID, Different Span ID
```

### Why Context Propagation Matters

1. **Trace Continuity**: Single trace across multiple services
2. **Request Tracking**: Follow a request from API to processor
3. **Performance Analysis**: See total time across services
4. **Error Correlation**: Link errors across service boundaries
5. **Debugging**: Understand request flow end-to-end

---

## Logger Integration

### Logger Configuration

**File**: `order-api/src/utils/logger.js` & `order-processor/src/utils/logger.js`

```javascript
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
```

### How It Works

1. **Active Span Detection**: `trace.getSpan(context.active())` gets current active span
2. **Trace ID Extraction**: `spanContext().traceId` extracts trace ID
3. **Automatic Injection**: Winston metadata formatter adds trace ID to every log
4. **Fallback**: Returns `'n/a'` if no active span

### Log Output Example

```json
{
  "level": "info",
  "message": "Order created: 507f1f77bcf86cd799439011",
  "timestamp": "2025-12-10T04:11:23.279Z",
  "traceId": "abe73447471bda8e2ab41b8c20290c9b",
  "spanId": "6a59e7c07e182ac9",
  "traceFlags": "01"
}
```

### Manual Trace ID in Logs

In controllers, trace IDs are manually added for additional context:

```javascript
logger.info(`Order created: ${order._id}`, {
  traceId: span.spanContext().traceId,
  spanId: span.spanContext().spanId,
  traceFlags: span.spanContext().traceFlags.toString(16),
});
```

**Why Both?**
- **Automatic**: Winston adds trace ID to all logs
- **Manual**: Controllers add span ID and trace flags for more detail

### Logger-Trace Correlation

1. **Find Logs by Trace ID**: Search logs for specific trace ID
2. **Find Traces by Log Message**: Search traces, then find related logs
3. **Error Correlation**: Link error logs to error spans
4. **Debugging**: Trace ID in logs helps debug distributed issues

---

## Event Tracking

### What Are Events?

Events are timestamped annotations within a span that mark important moments:

```javascript
span.addEvent('Validating order input');
span.addEvent('Calculating total amount');
span.addEvent('Creating order document');
```

### Events in Order API

**createOrder Function:**
1. `'Validating order input'` - Before validation
2. `'Calculating total amount'` - Before calculation
3. `'Creating order document'` - Before model creation

**save-order-mongodb Span:**
1. `'Saving Order to MongoDB'` - Before database save

**publish-rabbitmq Span:**
1. `'Publishing message to RabbitMQ'` - Before message publish

### Events in Order Processor

**fetch-order-mongodb Span:**
1. `'Fetching order from MongoDB'` - Before database query

**process-order-logic Span:**
1. `'Processing order business logic'` - Before processing

**update-order-mongodb Span:**
1. `'Updating order in MongoDB'` - Before database update

### Event Benefits

1. **Timeline View**: See exact sequence of operations
2. **Performance Analysis**: Time between events shows bottlenecks
3. **Debugging**: Understand what happened and when
4. **Documentation**: Events document the flow

---

## Service Connectivity

### How Services Connect Through Tracing

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenTelemetry SDK                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Express      │  │ MongoDB      │  │ RabbitMQ     │     │
│  │ Instrument. │  │ Instrument.  │  │ Instrument.  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │ OTLP Exporter│
                    │  (gRPC)      │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Tempo     │
                    │  (Port 4317) │
                    └─────────────┘
```

### Auto-Instrumentation

**Express Instrumentation:**
- Automatically creates spans for HTTP requests
- Captures: method, URL, status code, duration
- No manual code needed

**MongoDB Instrumentation:**
- Automatically creates spans for database operations
- Captures: operation type, collection, query duration
- Works with Mongoose

**RabbitMQ Instrumentation:**
- Automatically creates spans for publish/consume
- Captures: queue name, message size
- Works with amqplib

**Winston Instrumentation:**
- Automatically adds trace context to logs
- Correlates logs with spans

### Manual Instrumentation

Manual spans are created for:
1. **Business Logic**: `create-order`, `process-order`
2. **Specific Operations**: `save-order-mongodb`, `publish-rabbitmq`
3. **Custom Tracking**: Operations not auto-instrumented

---

## Complete Trace Flow

### End-to-End Trace Example

**Request**: `POST http://localhost:8081/orders`

```
1. Nginx receives request
   │
   ▼
2. Express Auto-Instrumentation
   │ Creates span: HTTP POST /orders
   │
   ▼
3. Order API Controller
   │ Creates span: create-order (parent)
   │
   ├─► Event: "Validating order input"
   │
   ├─► Event: "Calculating total amount"
   │
   ├─► Event: "Creating order document"
   │
   ├─► Creates span: save-order-mongodb (child)
   │   │
   │   ├─► Event: "Saving Order to MongoDB"
   │   │
   │   ├─► MongoDB Auto-Instrumentation
   │   │   Creates span: mongodb.save (auto)
   │   │
   │   └─► Sets attribute: order.id
   │
   └─► Creates span: publish-rabbitmq (child)
       │
       ├─► Event: "Publishing message to RabbitMQ"
       │
       ├─► Context Injection
       │   Headers: { traceparent: "...", tracestate: "" }
       │
       ├─► RabbitMQ Auto-Instrumentation
       │   Creates span: amqp.publish (auto)
       │
       └─► Sets attribute: order.id
           │
           ▼
4. RabbitMQ Message Queue
   │ Message with trace context in headers
   │
   ▼
5. Order Processor Consumer
   │
   ├─► Context Extraction
   │   Extracts trace context from headers
   │
   └─► Creates span: process-order (child of create-order)
       │
       ├─► Creates span: fetch-order-mongodb (child)
       │   │
       │   ├─► Event: "Fetching order from MongoDB"
       │   │
       │   ├─► MongoDB Auto-Instrumentation
       │   │   Creates span: mongodb.find (auto)
       │   │
       │   └─► Sets attribute: order.id
       │
       ├─► Creates span: process-order-logic (child)
       │   │
       │   ├─► Event: "Processing order business logic"
       │   │
       │   └─► Sets attributes: order.id, order.status
       │
       └─► Creates span: update-order-mongodb (child)
           │
           ├─► Event: "Updating order in MongoDB"
           │
           ├─► MongoDB Auto-Instrumentation
           │   Creates span: mongodb.save (auto)
           │
           └─► Sets attributes: order.id, order.status
```

### Trace Structure in Tempo

```
Trace ID: abe73447471bda8e2ab41b8c20290c9b
│
├─ Span: HTTP POST /orders (auto, Express)
│  │
│  └─ Span: create-order (manual, order-api)
│     │
│     ├─ Span: save-order-mongodb (manual, order-api)
│     │  │
│     │  └─ Span: mongodb.save (auto, MongoDB)
│     │
│     └─ Span: publish-rabbitmq (manual, order-api)
│        │
│        ├─ Span: amqp.publish (auto, RabbitMQ)
│        │
│        └─ Span: process-order (manual, order-processor)
│           │
│           ├─ Span: fetch-order-mongodb (manual, order-processor)
│           │  │
│           │  └─ Span: mongodb.find (auto, MongoDB)
│           │
│           ├─ Span: process-order-logic (manual, order-processor)
│           │
│           └─ Span: update-order-mongodb (manual, order-processor)
│              │
│              └─ Span: mongodb.save (auto, MongoDB)
```

---

## Reference Guide

### OpenTelemetry API Imports

```javascript
const { 
  trace,           // For creating tracers and spans
  context,         // For context management
  propagation,     // For context propagation
  SpanStatusCode   // For span status codes
} = require('@opentelemetry/api');
```

### Tracer Creation

```javascript
const tracer = trace.getTracer('service-name');
```

### Span Creation

```javascript
// Simple span
tracer.startActiveSpan('span-name', async (span) => {
  // Your code
  span.end();
});

// Span with parent context
tracer.startActiveSpan('span-name', { kind: 1 }, parentContext, async (span) => {
  // Your code
  span.end();
});
```

### Span Status

```javascript
// Success
span.setStatus({ code: SpanStatusCode.OK });

// Error
span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
```

### Span Attributes

```javascript
span.setAttribute('order.id', orderId);
span.setAttribute('order.status', status);
```

### Span Events

```javascript
span.addEvent('Event description');
```

### Context Propagation

```javascript
// Inject context
const headers = {};
propagation.inject(context.active(), headers);

// Extract context
const parentContext = propagation.extract(context.active(), headers);
```

### Span Context

```javascript
const spanContext = span.spanContext();
const traceId = spanContext.traceId;
const spanId = spanContext.spanId;
const traceFlags = spanContext.traceFlags;
```

### Logger Integration

```javascript
// Get active span
const activeSpan = trace.getSpan(context.active());

// Get trace ID
const traceId = activeSpan?.spanContext().traceId || 'n/a';
```

### Span Kinds

- `SpanKind.SERVER` (0): Incoming request
- `SpanKind.CLIENT` (1): Outgoing request
- `SpanKind.CONSUMER` (2): Message consumer
- `SpanKind.PRODUCER` (3): Message producer
- `SpanKind.INTERNAL` (4): Internal operation

---

## Key Concepts Summary

### 1. Trace
- Represents a complete request flow
- Contains multiple spans
- Identified by Trace ID

### 2. Span
- Represents a single operation
- Has parent-child relationships
- Contains events, attributes, status

### 3. Context
- Carries trace information
- Propagated across service boundaries
- Maintains parent-child relationships

### 4. Events
- Timestamped annotations in spans
- Mark important moments
- Help understand flow

### 5. Attributes
- Key-value pairs on spans
- Used for filtering and searching
- Add business context

### 6. Status
- Indicates span success/failure
- ERROR status for failures
- OK status for success

---

## Best Practices

1. **Always End Spans**: Use try-finally to ensure spans end
2. **Set Status**: Always set span status (OK or ERROR)
3. **Add Attributes**: Add relevant business attributes
4. **Use Events**: Mark important operations with events
5. **Propagate Context**: Always propagate context across boundaries
6. **Correlate Logs**: Include trace IDs in logs
7. **Error Handling**: Set ERROR status on exceptions

---

## Troubleshooting

### No Traces Appearing

1. Check Tempo is running: `http://localhost:3200`
2. Check OTLP endpoint: `http://tempo:4317`
3. Check service name in config
4. Verify tracing.js is required first

### Context Not Propagating

1. Check headers are being sent in RabbitMQ message
2. Verify `propagation.inject()` is called before publish
3. Verify `propagation.extract()` is called before span creation
4. Check parent context is passed to `startActiveSpan()`

### Logs Missing Trace IDs

1. Verify Winston instrumentation is enabled
2. Check logger is using metadata formatter
3. Ensure active span exists when logging

---

## Summary

This OpenTelemetry implementation provides:

- **Full Trace Visibility**: See complete request flow across services
- **Context Propagation**: Maintain trace continuity through RabbitMQ
- **Automatic Instrumentation**: Express, MongoDB, RabbitMQ auto-tracked
- **Manual Instrumentation**: Business logic spans for detailed tracking
- **Log Correlation**: Trace IDs in logs for easy debugging
- **Error Tracking**: Automatic error status in spans
- **Performance Analysis**: Duration tracking for all operations

The system enables complete observability of the distributed order processing pipeline.

