# OpenTelemetry Microservices - Order Management System

A comprehensive microservices-based order management system with distributed tracing using OpenTelemetry, Tempo, and Grafana.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [System Architecture](#system-architecture)
5. [Service Architecture](#service-architecture)
6. [OpenTelemetry Implementation](#opentelemetry-implementation)
7. [Querying Traces with TraceQL](#querying-traces-with-traceql)
8. [Testing with Postman](#testing-with-postman)
9. [Configuration](#configuration)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This project demonstrates a production-ready microservices architecture with:

- **Order API Service**: RESTful API for creating and retrieving orders
- **Order Processor Service**: Background service for asynchronous order processing
- **MongoDB**: Document database for order persistence
- **RabbitMQ**: Message queue for asynchronous communication
- **Nginx**: Reverse proxy and API gateway
- **OpenTelemetry**: Distributed tracing across services
- **Tempo**: Trace storage and querying
- **Grafana**: Visualization and observability dashboard

### Key Features

- ✅ Distributed tracing across microservices
- ✅ Context propagation through RabbitMQ
- ✅ Automatic instrumentation (Express, MongoDB, RabbitMQ)
- ✅ Manual instrumentation for business logic
- ✅ Log correlation with trace IDs
- ✅ Error tracking and monitoring
- ✅ Performance analysis

---

## Prerequisites

- **Docker** and **Docker Compose** installed
- **Node.js** 20+ (for local development)
- **Postman** (for API testing)
- **Git** (for cloning the repository)

### Ports Used

| Service | Port | Description |
|---------|------|-------------|
| Nginx | 8081 | API Gateway |
| Order API | 3000 | REST API (internal) |
| MongoDB | 27017 | Database |
| RabbitMQ | 5672 | Message Queue |
| RabbitMQ Management | 15672 | Management UI |
| Tempo | 3200 | HTTP API |
| Tempo | 4317 | OTLP gRPC |
| Grafana | 3001 | Dashboard |

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd opentelemetry-microservices
```

### 2. Start Services

```bash
docker-compose up -d --build
```

This will start all services:
- MongoDB with replica set
- RabbitMQ
- Tempo
- Grafana
- Order API
- Order Processor
- Nginx

### 3. Verify Services

**Check Health:**
```bash
curl http://localhost:8081/health
```

**Access Services:**
- **Grafana**: http://localhost:3001
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)
- **Tempo API**: http://localhost:3200

### 4. Create Your First Order

```bash
curl -X POST http://localhost:8081/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUST001",
    "customerEmail": "test@example.com",
    "items": [{
      "productId": "PROD001",
      "name": "Test Product",
      "quantity": 1,
      "price": 99.99
    }],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    }
  }'
```

### 5. View Traces in Grafana

1. Open http://localhost:3001
2. Go to **Explore** → Select **Tempo** datasource
3. Use TraceQL queries (see [TraceQL Commands](#querying-traces-with-traceql))

---

## System Architecture

### High-Level Architecture

```
┌─────────┐
│ Client  │
└────┬────┘
     │ HTTP Request
     ▼
┌─────────┐
│  Nginx  │ (Port 8081) - Reverse Proxy & Rate Limiting
│ Reverse │
│  Proxy  │
└────┬────┘
     │ Proxy to
     ▼
┌─────────────┐
│  Order API  │ (Port 3000) - REST API Service
│   Service   │
└─────┬───────┘
      │
      ├──► MongoDB (Port 27017) - Data Persistence
      │
      └──► RabbitMQ (Port 5672) - Message Queue
              │
              │ Message Queue (with Trace Context)
              ▼
        ┌──────────────┐
        │Order Processor│ - Background Processing Service
        │   Service     │
        └──────┬───────┘
               │
               └──► MongoDB (Port 27017) - Update Orders
```

### Service Responsibilities

**Order API:**
- Receives HTTP requests via Nginx
- Validates order data
- Saves orders to MongoDB
- Publishes order processing messages to RabbitMQ
- Returns order ID to client

**Order Processor:**
- Consumes messages from RabbitMQ
- Fetches orders from MongoDB
- Processes orders (business logic)
- Updates order status in MongoDB
- Acknowledges messages

**Nginx:**
- Single entry point for clients
- Rate limiting (10 req/s)
- Load balancing (future)
- Request routing

---

## Service Architecture

### Order API Service

#### Entry Point: `order-api/src/index.js`

The service initialization flow:

```javascript
require('./tracing');  // Initialize OpenTelemetry FIRST
const express = require('express');
const { connectMongoDB } = require('./services/mongodb.service');
const { connectRabbitMQ } = require('./services/rabbitmq.service');
const ordersRoutes = require('./routes/orders.routes');
```

**Initialization Steps:**
1. **Tracing Initialization**: Must be first to instrument all modules
2. **Express Setup**: Creates Express app with JSON middleware
3. **Health Check**: `/health` endpoint for container health checks
4. **Route Registration**: Mounts order routes at `/orders`
5. **Error Middleware**: Global error handler
6. **Service Connections**: Connects to MongoDB and RabbitMQ
7. **Server Start**: Listens on port 3000

#### Routing Layer: `order-api/src/routes/orders.routes.js`

```javascript
router.post('/', createOrder);    // POST /orders
router.get('/:id', getOrder);     // GET /orders/:id
```

#### Controller Layer: `order-api/src/controllers/orders.controller.js`

**createOrder Function:**
1. Input validation (customerId, customerEmail, items, shippingAddress)
2. Total amount calculation
3. Order model instance creation
4. MongoDB save (with separate span)
5. RabbitMQ publish (with separate span and context propagation)
6. Response with order ID

**getOrder Function:**
1. Fetch order from MongoDB by ID
2. Validate order exists
3. Return order JSON or 404

#### Service Layer

**MongoDB Service** (`order-api/src/services/mongodb.service.js`):
- Manages MongoDB connection
- Replica set support
- Connection pooling
- Auto-reconnection

**RabbitMQ Service** (`order-api/src/services/rabbitmq.service.js`):
- Manages RabbitMQ connection with retry logic
- Publishes messages with OpenTelemetry context in headers
- Context propagation: `propagation.inject(context.active(), headers)`

### Order Processor Service

#### Entry Point: `order-processor/src/index.js`

Background service that processes orders asynchronously:

```javascript
require('./tracing');  // Initialize OpenTelemetry FIRST
const { connectMongoDB } = require('./services/mongodb.service');
const { connectRabbitMQ } = require('./services/rabbitmq.service');
const { processOrderMessage } = require('./consumers/order.consumer');
```

**Initialization Steps:**
1. Tracing initialization
2. MongoDB connection
3. RabbitMQ connection with consumer setup
4. Message consumption from `order_queue`

#### Consumer: `order-processor/src/consumers/order.consumer.js`

**processOrderMessage Function Flow:**
1. **Context Extraction**: Extracts trace context from RabbitMQ message headers
2. **Parent Span Creation**: Creates `process-order` span with extracted context
3. **Order Fetch**: Fetches order from MongoDB (child span)
4. **Status Check**: Validates order is in `CREATED` status
5. **Business Logic**: Processes order (child span)
   - Sets status to `PROCESSING`
   - Simulates work (1 second delay)
   - Updates status to `SHIPPED` (90%) or `CANCELLED` (10%)
6. **Database Update**: Saves updated order (child span)
7. **Message Acknowledgment**: ACKs on success, NACKs on error

### Data Layer & Models

#### Order Model

Both services use the same Mongoose schema:

**OrderItemSchema:**
- `productId`: String (required)
- `name`: String (required)
- `quantity`: Number (required, min: 1)
- `price`: Number (required, min: 0)

**OrderSchema:**
- `customerId`: String (required, indexed)
- `customerEmail`: String (required)
- `items`: Array of OrderItemSchema (required, min: 1)
- `totalAmount`: Number (auto-calculated if not provided)
- `shippingAddress`: Object with required fields
- `status`: Enum ['CREATED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
- `paymentStatus`: Enum ['PENDING', 'PAID', 'FAILED', 'REFUNDED']
- `timestamps`: true (adds createdAt, updatedAt)

**Model Features:**
- Pre-save hook calculates `totalAmount` automatically
- Indexes on `customerId` and `status` for performance
- Validation for all required fields

### Nginx Integration

**Configuration**: `nginx/nginx.conf`

```nginx
upstream order_api {
  server order-api:3000;
}

server {
  listen 80;
  location /orders {
    limit_req zone=mylimit burst=20;  # Rate limiting
    proxy_pass http://order_api;
  }
}
```

**Features:**
- Reverse proxy from port 8081 to 3000
- Rate limiting: 10 requests/second (burst: 20)
- Request header preservation
- Single entry point for clients

---

## OpenTelemetry Implementation

### Overview

OpenTelemetry provides distributed tracing across all services, maintaining trace continuity through RabbitMQ message queues.

### Tracing Initialization

#### Order API: `order-api/src/tracing.js`

```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const instrumentations = getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-express': { enabled: true },
  '@opentelemetry/instrumentation-mongodb': { enabled: true },
  '@opentelemetry/instrumentation-amqplib': { enabled: true },
  '@opentelemetry/instrumentation-winston': { enabled: true },
  '@opentelemetry/instrumentation-grpc': { enabled: true },
});

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://tempo:4317',
  }),
  instrumentations: [instrumentations],
  serviceName: 'order-api',
});
```

**Key Points:**
- Must be required FIRST in `index.js`
- Auto-instruments Express, MongoDB, RabbitMQ, Winston
- Exports traces to Tempo via gRPC (port 4317)

#### Order Processor: `order-processor/src/tracing.js`

Similar setup but without Express instrumentation (no HTTP server).

### Span Creation & Hierarchy

#### Order API Spans

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
    span.end();
  }
});
```

