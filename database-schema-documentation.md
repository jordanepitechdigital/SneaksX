# SneakX Database Schema Documentation

## Overview

This document provides comprehensive documentation of the SneakX e-commerce database schema, designed specifically for a sneaker marketplace with KicksDB API integration supporting both StockX and GOAT platforms.

## Schema Design Principles

### 1. **Multi-Platform Integration**
- Support for internal products and external platforms (StockX, GOAT)
- Flexible sync mechanism with status tracking
- External ID mapping for seamless API integration

### 2. **Real-Time Monitoring**
- Price change tracking with historical data
- Stock level monitoring with automated alerts
- Event-driven architecture for notifications

### 3. **Performance Optimization**
- Comprehensive indexing strategy for search and filtering
- Computed columns for frequently accessed calculations
- Efficient foreign key relationships

### 4. **Security First**
- Row Level Security (RLS) on all tables
- Role-based access control (User, Vendor, Admin)
- Service role permissions for background processes

### 5. **Data Integrity**
- Comprehensive constraints and validation rules
- Automated business logic through triggers
- Referential integrity with proper cascade rules

## Core Tables Structure

### Users and Authentication

#### `users`
- **Purpose**: Core user management with role-based access
- **Key Features**:
  - UUID primary keys for scalability
  - Role-based permissions (user, vendor, admin)
  - Email verification tracking
  - Soft deletion support via `is_active`

#### `user_addresses`
- **Purpose**: Multiple address support per user
- **Key Features**:
  - Separate shipping and billing addresses
  - Default address management
  - International address support

### Product Catalog

#### `brands`
- **Purpose**: Brand management with KicksDB integration
- **Key Features**:
  - KicksDB brand name mapping
  - Product count tracking from API
  - Last sync timestamp for monitoring

#### `categories`
- **Purpose**: Hierarchical product categorization
- **Key Features**:
  - Self-referencing parent-child relationships
  - Sort ordering for display
  - Slug-based URL generation

#### `products`
- **Purpose**: Core product information with multi-platform support
- **Key Features**:
  - Platform distinction (internal, stockx, goat)
  - External ID mapping for API integration
  - Price history tracking (JSONB)
  - Monitor settings for price/stock alerts
  - Full-text search capabilities
  - SEO metadata fields

#### `product_images`
- **Purpose**: Product image management (max 2 per product)
- **Key Features**:
  - Primary image designation
  - Sort ordering for display
  - Automatic constraint enforcement

#### `product_stock`
- **Purpose**: Size-based inventory management
- **Key Features**:
  - US size system support
  - Reserved quantity tracking for pending orders
  - Computed available quantity
  - External platform stock data (lowest ask, highest bid, last sale)
  - Size-specific pricing support

### Order Management

#### `orders`
- **Purpose**: Complete order lifecycle management
- **Key Features**:
  - Automatic order number generation (SX + date + sequence)
  - Multi-status tracking (pending → processing → shipped → delivered)
  - Payment status separation
  - Shipping and billing address references
  - Automated total calculations

#### `order_items`
- **Purpose**: Individual products within orders
- **Key Features**:
  - Product snapshot at time of order
  - Size and quantity tracking
  - Automatic stock reservation
  - Price calculations

### Real-Time Features

#### `monitor_events`
- **Purpose**: Track all price and stock changes
- **Key Features**:
  - Event type classification (price_change, stock_change, new_product)
  - JSONB storage for flexible event data
  - Change amount calculations
  - Notification tracking

#### `user_watchlist`
- **Purpose**: User product monitoring preferences
- **Key Features**:
  - Price alert thresholds
  - Notification preferences (email, push)
  - Stock alert settings

### Integration and Sync

#### `sync_logs`
- **Purpose**: Track KicksDB API synchronization
- **Key Features**:
  - Sync type classification (brands, products, prices, stock)
  - Platform-specific tracking
  - Success/failure statistics
  - Error message logging

#### `api_rate_limits`
- **Purpose**: KicksDB API rate limiting management
- **Key Features**:
  - Endpoint-specific tracking
  - Time window management
  - Request counting

### Shopping Experience

#### `shopping_cart`
- **Purpose**: Session-based cart management
- **Key Features**:
  - Support for both authenticated and guest users
  - Size-specific cart items
  - Automatic cleanup capabilities

## KicksDB Integration Design

### External Data Mapping

The schema is designed to seamlessly integrate with KicksDB API endpoints:

1. **Brand Synchronization** (`/v3/utils/brands`)
   - Maps to `brands.kicksdb_name` and `kicksdb_product_count`
   - Tracks last sync timestamp for incremental updates

2. **Product Synchronization** (`/v3/stockx/products`, `/v3/goat/products`)
   - External ID mapping via `products.external_id` and `external_slug`
   - Platform distinction through `platform` enum
   - Sync status tracking for reliable data management

