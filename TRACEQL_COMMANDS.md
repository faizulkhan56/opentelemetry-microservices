# TraceQL Commands Reference

This document contains all the **verified and working** TraceQL commands for querying traces in Grafana with Tempo datasource.

## Table of Contents
1. [Basic Service Queries](#basic-service-queries)
2. [Span Name Queries](#span-name-queries)
3. [Duration Queries](#duration-queries)
4. [Error Queries](#error-queries)
5. [Combined Queries](#combined-queries)
6. [MongoDB Operations](#mongodb-operations)
7. [RabbitMQ Operations](#rabbitmq-operations)
8. [Order Flow Queries](#order-flow-queries)
9. [Performance Analysis](#performance-analysis)

---

## Basic Service Queries

### Filter by Service Name

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

---

## Span Name Queries

### Individual Span Names

**Create Order:**
```
{ name = "create-order" }
```

**Get Order:**
```
{ name = "get-order" }
```

**Process Order:**
```
{ name = "process-order" }
```

**Process Order Logic:**
```
{ name = "process-order-logic" }
```

### Multiple Span Names (Using ||)

**All MongoDB Operations:**
```
{ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }
```

**Order Creation Flow:**
```
{ name = "create-order" } || { name = "save-order-mongodb" } || { name = "publish-rabbitmq" }
```

**Order Processing Flow:**
```
{ name = "process-order" } || { name = "fetch-order-mongodb" } || { name = "process-order-logic" } || { name = "update-order-mongodb" }
```

---

## Duration Queries

### Basic Duration Filters

**Slow Operations (> 0.2 seconds):**
```
{ duration > 0.2s }
```

**Very Slow Operations (> 1 second):**
```
{ duration > 1s }
```

**Extremely Slow Operations (> 5 seconds):**
```
{ duration > 5s }
```

**Fast Operations (< 100ms):**
```
{ duration < 0.1s }
```

### Service with Duration

**Slow Order Processor Operations:**
```
{ .service.name = "order-processor" } | { duration > 0.2s }
```

**Slow Order API Operations:**
```
{ .service.name = "order-api" } | { duration > 1s }
```

### Span Name with Duration

**Slow MongoDB Operations:**
```
{ name = "save-order-mongodb" } | { duration > 0.5s }
```

**Slow RabbitMQ Operations:**
```
{ name = "publish-rabbitmq" } | { duration > 0.3s }
```

**Slow Order Processing:**
```
{ name = "process-order" } | { duration > 2s }
```

---

## Error Queries

### All Errors

**All Error Spans:**
```
{ status = error }
```

**Errors in Order API:**
```
{ .service.name = "order-api" } | { status = error }
```

**Errors in Order Processor:**
```
{ .service.name = "order-processor" } | { status = error }
```

### Errors by Span Name

**Errors in Order Creation:**
```
{ name = "create-order" } | { status = error }
```

**Errors in Order Processing:**
```
{ name = "process-order" } | { status = error }
```

**Errors in MongoDB Operations:**
```
{ name = "save-order-mongodb" } | { status = error }
```

**Errors in RabbitMQ Operations:**
```
{ name = "publish-rabbitmq" } | { status = error }
```

### Combined Error Queries

**All MongoDB Errors:**
```
({ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }) | { status = error }
```

**Errors in Order Flow:**
```
({ name = "create-order" } || { name = "process-order" }) | { status = error }
```

---

## Combined Queries

### Service and Span Name

**Order API Create Operations:**
```
{ .service.name = "order-api" } | { name = "create-order" }
```

**Order Processor MongoDB Fetch:**
```
{ .service.name = "order-processor" } | { name = "fetch-order-mongodb" }
```

**Order Processor Business Logic:**
```
{ .service.name = "order-processor" } | { name = "process-order-logic" }
```

### Service, Span Name, and Duration

**Slow Order API Create:**
```
{ .service.name = "order-api" } | { name = "create-order" } | { duration > 1s }
```

**Slow Order Processing:**
```
{ .service.name = "order-processor" } | { name = "process-order" } | { duration > 2s }
```

### Service, Span Name, and Error

**Errors in Order API Create:**
```
{ .service.name = "order-api" } | { name = "create-order" } | { status = error }
```

**Errors in Order Processing:**
```
{ .service.name = "order-processor" } | { name = "process-order" } | { status = error }
```

### Duration and Error

**Slow Errors:**
```
{ status = error } | { duration > 1s }
```

**Fast Successful Operations:**
```
{ status = ok } | { duration < 0.1s }
```

---

## MongoDB Operations

### All MongoDB Spans

**All MongoDB Operations:**
```
{ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }
```

### MongoDB with Filters

**Slow MongoDB Operations:**
```
({ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }) | { duration > 0.5s }
```

**MongoDB Errors:**
```
({ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }) | { status = error }
```

**Slow MongoDB Errors:**
```
({ name = "save-order-mongodb" } || { name = "fetch-order-mongodb" } || { name = "update-order-mongodb" }) | { duration > 0.5s } | { status = error }
```

### Individual MongoDB Operations

**Save Order:**
```
{ name = "save-order-mongodb" }
```

**Fetch Order:**
```
{ name = "fetch-order-mongodb" }
```

**Update Order:**
```
{ name = "update-order-mongodb" }
```

---

## RabbitMQ Operations

### RabbitMQ Spans

**Publish to RabbitMQ:**
```
{ name = "publish-rabbitmq" }
```

**RabbitMQ Errors:**
```
{ name = "publish-rabbitmq" } | { status = error }
```

**Slow RabbitMQ Operations:**
```
{ name = "publish-rabbitmq" } | { duration > 0.3s }
```

---

## Order Flow Queries

### Complete Order Creation Flow

**All Order Creation Spans:**
```
{ name = "create-order" } || { name = "save-order-mongodb" } || { name = "publish-rabbitmq" }
```

**Order Creation with Errors:**
```
({ name = "create-order" } || { name = "save-order-mongodb" } || { name = "publish-rabbitmq" }) | { status = error }
```

### Complete Order Processing Flow

**All Order Processing Spans:**
```
{ name = "process-order" } || { name = "fetch-order-mongodb" } || { name = "process-order-logic" } || { name = "update-order-mongodb" }
```

**Order Processing with Errors:**
```
({ name = "process-order" } || { name = "fetch-order-mongodb" } || { name = "process-order-logic" } || { name = "update-order-mongodb" }) | { status = error }
```

### Full Order Lifecycle

**Complete Order Flow:**
```
{ name = "create-order" } || { name = "save-order-mongodb" } || { name = "publish-rabbitmq" } || { name = "process-order" } || { name = "fetch-order-mongodb" } || { name = "process-order-logic" } || { name = "update-order-mongodb" }
```

---

## Performance Analysis

### Slow Operations Overall

**Very Slow Spans:**
```
{ duration > 3s }
```

**Slow Order Creation:**
```
{ name = "create-order" } | { duration > 1s }
```

**Slow Order Processing:**
```
{ name = "process-order" } | { duration > 2s }
```

### Service Performance

**Slow Operations in Both Services:**
```
({ .service.name = "order-api" } || { .service.name = "order-processor" }) | { duration > 1s }
```

**Slow Operations in Order API:**
```
{ .service.name = "order-api" } | { duration > 1s }
```

**Slow Operations in Order Processor:**
```
{ .service.name = "order-processor" } | { duration > 2s }
```

---

## Query Syntax Reference

### Operators

- `=` : Equals
- `!=` : Not equals
- `>` : Greater than
- `<` : Less than
- `||` : Logical OR (for multiple conditions)
- `|` : Pipeline operator (for filtering)

### Field Names

- `.service.name` : Service name (resource attribute)
- `name` : Span name
- `status` : Span status (error, ok, unset)
- `duration` : Span duration

### Duration Units

- `s` : Seconds
- `ms` : Milliseconds

### Status Values

- `error` : Error status
- `ok` : Success status
- `unset` : Unset status

---

## Usage Tips

1. **Use Parentheses**: When combining multiple conditions with `||` and then filtering, use parentheses:
   ```
   ({ condition1 } || { condition2 }) | { filter }
   ```

2. **Pipeline Operator**: Use `|` to apply filters after selection:
   ```
   { .service.name = "order-api" } | { duration > 1s }
   ```

3. **OR Operator**: Use `||` for multiple selections:
   ```
   { name = "span1" } || { name = "span2" }
   ```

4. **Service Name**: Always use `.service.name` with dot prefix for service filtering

5. **Duration Format**: Always include unit (`s` or `ms`) after duration value

---

## Common Query Patterns

### Pattern 1: Service + Span + Duration
```
{ .service.name = "order-api" } | { name = "create-order" } | { duration > 1s }
```

### Pattern 2: Multiple Spans + Filter
```
({ name = "span1" } || { name = "span2" }) | { status = error }
```

### Pattern 3: Service + Multiple Conditions
```
{ .service.name = "order-processor" } | ({ name = "process-order" } || { name = "fetch-order-mongodb" })
```

### Pattern 4: Error Analysis
```
({ .service.name = "order-api" } || { .service.name = "order-processor" }) | { status = error }
```

---

## Quick Reference

| Query Type | Example |
|------------|---------|
| Service | `{ .service.name = "order-api" }` |
| Span Name | `{ name = "create-order" }` |
| Duration | `{ duration > 1s }` |
| Error | `{ status = error }` |
| Multiple Spans | `{ name = "span1" } \|\| { name = "span2" }` |
| Combined | `{ .service.name = "order-api" } \| { duration > 1s }` |

---

## Notes

- All commands in this document have been **tested and verified** to work with Tempo datasource in Grafana
- Use `||` for OR operations (not `or`)
- Use `|` for pipeline filtering (not `&&`)
- Duration must include unit (`s` or `ms`)
- Service name uses dot notation: `.service.name`