**Child Spans:**
- `save-order-mongodb`: MongoDB save operation
- `publish-rabbitmq`: RabbitMQ publish operation

#### Order Processor Spans

**Parent Span - processOrder:**
```javascript
const parentContext = propagation.extract(context.active(), headers);
return tracer.startActiveSpan('process-order', { kind: 1 }, parentContext, async (span) => {
  // This span is a child of the span from order-api
});
```

**Child Spans:**
- `fetch-order-mongodb`: Fetch order from MongoDB
- `process-order-logic`: Business logic processing
- `update-order-mongodb`: Update order in MongoDB

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

### Context Propagation

#### Step 1: Injecting Context (Order API)

**File**: `order-api/src/services/rabbitmq.service.js`

```javascript
const headers = {};
propagation.inject(context.active(), headers);
channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(message)), {
  persistent: true,
  headers,  // Contains trace context
});
```

**What Happens:**
- `context.active()` gets current active span context
- `propagation.inject()` serializes trace context into headers
- Headers contain: `traceparent`, `tracestate` (W3C Trace Context format)
- Headers are sent with RabbitMQ message

#### Step 2: Extracting Context (Order Processor)

**File**: `order-processor/src/consumers/order.consumer.js`

```javascript
const headers = msg.properties.headers || {};
const parentContext = propagation.extract(context.active(), headers);
return tracer.startActiveSpan('process-order', { kind: 1 }, parentContext, async (span) => {
  // This span is now a child of the span from order-api
});
```

