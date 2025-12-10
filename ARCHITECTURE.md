# Microservices Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Order API Service](#order-api-service)
4. [Order Processor Service](#order-processor-service)
5. [Data Layer & Models](#data-layer--models)
6. [Nginx Integration](#nginx-integration)
7. [Service Interconnections](#service-interconnections)
8. [Request Flow](#request-flow)

---

## Overview

This project implements a microservices-based order management system with two main services:
- **Order API**: RESTful API for creating and retrieving orders
- **Order Processor**: Background service for processing orders asynchronously

The system uses:
- **MongoDB** for data persistence
- **RabbitMQ** for asynchronous message queuing
- **Nginx** as a reverse proxy and load balancer
- **OpenTelemetry** for distributed tracing

---

## System Architecture

```
┌─────────┐
│ Client  │
└────┬────┘
     │ HTTP Request
     ▼
┌─────────┐
│  Nginx  │ (Port 8081)
│ Reverse │
│  Proxy  │
└────┬────┘
     │ Proxy to
     ▼
┌─────────────┐
│  Order API  │ (Port 3000)
│   Service   │
└─────┬───────┘
      │
      ├──► MongoDB (Port 27017)
      │
      └──► RabbitMQ (Port 5672)
              │
              │ Message Queue
              ▼
        ┌──────────────┐
        │Order Processor│
        │   Service     │
        └──────┬───────┘
               │
               └──► MongoDB (Port 27017)
```

---

## Order API Service

### Entry Point: `order-api/src/index.js`

The service starts here and sets up the Express application:

```javascript
require('./tracing');  // Initialize OpenTelemetry first
const express = require('express');
const { connectMongoDB } = require('./services/mongodb.service');
const { connectRabbitMQ } = require('./services/rabbitmq.service');
const ordersRoutes = require('./routes/orders.routes');
const errorMiddleware = require('./middleware/error.middleware');
```

**Initialization Flow:**
1. **Tracing Initialization**: `require('./tracing')` - Must be first to instrument all modules
2. **Express Setup**: Creates Express app and configures JSON middleware
3. **Health Check**: `/health` endpoint for container health checks
4. **Route Registration**: Mounts order routes at `/orders`
5. **Error Middleware**: Global error handler
6. **Service Connections**: Connects to MongoDB and RabbitMQ
7. **Server Start**: Listens on port 3000

### Routing Layer: `order-api/src/routes/orders.routes.js`

Defines HTTP endpoints and maps them to controller functions:

```javascript
router.post('/', createOrder);    // POST /orders
router.get('/:id', getOrder);     // GET /orders/:id
```

**Route Structure:**
- Uses Express Router for modular routing
- Imports controller functions from `controllers/orders.controller.js`
- Routes are mounted at `/orders` in `index.js`

### Controller Layer: `order-api/src/controllers/orders.controller.js`

Contains business logic and orchestrates service calls:

#### `createOrder(req, res, next)`

**Flow:**
1. **Input Validation**: Validates required fields (customerId, customerEmail, items, shippingAddress)
2. **Total Calculation**: Calculates order total from items
3. **Order Creation**: Creates Order model instance
4. **MongoDB Save**: Saves order to database (separate span)
5. **RabbitMQ Publish**: Publishes order ID to queue (separate span)
6. **Response**: Returns order ID and status

**Key Operations:**
- Creates parent span: `create-order`
- Creates child span: `save-order-mongodb`
- Creates child span: `publish-rabbitmq`
- Sets span attributes: `order.id`
- Adds span events for each major step

#### `getOrder(req, res, next)`

**Flow:**
1. **Span Creation**: Creates `get-order` span
2. **Database Query**: Fetches order by ID from MongoDB
3. **Validation**: Checks if order exists
4. **Response**: Returns order JSON or 404 error

### Service Layer

#### MongoDB Service: `order-api/src/services/mongodb.service.js`

**Purpose**: Manages MongoDB connection

```javascript
async function connectMongoDB() {
  await mongoose.connect(config.mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  });
}
```

**Features:**
- Connection with retry logic
- Replica set support
- Connection pooling (handled by Mongoose)
- Auto-reconnection on failure

#### RabbitMQ Service: `order-api/src/services/rabbitmq.service.js`

**Purpose**: Manages RabbitMQ connection and message publishing

**Functions:**

1. **`connectRabbitMQ()`**:
   - Connects to RabbitMQ with retry logic (5 attempts, 3s delay)
   - Creates channel and asserts queue
   - Returns channel for use

2. **`publishMessage(message)`**:
   - Injects OpenTelemetry context into message headers
   - Publishes message to `order_queue`
   - Uses persistent messages for durability

**Context Propagation:**
```javascript
const headers = {};
propagation.inject(context.active(), headers);
channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(message)), {
  persistent: true,
  headers,  // Contains trace context
});
```

---

## Order Processor Service

### Entry Point: `order-processor/src/index.js`

Background service that processes orders asynchronously:

```javascript
require('./tracing');  // Initialize OpenTelemetry first
const { connectMongoDB } = require('./services/mongodb.service');
const { connectRabbitMQ } = require('./services/rabbitmq.service');
const { processOrderMessage } = require('./consumers/order.consumer');
```

**Initialization Flow:**
1. **Tracing Initialization**: Must be first
2. **MongoDB Connection**: Connects to same database
3. **RabbitMQ Connection**: Connects and sets up consumer
4. **Message Consumption**: Starts consuming from `order_queue`

### Consumer: `order-processor/src/consumers/order.consumer.js`

**Function**: `processOrderMessage(msg, channel)`

**Flow:**
1. **Context Extraction**: Extracts trace context from RabbitMQ message headers
2. **Parent Span Creation**: Creates `process-order` span with extracted context
3. **Order Fetch**: Fetches order from MongoDB (child span: `fetch-order-mongodb`)
4. **Status Check**: Validates order is in `CREATED` status
5. **Business Logic**: Processes order (child span: `process-order-logic`)
   - Sets status to `PROCESSING`
   - Simulates work (1 second delay)
   - Randomly sets status to `SHIPPED` (90%) or `CANCELLED` (10%)
   - Updates payment status and tracking number
6. **Database Update**: Saves updated order (child span: `update-order-mongodb`)
7. **Message Acknowledgment**: ACKs message on success, NACKs on error

**Context Propagation:**
```javascript
const headers = msg.properties.headers || {};
const parentContext = propagation.extract(context.active(), headers);
return tracer.startActiveSpan('process-order', { kind: 1 }, parentContext, async (span) => {
  // This span is a child of the span from order-api
});
```

### Service Layer

#### MongoDB Service: `order-processor/src/services/mongodb.service.js`

Same as Order API - connects to the same MongoDB instance to read/write orders.

#### RabbitMQ Service: `order-processor/src/services/rabbitmq.service.js`

**Function**: `connectRabbitMQ(consumerCallback)`

- Connects to RabbitMQ
- Creates channel and asserts queue
- Sets up consumer with callback function
- Uses `noAck: false` for manual acknowledgment

---

## Data Layer & Models

### Order Model: `order-api/src/models/order.model.js` & `order-processor/src/models/order.model.js`

Both services use the same Mongoose schema (shared model definition).

#### Schema Structure

**OrderItemSchema** (Nested Schema):
```javascript
{
  productId: String (required),
  name: String (required),
  quantity: Number (required, min: 1),
  price: Number (required, min: 0)
}
```

**OrderSchema** (Main Schema):
```javascript
{
  customerId: String (required, indexed),
  customerEmail: String (required),
  items: [OrderItemSchema] (required, min: 1 item),
  totalAmount: Number (min: 0),
  shippingAddress: {
    street: String (required),
    city: String (required),
    state: String (required),
    zipCode: String (required),
    country: String (required)
  },
  status: String (enum: ['CREATED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], default: 'CREATED'),
  paymentStatus: String (enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'], default: 'PENDING'),
  trackingNumber: String (default: null),
  processedAt: Date (default: null),
  shippedAt: Date (default: null),
  deliveredAt: Date (default: null),
  timestamps: true  // Adds createdAt and updatedAt
}
```

#### Model Features

1. **Pre-save Hook**: Automatically calculates `totalAmount` if not provided
   ```javascript
   OrderSchema.pre('save', function(next) {
     if (this.isModified('items') && !this.totalAmount) {
       this.totalAmount = this.items.reduce((total, item) => {
         return total + (item.price * item.quantity);
       }, 0);
     }
     next();
   });
   ```

2. **Indexes**: 
   - `customerId` is indexed for faster queries
   - `status` is indexed for filtering orders by status

3. **Validation**:
   - Items array must have at least one item
   - Status and paymentStatus use enum validation
   - Quantity and price have minimum values

### Data Flow

1. **Order Creation** (Order API):
   - Controller creates Order instance
   - Model validates data
   - Pre-save hook calculates total if needed
   - Mongoose saves to MongoDB
   - Returns saved document with `_id`

2. **Order Processing** (Order Processor):
   - Consumer fetches order by ID
   - Updates order fields (status, paymentStatus, trackingNumber)
   - Mongoose validates updates
   - Saves updated order
   - MongoDB updates document

---

## Nginx Integration

### Configuration: `nginx/nginx.conf`

Nginx acts as a reverse proxy and API gateway:

```nginx
upstream order_api {
  server order-api:3000;
}

server {
  listen 80;
  server_name localhost;

  location /orders {
    limit_req zone=mylimit burst=20;
    proxy_pass http://order_api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### Features

1. **Reverse Proxy**: 
   - Routes requests from port 8081 to `order-api:3000`
   - Client connects to Nginx, Nginx forwards to Order API

2. **Rate Limiting**:
   - Zone: `mylimit` with 10 requests/second limit
   - Burst: Allows 20 requests in burst
   - Prevents API abuse

3. **Load Balancing** (Future):
   - `upstream` block can have multiple servers
   - Nginx distributes load across instances

4. **Request Headers**:
   - Preserves original host
   - Adds real client IP
   - Maintains forwarding chain

### Request Flow Through Nginx

```
Client Request: POST http://localhost:8081/orders
    │
    ▼
Nginx (Port 8081)
    │
    ├─► Rate Limiting Check
    │
    ├─► Proxy Headers Added
    │
    ▼
Order API (Port 3000)
    │
    └─► Processes request
```

### Why Nginx?

1. **Single Entry Point**: Clients only need to know Nginx URL
2. **Security**: Hides internal service ports
3. **Rate Limiting**: Protects backend services
4. **SSL Termination**: Can handle HTTPS (future)
5. **Caching**: Can cache responses (future)
6. **Load Balancing**: Can distribute load (future)

---

## Service Interconnections

### 1. Order API → MongoDB

**Connection**: Direct Mongoose connection
- **Purpose**: Store and retrieve orders
- **Operations**: Create, Read
- **Connection String**: `mongodb://mongodb:27017/orders_db?replicaSet=rs0`

### 2. Order API → RabbitMQ

**Connection**: AMQP connection via `amqplib`
- **Purpose**: Publish order processing messages
- **Queue**: `order_queue`
- **Message Format**: `{ orderId: "..." }`
- **Context**: Includes OpenTelemetry trace context in headers

### 3. RabbitMQ → Order Processor

**Connection**: AMQP consumer
- **Purpose**: Deliver messages to processor
- **Queue**: `order_queue`
- **Acknowledgment**: Manual (noAck: false)
- **Context**: Extracts trace context from message headers

### 4. Order Processor → MongoDB

**Connection**: Direct Mongoose connection
- **Purpose**: Read and update orders
- **Operations**: Read, Update
- **Connection String**: Same as Order API

### 5. Nginx → Order API

**Connection**: HTTP reverse proxy
- **Purpose**: Route client requests
- **Port**: 8081 (Nginx) → 3000 (Order API)
- **Protocol**: HTTP

---

## Request Flow

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

### Order Retrieval Flow

```
1. Client → Nginx (GET /orders/:id)
   │
2. Nginx → Order API (Proxy)
   │
3. Order API Controller (getOrder)
   │
4. Order API → MongoDB
   │
   └─► Find Order by ID
   │
5. Order API → Client (Response: Order JSON or 404)
```

---

## Key Design Patterns

### 1. Layered Architecture

- **Presentation Layer**: Routes (Express)
- **Business Logic Layer**: Controllers
- **Service Layer**: External service connections (MongoDB, RabbitMQ)
- **Data Layer**: Models (Mongoose schemas)

### 2. Asynchronous Processing

- Order creation is synchronous (immediate response)
- Order processing is asynchronous (background job)
- Decouples API from processing logic

### 3. Message Queue Pattern

- Order API publishes events
- Order Processor consumes events
- Loose coupling between services
- Scalable processing

### 4. Shared Data Model

- Both services use same Mongoose schema
- Ensures data consistency
- Single source of truth (MongoDB)

### 5. Reverse Proxy Pattern

- Nginx as single entry point
- Hides internal architecture
- Enables load balancing and rate limiting

---

## Error Handling

### Order API

1. **Controller Level**: Try-catch blocks with span status updates
2. **Middleware**: Global error handler (`error.middleware.js`)
3. **Validation**: Input validation with 400 errors
4. **Database**: MongoDB errors caught and returned as 500

### Order Processor

1. **Consumer Level**: Try-catch with span status updates
2. **Message Handling**: NACK on error (requeue), ACK on success
3. **Database**: Errors logged and message requeued

---

## Configuration

### Environment Variables

**Order API:**
- `MONGO_URI`: MongoDB connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Tempo endpoint
- `OTEL_SERVICE_NAME`: Service name for tracing
- `PORT`: Server port (default: 3000)

**Order Processor:**
- `MONGO_URI`: MongoDB connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Tempo endpoint
- `OTEL_SERVICE_NAME`: Service name for tracing

---

## Summary

This architecture provides:
- **Separation of Concerns**: Each service has a single responsibility
- **Scalability**: Services can scale independently
- **Reliability**: Message queue ensures order processing even if processor is down
- **Observability**: Full tracing across services
- **Maintainability**: Clear layer separation and modular code

The system follows microservices best practices with proper service boundaries, asynchronous communication, and distributed tracing for full observability.

