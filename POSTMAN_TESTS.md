# Postman Test Cases for Order Management System

This document provides comprehensive test cases for the Order Management API using Postman. It includes both successful test cases and error scenarios.

## Table of Contents
1. [Setup Instructions](#setup-instructions)
2. [Environment Variables](#environment-variables)
3. [Successful Test Cases](#successful-test-cases)
4. [Error Test Cases](#error-test-cases)
5. [Test Collection Setup](#test-collection-setup)

---

## Setup Instructions

### Prerequisites
- Postman installed
- Services running via Docker Compose
- Nginx accessible at `http://localhost:8081`
- Order API accessible at `http://localhost:3000` (direct)

### Base URLs
- **Via Nginx**: `http://localhost:8081`
- **Direct API**: `http://localhost:3000`

---

## Environment Variables

Create a Postman environment with these variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `base_url` | `http://localhost:8081` | Base URL via Nginx |
| `api_url` | `http://localhost:3000` | Direct API URL |
| `order_id` | (empty) | Will be set after order creation |

---

## Successful Test Cases

### Test Case 1: Health Check

**Request:**
- **Method**: `GET`
- **URL**: `{{base_url}}/health` or `{{api_url}}/health`
- **Headers**: None

**Expected Response:**
- **Status**: `200 OK`
- **Body**:
```json
{
  "status": "OK"
}
```

---

### Test Case 2: Create Order - Single Item

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders` or `{{api_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body** (raw JSON):
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
- **Status**: `201 Created`
- **Body**:
```json
{
  "orderId": "507f1f77bcf86cd799439011",
  "status": "CREATED"
}
```

**Post-Request Script** (to save order ID):
```javascript
if (pm.response.code === 201) {
    const response = pm.response.json();
    pm.environment.set("order_id", response.orderId);
}
```

---

### Test Case 3: Create Order - Multiple Items

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST002",
  "customerEmail": "bob.smith@email.com",
  "items": [
    {
      "productId": "PHONE001",
      "name": "iPhone 15 Pro",
      "quantity": 2,
      "price": 999.99
    },
    {
      "productId": "CASE001",
      "name": "Phone Case",
      "quantity": 2,
      "price": 29.99
    }
  ],
  "shippingAddress": {
    "street": "456 Oak Avenue",
    "city": "Los Angeles",
    "state": "CA",
    "zipCode": "90001",
    "country": "USA"
  }
}
```

**Expected Response:**
- **Status**: `201 Created`
- **Body**: Contains `orderId` and `status: "CREATED"`

---

### Test Case 4: Get Order by ID

**Request:**
- **Method**: `GET`
- **URL**: `{{base_url}}/orders/{{order_id}}`
- **Headers**: None

**Expected Response:**
- **Status**: `200 OK`
- **Body**: Complete order object with all fields

**Note**: Use the `order_id` from Test Case 2, or wait a few seconds after order creation for processing.

---

### Test Case 5: Create Order - Large Order

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST005",
  "customerEmail": "edward.miller@email.com",
  "items": [
    {
      "productId": "MONITOR001",
      "name": "LG UltraWide Monitor",
      "quantity": 2,
      "price": 449.99
    },
    {
      "productId": "STAND001",
      "name": "Monitor Stand",
      "quantity": 2,
      "price": 79.99
    }
  ],
  "shippingAddress": {
    "street": "654 Maple Drive",
    "city": "Phoenix",
    "state": "AZ",
    "zipCode": "85001",
    "country": "USA"
  }
}
```

**Expected Response:**
- **Status**: `201 Created`
- **Body**: Contains `orderId` and `status: "CREATED"`

---

## Error Test Cases

### Error Test 1: Missing Required Fields

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST_ERROR"
}
```

**Expected Response:**
- **Status**: `400 Bad Request`
- **Body**:
```json
{
  "error": "Missing required fields"
}
```

**Test Assertion:**
```javascript
pm.test("Status code is 400", function () {
    pm.response.to.have.status(400);
});

pm.test("Error message is correct", function () {
    const response = pm.response.json();
    pm.expect(response.error).to.equal("Missing required fields");
});
```

---

### Error Test 2: Missing Item Fields

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST_ERROR",
  "customerEmail": "test@error.com",
  "items": [
    {
      "productId": "PROD001"
    }
  ],
  "shippingAddress": {
    "street": "123 Test St",
    "city": "Test City",
    "state": "TS",
    "zipCode": "12345",
    "country": "USA"
  }
}
```

**Expected Response:**
- **Status**: `400 Bad Request`
- **Body**:
```json
{
  "error": "Item price or quantity missing"
}
```

---

### Error Test 3: Missing Shipping Address Fields

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST_ERROR",
  "customerEmail": "test@error.com",
  "items": [
    {
      "productId": "PROD001",
      "name": "Product",
      "quantity": 1,
      "price": 99.99
    }
  ],
  "shippingAddress": {
    "street": "123 Test St"
  }
}
```

**Expected Response:**
- **Status**: `400 Bad Request`
- **Body**: MongoDB validation error

---

### Error Test 4: Invalid Order ID

**Request:**
- **Method**: `GET`
- **URL**: `{{base_url}}/orders/INVALID_ID_12345`
- **Headers**: None

**Expected Response:**
- **Status**: `404 Not Found`
- **Body**:
```json
{
  "error": "Order not found"
}
```

**Test Assertion:**
```javascript
pm.test("Status code is 404", function () {
    pm.response.to.have.status(404);
});

pm.test("Error message is correct", function () {
    const response = pm.response.json();
    pm.expect(response.error).to.equal("Order not found");
});
```

---

### Error Test 5: Empty Items Array

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST_ERROR",
  "customerEmail": "test@error.com",
  "items": [],
  "shippingAddress": {
    "street": "123 Test St",
    "city": "Test City",
    "state": "TS",
    "zipCode": "12345",
    "country": "USA"
  }
}
```

**Expected Response:**
- **Status**: `400 Bad Request`
- **Body**: MongoDB validation error (at least one item required)

---

### Error Test 6: Invalid Item Quantity

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST_ERROR",
  "customerEmail": "test@error.com",
  "items": [
    {
      "productId": "PROD001",
      "name": "Product",
      "quantity": 0,
      "price": 99.99
    }
  ],
  "shippingAddress": {
    "street": "123 Test St",
    "city": "Test City",
    "state": "TS",
    "zipCode": "12345",
    "country": "USA"
  }
}
```

**Expected Response:**
- **Status**: `400 Bad Request`
- **Body**: MongoDB validation error (quantity must be >= 1)

---

### Error Test 7: Invalid Item Price

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "customerId": "CUST_ERROR",
  "customerEmail": "test@error.com",
  "items": [
    {
      "productId": "PROD001",
      "name": "Product",
      "quantity": 1,
      "price": -10
    }
  ],
  "shippingAddress": {
    "street": "123 Test St",
    "city": "Test City",
    "state": "TS",
    "zipCode": "12345",
    "country": "USA"
  }
}
```

**Expected Response:**
- **Status**: `400 Bad Request`
- **Body**: MongoDB validation error (price must be >= 0)

---

### Error Test 8: Invalid HTTP Method

**Request:**
- **Method**: `PUT`
- **URL**: `{{base_url}}/orders`
- **Headers**: None

**Expected Response:**
- **Status**: `404 Not Found` or `405 Method Not Allowed`

---

### Error Test 9: Invalid JSON Format

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**:
  - `Content-Type: application/json`
- **Body** (invalid JSON):
```json
{
  "customerId": "CUST_ERROR",
  "customerEmail": "test@error.com"
  // Missing comma, invalid JSON
  "items": []
}
```

**Expected Response:**
- **Status**: `400 Bad Request`
- **Body**: JSON parsing error

---

### Error Test 10: Missing Content-Type Header

**Request:**
- **Method**: `POST`
- **URL**: `{{base_url}}/orders`
- **Headers**: None (no Content-Type)
- **Body**: Valid JSON

**Expected Response:**
- **Status**: `400 Bad Request` or body parsing error

---

## Test Collection Setup

### Creating a Postman Collection

1. **Create New Collection**: "Order Management API Tests"
2. **Add Folder**: "Successful Tests"
3. **Add Folder**: "Error Tests"
4. **Add Environment**: "Local Development"

### Collection Variables

Add these collection-level variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:8081` | `http://localhost:8081` |
| `api_url` | `http://localhost:3000` | `http://localhost:3000` |

### Pre-request Scripts

**For Create Order Tests:**
```javascript
// Generate unique customer ID
const timestamp = Date.now();
pm.environment.set("customer_id", "CUST_" + timestamp);
```

### Test Scripts

**For All Create Order Tests:**
```javascript
pm.test("Response time is less than 2000ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(2000);
});

pm.test("Response has orderId", function () {
    if (pm.response.code === 201) {
        const response = pm.response.json();
        pm.expect(response).to.have.property('orderId');
        pm.expect(response).to.have.property('status');
        pm.expect(response.status).to.equal('CREATED');
    }
});
```

**For Get Order Tests:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response contains order details", function () {
    const response = pm.response.json();
    pm.expect(response).to.have.property('_id');
    pm.expect(response).to.have.property('customerId');
    pm.expect(response).to.have.property('items');
    pm.expect(response).to.have.property('status');
});
```

---

## Sample Test Data

### Complete Order Examples

#### Example 1: Electronics Order
```json
{
  "customerId": "CUST006",
  "customerEmail": "fiona.davis@email.com",
  "items": [
    {
      "productId": "KEYBOARD001",
      "name": "Mechanical Keyboard",
      "quantity": 1,
      "price": 149.99
    },
    {
      "productId": "MOUSE001",
      "name": "Wireless Mouse",
      "quantity": 1,
      "price": 59.99
    }
  ],
  "shippingAddress": {
    "street": "987 Cedar Lane",
    "city": "Philadelphia",
    "state": "PA",
    "zipCode": "19101",
    "country": "USA"
  }
}
```

#### Example 2: Camera Equipment Order
```json
{
  "customerId": "CUST007",
  "customerEmail": "george.martinez@email.com",
  "items": [
    {
      "productId": "CAMERA001",
      "name": "Canon EOS R5",
      "quantity": 1,
      "price": 3899.99
    },
    {
      "productId": "LENS001",
      "name": "24-70mm Lens",
      "quantity": 1,
      "price": 2299.99
    }
  ],
  "shippingAddress": {
    "street": "147 Birch Boulevard",
    "city": "San Antonio",
    "state": "TX",
    "zipCode": "78201",
    "country": "USA"
  }
}
```

#### Example 3: Gaming Order
```json
{
  "customerId": "CUST009",
  "customerEmail": "isaac.taylor@email.com",
  "items": [
    {
      "productId": "GAMING001",
      "name": "PlayStation 5",
      "quantity": 1,
      "price": 499.99
    },
    {
      "productId": "GAME001",
      "name": "Game Bundle",
      "quantity": 3,
      "price": 69.99
    }
  ],
  "shippingAddress": {
    "street": "369 Willow Way",
    "city": "Dallas",
    "state": "TX",
    "zipCode": "75201",
    "country": "USA"
  }
}
```

---

## Testing Workflow

### Step 1: Health Check
1. Run Health Check test
2. Verify service is running

### Step 2: Create Order
1. Run "Create Order - Single Item" test
2. Save the `order_id` from response
3. Wait 2-3 seconds for processing

### Step 3: Get Order
1. Run "Get Order by ID" test
2. Verify order status (should be PROCESSING, SHIPPED, or CANCELLED)
3. Verify all order fields are present

### Step 4: Error Tests
1. Run all error test cases
2. Verify correct error messages
3. Verify correct status codes

### Step 5: Multiple Orders
1. Create multiple orders with different data
2. Verify each order is processed
3. Check order statuses in database

---

## Postman Collection Runner

### Running All Tests

1. Open Postman Collection Runner
2. Select "Order Management API Tests" collection
3. Select all tests or specific folders
4. Set iterations (for load testing)
5. Click "Run"

### Test Execution Order

1. Health Check
2. Successful Tests (in order)
3. Error Tests (can run in any order)

---

## Assertions Checklist

### For Successful Create Order:
- [ ] Status code is 201
- [ ] Response has `orderId`
- [ ] Response has `status: "CREATED"`
- [ ] Response time < 2000ms
- [ ] `orderId` is saved to environment variable

### For Successful Get Order:
- [ ] Status code is 200
- [ ] Response has `_id`
- [ ] Response has `customerId`
- [ ] Response has `items` array
- [ ] Response has `shippingAddress`
- [ ] Response has `status`
- [ ] Response has `totalAmount`

### For Error Responses:
- [ ] Status code matches expected (400, 404, etc.)
- [ ] Response has `error` field
- [ ] Error message is descriptive
- [ ] Response time is reasonable

---

## Troubleshooting

### Issue: Connection Refused
- **Solution**: Ensure services are running (`docker-compose up`)
- **Check**: Verify port 8081 (Nginx) or 3000 (API) is accessible

### Issue: 404 Not Found
- **Solution**: Check URL path (should be `/orders` not `/order`)
- **Check**: Verify Nginx is routing correctly

### Issue: Order Not Found After Creation
- **Solution**: Wait a few seconds for processing
- **Check**: Verify Order Processor service is running
- **Check**: Verify RabbitMQ is running

### Issue: Validation Errors
- **Solution**: Check all required fields are present
- **Check**: Verify data types match schema
- **Check**: Verify enum values (status, paymentStatus)

---

## Performance Testing

### Load Test Script

Create a script to send multiple orders:

```javascript
// Pre-request script for load testing
const orders = [
  // Array of order objects
];

const currentOrder = orders[pm.iterationData.get('orderIndex') || 0];
pm.environment.set('orderBody', JSON.stringify(currentOrder));
```

### Rate Limiting Test

Send requests faster than 10 req/s to test Nginx rate limiting:
- Expected: Some requests return 429 (Too Many Requests)
- Verify: Rate limiting is working

---

## Summary

This test suite covers:
- ✅ **5 Successful Test Cases**: Health check, order creation, order retrieval
- ✅ **10 Error Test Cases**: Validation errors, missing fields, invalid data
- ✅ **Complete Test Data**: Sample orders for different scenarios
- ✅ **Assertions**: Automated validation of responses
- ✅ **Workflow**: Step-by-step testing process

Use this document to systematically test the Order Management API and verify both successful operations and error handling.