**What Happens:**
- Extracts headers from RabbitMQ message
- `propagation.extract()` deserializes trace context
- Creates new span as child of parent span
- Maintains trace continuity across services

### Logger Integration

**File**: `order-api/src/utils/logger.js` & `order-processor/src/utils/logger.js`

```javascript
const winston = require('winston');
const { trace, context } = require('@opentelemetry/api');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.metadata({
      fillWith: () => ({
        traceId: trace.getSpan(context.active())?.spanContext().traceId || 'n/a',
      }),
    })
  ),
});
```

**How It Works:**
- Automatically extracts trace ID from active span
- Adds trace ID to every log entry
- Enables log-trace correlation

**Log Output Example:**
```json
{
  "level": "info",
  "message": "Order created: 507f1f77bcf86cd799439011",
  "timestamp": "2025-12-10T04:11:23.279Z",
  "traceId": "abe73447471bda8e2ab41b8c20290c9b"
}
```

### Event Tracking

Events are timestamped annotations within spans:

```javascript
span.addEvent('Validating order input');
span.addEvent('Calculating total amount');
span.addEvent('Saving Order to MongoDB');
```

**Events in Order API:**
- `'Validating order input'`
- `'Calculating total amount'`
- `'Creating order document'`
- `'Saving Order to MongoDB'`
- `'Publishing message to RabbitMQ'`

