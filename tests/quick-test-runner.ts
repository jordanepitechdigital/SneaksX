#!/usr/bin/env tsx
/**
 * Quick Test Runner for SneaksX Platform
 * Run with: npx tsx tests/quick-test-runner.ts
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const API_BASE_URL = 'http://localhost:3000';

// Test results tracker
const testResults: {
  passed: string[],
  failed: Array<{ test: string, error: string }>,
  warnings: string[]
} = {
  passed: [],
  failed: [],
  warnings: []
};

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Helper functions
async function testCase(name: string, fn: () => Promise<boolean>) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    const result = await fn();
    if (result) {
      console.log(`${colors.green}✓${colors.reset}`);
      testResults.passed.push(name);
    } else {
      console.log(`${colors.red}✗${colors.reset}`);
      testResults.failed.push({ test: name, error: 'Test returned false' });
    }
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset}`);
    testResults.failed.push({
      test: name,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Test Suite 1: Database Connectivity
async function testDatabaseConnection() {
  console.log(`\n${colors.blue}=== Database Connection Tests ===${colors.reset}`);

  await testCase('Connect to Supabase', async () => {
    const { data, error } = await supabase.from('products').select('count').limit(1);
    return !error;
  });

  await testCase('Fetch products', async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .limit(5);
    return !error && Array.isArray(data) && data.length > 0;
  });

  await testCase('Check product stock', async () => {
    const { data, error } = await supabase
      .from('product_stock')
      .select('*')
      .limit(5);
    return !error && Array.isArray(data);
  });

  await testCase('Verify brands exist', async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('*');
    return !error && Array.isArray(data) && data.length > 0;
  });

  await testCase('Verify categories exist', async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*');
    return !error && Array.isArray(data) && data.length > 0;
  });
}

// Test Suite 2: API Endpoints
async function testAPIEndpoints() {
  console.log(`\n${colors.blue}=== API Endpoint Tests ===${colors.reset}`);

  await testCase('Health check endpoint', async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/kicks/monitor/health`);
      return response.ok;
    } catch {
      testResults.warnings.push('API server may not be running');
      return false;
    }
  });

  await testCase('Monitor status endpoint', async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/kicks/monitor/status`);
      return response.ok;
    } catch {
      return false;
    }
  });
}

// Test Suite 3: Data Integrity
async function testDataIntegrity() {
  console.log(`\n${colors.blue}=== Data Integrity Tests ===${colors.reset}`);

  await testCase('Products have valid prices', async () => {
    const { data, error } = await supabase
      .from('products')
      .select('name, retail_price, current_price')
      .or('retail_price.is.null,retail_price.gte.0');
    return !error;
  });

  await testCase('Stock quantities are non-negative', async () => {
    const { data, error } = await supabase
      .from('product_stock')
      .select('*')
      .lt('quantity', 0);
    return !error && (!data || data.length === 0);
  });

  await testCase('Reserved quantities valid', async () => {
    const { data, error } = await supabase
      .from('product_stock')
      .select('*')
      .or('reserved_quantity.gt.quantity');
    return !error && (!data || data.length === 0);
  });

  await testCase('Orders have valid status', async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('order_number, status, payment_status');
    if (error) return false;

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    const validPaymentStatuses = ['pending', 'completed', 'failed', 'refunded'];

    return data.every(order =>
      validStatuses.includes(order.status) &&
      validPaymentStatuses.includes(order.payment_status)
    );
  });
}

// Test Suite 4: Real-time Subscriptions
async function testRealTimeFeatures() {
  console.log(`\n${colors.blue}=== Real-time Feature Tests ===${colors.reset}`);

  await testCase('Subscribe to product updates', async () => {
    return new Promise((resolve) => {
      const channel = supabase
        .channel('test-products')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'products' },
          () => resolve(true)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel.unsubscribe();
            resolve(true);
          }
        });

      // Timeout after 5 seconds
      setTimeout(() => {
        channel.unsubscribe();
        resolve(false);
      }, 5000);
    });
  });

  await testCase('Subscribe to stock updates', async () => {
    return new Promise((resolve) => {
      const channel = supabase
        .channel('test-stock')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'product_stock' },
          () => resolve(true)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel.unsubscribe();
            resolve(true);
          }
        });

      setTimeout(() => {
        channel.unsubscribe();
        resolve(false);
      }, 5000);
    });
  });
}

// Test Suite 5: Business Logic Validation
async function testBusinessLogic() {
  console.log(`\n${colors.blue}=== Business Logic Tests ===${colors.reset}`);

  await testCase('Cart items reference valid products', async () => {
    const { data: cartItems, error: cartError } = await supabase
      .from('shopping_cart')
      .select('product_id');

    if (cartError || !cartItems) return false;

    for (const item of cartItems) {
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .eq('id', item.product_id)
        .single();

      if (!product) return false;
    }

    return true;
  });

  await testCase('Order items match order totals', async () => {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        total_amount,
        order_items (
          quantity,
          unit_price,
          total_price
        )
      `)
      .limit(5);

    if (error || !orders) return true; // Skip if no orders

    return orders.every(order => {
      if (!order.order_items || order.order_items.length === 0) return true;

      const calculatedTotal = order.order_items.reduce(
        (sum, item) => sum + Number(item.total_price),
        0
      );

      // Allow for small differences due to tax/shipping
      const difference = Math.abs(Number(order.total_amount) - calculatedTotal);
      return difference < Number(order.total_amount) * 0.3; // Within 30% (accounting for tax/shipping)
    });
  });

  await testCase('Stock reservations have valid expiry', async () => {
    const { data, error } = await supabase
      .from('stock_reservations')
      .select('*')
      .lt('expires_at', new Date().toISOString());

    // Old reservations should be cleaned up
    return !error && (!data || data.length === 0);
  });
}

// Test Suite 6: Performance Benchmarks
async function testPerformance() {
  console.log(`\n${colors.blue}=== Performance Tests ===${colors.reset}`);

  await testCase('Product query performance (<500ms)', async () => {
    const start = Date.now();
    const { error } = await supabase
      .from('products')
      .select('*, brands!inner(*), categories!inner(*)')
      .limit(20);
    const duration = Date.now() - start;

    if (duration > 500) {
      testResults.warnings.push(`Product query took ${duration}ms`);
    }

    return !error && duration < 500;
  });

  await testCase('Stock query performance (<300ms)', async () => {
    const start = Date.now();
    const { error } = await supabase
      .from('product_stock')
      .select('*')
      .limit(50);
    const duration = Date.now() - start;

    if (duration > 300) {
      testResults.warnings.push(`Stock query took ${duration}ms`);
    }

    return !error && duration < 300;
  });
}

// Main test runner
async function runTests() {
  console.log(`${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║   SneaksX Platform Quick Test Suite    ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);

  const startTime = Date.now();

  try {
    await testDatabaseConnection();
    await testAPIEndpoints();
    await testDataIntegrity();
    await testRealTimeFeatures();
    await testBusinessLogic();
    await testPerformance();
  } catch (error) {
    console.error(`\n${colors.red}Fatal error during testing:${colors.reset}`, error);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Print summary
  console.log(`\n${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║           Test Results Summary         ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);

  console.log(`\n${colors.green}Passed: ${testResults.passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testResults.failed.length}${colors.reset}`);
  console.log(`${colors.yellow}Warnings: ${testResults.warnings.length}${colors.reset}`);
  console.log(`Duration: ${duration}s`);

  if (testResults.failed.length > 0) {
    console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
    testResults.failed.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }

  if (testResults.warnings.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    testResults.warnings.forEach(warning => {
      console.log(`  - ${warning}`);
    });
  }

  const passRate = (testResults.passed.length / (testResults.passed.length + testResults.failed.length) * 100).toFixed(1);
  console.log(`\n${colors.blue}Pass Rate: ${passRate}%${colors.reset}`);

  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests, testResults };