3. **Price Monitoring**
   - Real-time price tracking in `product_stock` table
   - Historical price data in `products.price_history` JSONB field
   - Automated monitor events for price changes

### Sync Strategy

- **Rate Limiting**: Built-in rate limit tracking to respect API quotas
- **Incremental Sync**: Timestamp-based sync tracking prevents unnecessary API calls
- **Error Handling**: Comprehensive error logging and retry mechanisms
- **Data Validation**: Constraints ensure data integrity during sync operations

## Security Implementation

### Row Level Security (RLS)

Every table has RLS enabled with carefully designed policies:

1. **User Data**: Users can only access their own data
2. **Product Catalog**: Public read access, vendor/admin write access
3. **Order Data**: User access to own orders, vendor/admin full access
4. **Administrative Data**: Admin-only access to logs and configurations

### Role-Based Access Control

- **Users**: Can browse products, manage profile, place orders, manage watchlist
- **Vendors**: Can manage product catalog, view order management, access basic analytics
- **Admins**: Full system access, user management, system configuration

### Service Role Permissions

Background processes use service role with specific permissions for:
- Data synchronization from KicksDB
- Monitor event processing
- Rate limit management
- Automated cleanup tasks

## Performance Optimization

### Indexing Strategy

1. **Search Performance**:
   - Full-text search index on products
   - Tag-based filtering with GIN indexes
   - Price range queries with btree indexes

2. **Filtering Performance**:
   - Brand and category filtering
   - Platform-specific queries
   - Status-based filtering

3. **Relationship Performance**:
   - Foreign key indexes on all relationships
   - Composite indexes for common query patterns

### Computed Columns

- `product_stock.available_quantity`: Real-time stock calculation
- Automatic total calculations in orders

### Query Optimization

- Partial indexes for conditional queries
- Covering indexes for frequently accessed data
- GIN indexes for JSONB and array fields

## Business Logic Implementation

### Automated Triggers

1. **Stock Management**:
   - Automatic stock reservation on order creation
   - Stock release on order cancellation
   - Stock finalization on order delivery

2. **Price Monitoring**:
   - Automatic monitor event creation on price changes
   - Price history tracking
   - Alert threshold checking

3. **Order Processing**:
   - Automatic order number generation
   - Total calculation and validation
   - Status change tracking

4. **Data Integrity**:
   - Timestamp management
   - Primary image enforcement
   - Stock validation

### Constraints and Validation

- Positive price and quantity constraints
- Stock reservation validation
- Image limit enforcement (max 2 per product)
- Order total validation

## Scalability Considerations

### Database Design

- UUID primary keys for distributed systems
- JSONB for flexible data storage
- Partitioning readiness for large tables

### API Integration

- Rate limiting implementation
- Bulk operation support
- Efficient sync mechanisms

### Monitoring and Observability

- Comprehensive event logging
- Sync status tracking
- Performance metrics collection

## Migration Strategy

The schema is implemented through multiple migrations:

1. **Core Schema**: Basic table structure and relationships
2. **Security Layer**: RLS policies and role definitions
3. **Performance Layer**: Indexes and constraints
4. **Business Logic**: Triggers and functions

This modular approach allows for:
- Incremental deployment
- Easy rollback capabilities
- Environment-specific customization

## API Integration Endpoints Supported

Based on KicksDB API testing results:

### Working Endpoints (Free Tier)
- `GET /v3/utils/brands` - Brand data with product counts
- `GET /v3/stockx/products` - StockX product listing with search
- `GET /v3/goat/products` - GOAT product listing with search
- `GET /v3/stockx/products/{slug}` - Individual StockX product details

### Rate Limits
- **Monthly**: 50,000 requests
- **Per Minute**: 640 requests
- **Realtime**: 1 request per second

### Data Flow
1. **Brand Sync**: Periodic sync of brand data and product counts
2. **Product Sync**: Search-based product discovery and details
3. **Price Monitoring**: Regular price updates for monitored products
4. **Stock Tracking**: External availability status updates

## Future Enhancements

### Planned Features
- Real-time price monitoring (Enterprise tier)
- Sales analytics integration
- Multi-platform unified search
- Advanced inventory forecasting

### Schema Extensions
- Product review system
- Wishlist functionality
- Loyalty program integration
- Advanced analytics tables

## Maintenance and Operations

### Regular Tasks
- Sync log cleanup
- Monitor event archiving
- API rate limit monitoring
- Stock level auditing

### Monitoring Points
- Sync success rates
- API quota usage
- Database performance metrics
- User activity patterns

This schema provides a robust foundation for the SneakX e-commerce platform with comprehensive KicksDB integration, real-time monitoring capabilities, and enterprise-grade security and performance optimization.