**Events in Order Processor:**
- `'Fetching order from MongoDB'`
- `'Processing order business logic'`
- `'Updating order in MongoDB'`

### Auto-Instrumentation

**Express Instrumentation:**
- Automatically creates spans for HTTP requests
- Captures: method, URL, status code, duration

**MongoDB Instrumentation:**
- Automatically creates spans for database operations
- Captures: operation type, collection, query duration

**RabbitMQ Instrumentation:**
- Automatically creates spans for publish/consume
- Captures: queue name, message size

**Winston Instrumentation:**
- Automatically adds trace context to logs

---

## Querying Traces with TraceQL

### Accessing Grafana

1. Open http://localhost:3001
2. Go to **Explore**
3. Select **Tempo** datasource
4. Choose **TraceQL** query type

### Basic Service Queries

**Order API Service:**
```
{ .service.name = "order-api" }
```

**Order Processor Service:**
```
{ .service.name = "order-processor" }
```

**Both Services:**
```
{ .service.name = "order-api" } || { .service.name = "order-processor" }
```

### Span Name Queries

**Create Order:**
```
{ name = "create-order" }
```

**Process Order:**
```
{ name = "process-order" }
```

**All MongoDB Operations:**
```
{ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }
```

### Duration Queries

**Slow Operations (> 0.2 seconds):**
```
{ duration > 0.2s }
```

**Slow Order Processor:**
```
{ .service.name = "order-processor" } | { duration > 0.2s }
```

**Slow MongoDB Operations:**
```
{ name = "save-order-mongodb" } | { duration > 0.5s }
```

### Error Queries

**All Errors:**
```
{ status = error }
```

**Errors in Order API:**
```
{ .service.name = "order-api" } | { status = error }
```

**Errors in Order Processing:**
```
{ name = "process-order" } | { status = error }
```

### Combined Queries

**Slow Order API Create:**
```
{ .service.name = "order-api" } | { name = "create-order" } | { duration > 1s }
```

**All MongoDB Errors:**
```
({ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }) | { status = error }
```

**Complete Order Flow:**
```
{ name = "create-order" } || { name = "save-order-mongodb" } || { name = "publish-rabbitmq" } || { name = "process-order" } || { name = "fetch-order-mongodb" } || { name = "process-order-logic" } || { name = "update-order-mongodb" }
```

### TraceQL Syntax Reference

**Operators:**
- `=` : Equals
- `!=` : Not equals
- `>` : Greater than
- `<` : Less than
- `||` : Logical OR (for multiple conditions)
- `|` : Pipeline operator (for filtering)

**Field Names:**
- `.service.name` : Service name (resource attribute)
- `name` : Span name
- `status` : Span status (error, ok, unset)
- `duration` : Span duration

**Duration Units:**
- `s` : Seconds
- `ms` : Milliseconds

**Usage Tips:**
1. Use parentheses when combining `||` and filtering: `({ condition1 } || { condition2 }) | { filter }`
2. Use `||` for OR operations (not `or`)
3. Use `|` for pipeline filtering
4. Always use `.service.name` with dot prefix
5. Duration must include unit (`s` or `ms`)

