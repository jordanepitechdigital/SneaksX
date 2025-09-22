# KicksDB Real-Time Monitor System

This document describes the KicksDB real-time monitoring system implementation for SneaksX, providing webhook-based price and stock monitoring with comprehensive audit logging and stock management capabilities.

## Overview

The monitoring system implements real-time price updates and stock tracking through KicksDB webhooks while maintaining strict separation between external data sources and internal stock management. The system is designed with the following core principles:

- **Zero Stock Modifications**: Webhooks NEVER modify product_stock table
- **Price Updates Only**: Real-time price changes with <60s SLA
- **Internal Stock Control**: SneaksX manages its own inventory
- **Comprehensive Auditing**: Full audit trail for all operations
- **Security First**: Signature verification and rate limiting

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   KicksDB API   │───▶│  Webhook Queue  │───▶│ Event Processor │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │                       │
                               ▼                       ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │ Audit Logging   │    │ Product Updates │
                    └─────────────────┘    └─────────────────┘
                                                      │
                                                      ▼
                                          ┌─────────────────┐
                                          │ Monitor Events  │
                                          └─────────────────┘
```

## Key Components

### 1. Webhook Endpoint (`/api/kicks/monitor`)

**Location**: `src/app/api/kicks/monitor/route.ts`

Secure webhook receiver with:
- HMAC-SHA256 signature verification
- Rate limiting (100 req/min default)
- Idempotency handling (event_id deduplication)
- Circuit breaker protection
- Request/response audit logging

### 2. Event Processing Pipeline

**Location**: `src/lib/webhook/`

- **Queue System** (`queue.ts`): Async processing with retry logic
- **Processor** (`processor.ts`): Event validation and transformation
- **Security** (`security.ts`): Signature verification and rate limiting

### 3. Stock Management System

**Location**: `src/lib/stock/manager.ts`

Internal inventory management with:
- **Reserve**: Temporary holds for checkout (15min TTL)
- **Commit**: Permanent inventory reduction on purchase
- **Release**: Cancel reservation, return to available
- **Audit Trail**: Complete movement history

### 4. Monitor Configuration

**Location**: `src/lib/monitor/config.ts`

KicksDB monitor setup and management:
- Price change monitors (15min-2hour frequencies)
- Stock tracking monitors (monitoring only)
- New product detection
- Multi-market support (US, UK, FR, DE, JP)

### 5. Feature Flag System

**Location**: `src/lib/features/flags.ts`

Runtime behavior control:
- `FEATURE_MONITOR_UPDATES_STOCK=false` (locked per requirements)
- Monitor enable/disable flags
- Rate limiting configuration
- Retention policies

## Database Schema

### Core Tables

#### `webhook_event_logs`
```sql
- event_id: Unique event identifier (idempotency)
- source: 'kicksdb'
- event_type: 'price_change', 'stock_change', 'new_product'
- payload: Complete webhook data
- verified: Signature verification status
- processed: Processing completion status
```

#### `webhook_processing_queue`
```sql
- webhook_event_id: Reference to webhook_event_logs
- priority: Processing priority (0-10)
- scheduled_for: When to process (for retries)
- processing_attempts: Retry counter
- status: 'pending', 'processing', 'completed', 'failed'
```

#### `inventory_moves`
```sql
- product_id, size: Stock item identifier
- move_type: 'reserve', 'commit', 'release', 'adjustment', 'restock'
- quantity: Movement amount (negative for reductions)
- reference_id: Order/session reference
- reason: Human-readable explanation
```

#### `stock_reservations`
```sql
- product_id, size: Stock item
- quantity: Reserved amount
- expires_at: Automatic cleanup time (15min default)
- session_id, user_id, order_id: References
```

#### `audit_logs`
```sql
- event_type: Operation category
- entity_type: 'product', 'stock', 'webhook', 'monitor'
- action: Specific operation performed
- old_values, new_values: Change tracking
- severity: 'info', 'warning', 'error', 'critical'
```

## Configuration

### Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
KICKSDB_API_KEY=your_kicksdb_key
KICKSDB_WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_BASE_URL=https://your-domain.com

# Optional (defaults provided)
FEATURE_MONITOR_UPDATES_STOCK=false
MONITOR_PRICE_UPDATE_ENABLED=true
MONITOR_STOCK_UPDATE_ENABLED=false
WEBHOOK_RATE_LIMIT_PER_MINUTE=100
STOCK_RESERVATION_TTL_MINUTES=15
```

### Feature Flags

Stored in `sync_config` table for runtime modification:

- `FEATURE_MONITOR_UPDATES_STOCK`: **LOCKED to FALSE** per requirements
- `MONITOR_PRICE_UPDATE_ENABLED`: Enable real-time price updates
- `MONITOR_STOCK_UPDATE_ENABLED`: Enable stock tracking (monitoring only)
- `MONITOR_NEW_PRODUCT_ENABLED`: Enable new product detection

## Usage

### Starting the System

```bash
# Start monitoring system
npm run monitor:start

# Check system health
npm run monitor:health

# View system status
npm run monitor:status

# Get monitoring statistics
npm run monitor:stats
```

### API Endpoints