For complete TraceQL command reference, see all verified commands in the [TraceQL Commands](#traceql-commands-reference) section below.

---

## Testing with Postman

### Setup

1. **Create Postman Environment:**
   - `base_url`: `http://localhost:8081`
   - `api_url`: `http://localhost:3000`
   - `order_id`: (will be set after order creation)

2. **Create Postman Collection:**
   - Folder: "Successful Tests"
   - Folder: "Error Tests"

### Successful Test Cases

#### Test 1: Health Check

**Request:**
- Method: `GET`
- URL: `{{base_url}}/health`

**Expected Response:**
- Status: `200 OK`
- Body: `{ "status": "OK" }`

#### Test 2: Create Order

**Request:**
- Method: `POST`
- URL: `{{base_url}}/orders`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "customerId": "CUST001",
  "customerEmail": "alice.johnson@email.com",
  "items": [
    {
      "productId": "LAPTOP001",
      "name": "MacBook Pro 16-inch",
      "quantity": 1,
      "price": 2499.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  }
}
```

**Expected Response:**
- Status: `201 Created`
- Body: `{ "orderId": "...", "status": "CREATED" }`

**Post-Request Script:**
```javascript
if (pm.response.code === 201) {
    const response = pm.response.json();
    pm.environment.set("order_id", response.orderId);
}
```

#### Test 3: Get Order

**Request:**
- Method: `GET`
- URL: `{{base_url}}/orders/{{order_id}}`

**Expected Response:**
- Status: `200 OK`
- Body: Complete order object

### Error Test Cases

#### Error Test 1: Missing Required Fields

**Request:**
- Method: `POST`
- URL: `{{base_url}}/orders`
- Body:
```json
{
  "customerId": "CUST_ERROR"
}
```

**Expected Response:**
- Status: `400 Bad Request`
- Body: `{ "error": "Missing required fields" }`

#### Error Test 2: Invalid Order ID

**Request:**
- Method: `GET`
- URL: `{{base_url}}/orders/INVALID_ID_12345`

**Expected Response:**
- Status: `404 Not Found`
- Body: `{ "error": "Order not found" }`

#### Error Test 3: Missing Item Fields

**Request:**
- Method: `POST`
- URL: `{{base_url}}/orders`
- Body:
```json
{
  "customerId": "CUST_ERROR",
  "customerEmail": "test@error.com",
  "items": [{"productId": "PROD001"}],
  "shippingAddress": {...}
}
```

**Expected Response:**
- Status: `400 Bad Request`
- Body: `{ "error": "Item price or quantity missing" }`

For complete test cases including all error scenarios, see the [Postman Tests](#postman-test-cases) section below.

---

## Configuration

### Environment Variables

**Order API** (`docker-compose.yml`):
- `MONGO_URI`: `mongodb://mongodb:27017/orders_db?replicaSet=rs0`
- `RABBITMQ_URL`: `amqp://rabbitmq:5672`
- `OTEL_EXPORTER_OTLP_ENDPOINT`: `http://tempo:4317`
- `OTEL_SERVICE_NAME`: `order-api`
- `NODE_ENV`: `development`
- `PORT`: `3000` (default)

**Order Processor** (`docker-compose.yml`):
- `MONGO_URI`: `mongodb://mongodb:27017/orders_db?replicaSet=rs0`
- `RABBITMQ_URL`: `amqp://rabbitmq:5672`
- `OTEL_EXPORTER_OTLP_ENDPOINT`: `http://tempo:4317`
- `OTEL_SERVICE_NAME`: `order-processor`
- `NODE_ENV`: `development`

### Docker Compose Services

All services are configured in `docker-compose.yml`:
- **Nginx**: Reverse proxy on port 8081
- **Order API**: Node.js service on port 3000
- **Order Processor**: Node.js background service
- **MongoDB**: Database on port 27017
- **RabbitMQ**: Message queue on ports 5672, 15672
- **Tempo**: Trace storage on ports 3200, 4317
- **Grafana**: Dashboard on port 3001

### Service Dependencies

**Startup Order:**
1. MongoDB (must be healthy)
2. RabbitMQ (must be healthy)
3. Tempo (must be started)
4. Order API (waits for MongoDB, RabbitMQ, Tempo)
5. Order Processor (waits for MongoDB, RabbitMQ, Tempo)
6. Nginx (waits for Order API to be healthy)
7. Grafana (waits for Tempo)

---

## Troubleshooting

### Services Not Starting

**Issue**: Containers exit immediately

**Solutions:**
1. Check logs: `docker-compose logs <service-name>`
2. Verify Docker Desktop is running
3. Check port conflicts
4. Verify file permissions (Windows: Docker Desktop file sharing)

### MongoDB Connection Issues

**Issue**: "Failed to connect to MongoDB"

**Solutions:**
1. Wait for MongoDB to be healthy: `docker-compose ps mongodb`
2. Check MongoDB logs: `docker-compose logs mongodb`
3. Verify replica set is initialized
4. Check connection string in environment variables

### RabbitMQ Connection Issues

**Issue**: "Failed to connect to RabbitMQ"

**Solutions:**
1. Wait for RabbitMQ to be healthy: `docker-compose ps rabbitmq`
2. Check RabbitMQ logs: `docker-compose logs rabbitmq`
3. Verify RabbitMQ management UI: http://localhost:15672
4. Check connection URL in environment variables

### No Traces Appearing in Grafana

**Issue**: Traces not showing in Grafana

**Solutions:**
1. Verify Tempo is running: `docker-compose ps tempo`
2. Check Tempo logs: `docker-compose logs tempo`
3. Verify OTLP endpoint: `http://tempo:4317`
4. Check service names in config
5. Verify `tracing.js` is required first in `index.js`
6. Check Tempo API: http://localhost:3200

### Context Not Propagating

**Issue**: Traces don't connect between services

**Solutions:**
1. Verify `propagation.inject()` is called before RabbitMQ publish
2. Verify `propagation.extract()` is called before span creation
3. Check message headers contain trace context
4. Verify parent context is passed to `startActiveSpan()`

### Order Not Found After Creation

**Issue**: GET request returns 404 immediately after creation

**Solutions:**
1. Wait 2-3 seconds for Order Processor to process
2. Verify Order Processor is running: `docker-compose ps order-processor`
3. Check Order Processor logs: `docker-compose logs order-processor`
4. Verify RabbitMQ is delivering messages

### Rate Limiting Issues

**Issue**: Getting 429 (Too Many Requests)

**Solutions:**
1. This is expected - Nginx rate limit is 10 req/s
2. Wait a few seconds between requests
3. Adjust rate limit in `nginx/nginx.conf` if needed

---

## TraceQL Commands Reference

### Basic Service Queries

```
{ .service.name = "order-api" }
{ .service.name = "order-processor" }
{ .service.name = "order-api" } || { .service.name = "order-processor" }
```

### Span Name Queries

```
{ name = "create-order" }
{ name = "process-order" }
{ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }
```

### Duration Queries

```
{ duration > 0.2s }
{ .service.name = "order-processor" } | { duration > 0.2s }
{ name = "save-order-mongodb" } | { duration > 0.5s }
```

### Error Queries

```
{ status = error }
{ .service.name = "order-api" } | { status = error }
{ name = "process-order" } | { status = error }
```

### Combined Queries

```
{ .service.name = "order-api" } | { name = "create-order" } | { duration > 1s }
({ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" }) | { status = error }
```

### Complete Order Flow

```
{ name = "create-order" } || { name = "save-order-mongodb" } || { name = "publish-rabbitmq" } || { name = "process-order" } || { name = "fetch-order-mongodb" } || { name = "process-order-logic" } || { name = "update-order-mongodb" }
```

**Note**: All commands above have been tested and verified to work with Tempo datasource in Grafana.

---

## Postman Test Cases

### Successful Test Cases

1. **Health Check**: `GET /health`
2. **Create Order - Single Item**: `POST /orders`
3. **Create Order - Multiple Items**: `POST /orders`
4. **Get Order by ID**: `GET /orders/:id`
5. **Create Order - Large Order**: `POST /orders`

### Error Test Cases

1. **Missing Required Fields**: Returns `400 Bad Request`
2. **Missing Item Fields**: Returns `400 Bad Request`
3. **Missing Shipping Address Fields**: Returns `400 Bad Request`
4. **Invalid Order ID**: Returns `404 Not Found`
5. **Empty Items Array**: Returns `400 Bad Request`
6. **Invalid Item Quantity**: Returns `400 Bad Request`
7. **Invalid Item Price**: Returns `400 Bad Request`
8. **Invalid HTTP Method**: Returns `404 Not Found`
9. **Invalid JSON Format**: Returns `400 Bad Request`
10. **Missing Content-Type Header**: Returns `400 Bad Request`

### Sample Order Request

```json
{
  "customerId": "CUST001",
  "customerEmail": "customer@example.com",
  "items": [
    {
      "productId": "PROD001",
      "name": "Product Name",
      "quantity": 1,
      "price": 99.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  }
}
```

For complete test cases with request/response examples, see the detailed [Postman Tests](#postman-test-cases) section.

---

## Request Flow Example

### Complete Order Creation Flow

```
1. Client → Nginx (POST /orders)
   │
   ├─► Rate limiting check
   │
2. Nginx → Order API (Proxy)
   │
3. Order API Controller (createOrder)
   │
   ├─► Input Validation
   │
   ├─► Create Order Model Instance
   │
4. Order API → MongoDB
   │
   ├─► Save Order Document
   │
   └─► Return Order with _id
   │
5. Order API → RabbitMQ
   │
   ├─► Publish Message: { orderId: "..." }
   │
   └─► Include Trace Context in Headers
   │
6. Order API → Client (Response: { orderId, status })
   │
7. RabbitMQ → Order Processor (Async)
   │
   ├─► Extract Trace Context from Headers
   │
8. Order Processor → MongoDB
   │
   ├─► Fetch Order by ID
   │
9. Order Processor (Business Logic)
   │
   ├─► Update Status to PROCESSING
   │
   ├─► Simulate Processing (1s delay)
   │
   ├─► Update Status to SHIPPED/CANCELLED
   │
   └─► Update Payment Status & Tracking
   │
10. Order Processor → MongoDB
    │
    └─► Save Updated Order
    │
11. Order Processor → RabbitMQ
    │
    └─► Acknowledge Message
```

---

## Key Concepts

### Distributed Tracing

- **Trace**: Complete request flow across services
- **Span**: Single operation within a trace
- **Context**: Carries trace information across boundaries
- **Events**: Timestamped annotations in spans
- **Attributes**: Key-value pairs for filtering

### Context Propagation

- Trace context flows: Order API → RabbitMQ → Order Processor
- Maintains parent-child span relationships
- Enables end-to-end request tracking
- Uses W3C Trace Context format

### Observability

- **Traces**: Request flow visualization
- **Logs**: Correlated with trace IDs
- **Metrics**: (Future: Prometheus integration)
- **Dashboards**: Grafana visualization

---

## Development

### Project Structure

```
opentelemetry-microservices/
├── order-api/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── index.js
│   │   └── tracing.js
│   ├── Dockerfile
│   └── package.json
├── order-processor/
│   ├── src/
│   │   ├── config/
│   │   ├── consumers/
│   │   ├── models/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── index.js
│   │   └── tracing.js
│   ├── Dockerfile
│   └── package.json
├── nginx/
│   └── nginx.conf
├── grafana/
│   └── provisioning/
│       └── datasources/
│           └── datasource.yml
├── tempo/
│   └── tempo.yaml
├── docker-compose.yml
└── README.md
```

### Running Locally (Without Docker)

1. **Start Dependencies:**
   - MongoDB: `mongod --replSet rs0`
   - RabbitMQ: `rabbitmq-server`
   - Tempo: `tempo --config.file=tempo.yaml`

2. **Start Services:**
   ```bash
   cd order-api && npm install && npm start
   cd order-processor && npm install && npm start
   ```

3. **Set Environment Variables:**
   - Create `.env` files in each service
   - Configure connection strings

---

## Additional Resources

### Documentation Files

- **ARCHITECTURE.md**: Detailed architecture documentation
- **OPENTELEMETRY.md**: Complete OpenTelemetry implementation guide
- **TRACEQL_COMMANDS.md**: All verified TraceQL commands
- **POSTMAN_TESTS.md**: Complete Postman test cases

### Useful Commands

**View Logs:**
```bash
docker-compose logs -f order-api
docker-compose logs -f order-processor
docker-compose logs -f mongodb
```

**Restart Services:**
```bash
docker-compose restart order-api
docker-compose restart order-processor
```

**Stop All Services:**
```bash
docker-compose down
```

**Rebuild and Start:**
```bash
docker-compose up -d --build
```

**Check Service Status:**
```bash
docker-compose ps
```

---

## Summary

This project demonstrates:

✅ **Microservices Architecture**: Two independent services with clear boundaries  
✅ **Asynchronous Processing**: Message queue pattern for decoupling  
✅ **Distributed Tracing**: Full observability across services  
✅ **Context Propagation**: Trace continuity through RabbitMQ  
✅ **Auto-Instrumentation**: Automatic tracing for common operations  
✅ **Manual Instrumentation**: Business logic spans for detailed tracking  
✅ **Log Correlation**: Trace IDs in logs for debugging  
✅ **Error Tracking**: Automatic error status in spans  
✅ **Performance Analysis**: Duration tracking for all operations  

The system provides complete observability of the distributed order processing pipeline, making it easy to debug issues, analyze performance, and understand request flows across services.

---

## License

This project is for educational and demonstration purposes.

---

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

---

**Happy Tracing! 🚀**