#### Webhook Endpoint
```
POST /api/kicks/monitor
Headers:
  - x-kicksdb-signature: sha256=<hmac_signature>
  - x-kicksdb-event-id: <unique_event_id>
  - x-kicksdb-timestamp: <unix_timestamp>
```

#### Health Check
```
GET /api/kicks/monitor/health
Response: { overall: 'healthy|degraded|unhealthy', services: [...] }
```

#### System Status
```
GET /api/kicks/monitor/status
Response: { system: {...}, statistics: {...} }
```

### Enabling Product Monitoring

```typescript
import { MonitorConfigService } from '@/lib/monitor/config';

const monitorConfig = new MonitorConfigService();

await monitorConfig.enableMonitoring({
  productId: 'uuid',
  kicksdbId: 'kicksdb_product_id',
  monitorType: 'price', // 'price', 'stock', 'both'
  frequency: 60, // 15, 30, 60, 120 minutes
  markets: ['US', 'UK'],
  priceThreshold: 5.00 // Minimum change to trigger
});
```

### Stock Operations

```typescript
import { StockManager } from '@/lib/stock/manager';

const stockManager = new StockManager();

// Reserve stock for checkout
const reservation = await stockManager.reserveStock(
  productId, size, quantity, { sessionId, userId }
);

// Commit on successful payment
await stockManager.commitReservedStock(reservation.reservationId, orderId);

// Release on cancellation
await stockManager.releaseReservedStock(reservation.reservationId);
```

## Security Features

### Webhook Security
- **Signature Verification**: HMAC-SHA256 with secret key
- **Timestamp Validation**: Reject old requests (5min window)
- **Rate Limiting**: 100 requests/minute per IP
- **Idempotency**: Prevent duplicate processing

### Stock Security
- **Concurrency Control**: Prevent overselling
- **Audit Trail**: Complete operation history
- **Time-based Cleanup**: Automatic reservation expiry
- **Validation**: Quantity and availability checks

## Monitoring and Observability

### Health Checks
- Database connectivity
- Webhook queue status
- Stock management health
- External API availability

### Metrics Collection
- Webhook processing times
- Stock operation performance
- Error rates and types
- Queue depth and throughput

### Audit Logging
- All webhook events and processing results
- Stock movements and reservations
- Monitor configuration changes
- Security events and failures

## Maintenance

### Automated Cleanup
- Expired stock reservations (every minute)
- Old audit logs (90 days retention)
- Completed queue items (7 days retention)
- System metrics (30 days retention)

### Manual Maintenance
```bash
# Run maintenance cleanup
npm run monitor:maintenance

# Process pending queue items
npm run monitor:process-queue
```

## Troubleshooting

### Common Issues

1. **Webhook Signature Verification Fails**
   - Check `KICKSDB_WEBHOOK_SECRET` environment variable
   - Verify KicksDB webhook configuration
   - Check request timestamp (max 5 minutes old)

2. **Stock Reservations Not Working**
   - Verify database functions are installed
   - Check product_stock table exists
   - Ensure sufficient available quantity

3. **Monitor Not Receiving Events**
   - Verify webhook URL is accessible
   - Check KicksDB monitor configuration
   - Verify feature flags are enabled

### Debugging Commands

```bash
# Check system health
curl -X GET https://your-domain.com/api/kicks/monitor/health

# View recent audit logs
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;

# Check webhook queue status
SELECT status, COUNT(*) FROM webhook_processing_queue GROUP BY status;

# View expired reservations
SELECT * FROM stock_reservations WHERE expires_at < NOW();
```

## Performance Considerations

### SLA Requirements
- **Webhook Response**: <5s response time
- **Database Update**: <60s after webhook receipt
- **Queue Processing**: Real-time with retry backoff

### Scalability
- Async queue processing prevents webhook timeouts
- Database functions minimize race conditions
- Configurable retry policies handle temporary failures
- Rate limiting prevents abuse

### Resource Usage
- Memory-efficient event processing
- Database connection pooling
- Automatic cleanup of old data
- Optional Redis for distributed rate limiting

## Integration Points

### Existing Systems
- **Products Table**: Price updates only
- **Product Stock**: Internal management only
- **Sync System**: Complementary data sources
- **Order System**: Stock reservation integration

### External Dependencies
- **KicksDB API**: Monitor configuration
- **Supabase**: Database and real-time features
- **Webhook Endpoint**: Public internet accessibility

## Compliance and Requirements

### Business Rules
- ✅ Monitors update **prices only** in products table
- ✅ **Zero writes** to product_stock via webhooks
- ✅ SneaksX manages its own stock simulation
- ✅ Real-time price updates with <60s SLA
- ✅ Feature flag `FEATURE_MONITOR_UPDATES_STOCK=false` enforced

### Security Requirements
- ✅ Webhook signature verification required
- ✅ Rate limiting and circuit breaker protection
- ✅ Comprehensive audit logging
- ✅ Idempotency handling for reliability

### Operational Requirements
- ✅ Health monitoring and alerting
- ✅ Automatic retry and backoff logic
- ✅ Graceful degradation on failures
- ✅ Maintenance and cleanup automation