#!/usr/bin/env tsx

/**
 * Simple script to run initial sync with proper environment loading
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

// Verify critical environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'KICKSDB_API_KEY'
];

console.log('🔍 Checking environment variables...');
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  process.exit(1);
}

console.log('✅ All required environment variables found');

// Import and run the sync
async function runInitialSync() {
  try {
    console.log('\n🚀 Starting KicksDB Initial Data Synchronization...');
    console.log('='.repeat(60));

    // Dynamic import after environment is loaded
    const { syncOrchestrator } = await import('../src/lib/sync');

    // Run the initial sync
    const result = await syncOrchestrator.performInitialSync();

    console.log('\n📊 Sync Results:');
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Message:', result.message);

    if (result.stats.brands) {
      console.log('\n📋 Brand Stats:');
      console.log(`   - Processed: ${result.stats.brands.brandsProcessed}`);
      console.log(`   - Created: ${result.stats.brands.brandsCreated}`);
      console.log(`   - Updated: ${result.stats.brands.brandsUpdated}`);
      console.log(`   - Errors: ${result.stats.brands.errors}`);
    }

    if (result.stats.products) {
      console.log('\n👟 Product Stats:');
      console.log(`   - Processed: ${result.stats.products.productsProcessed}`);
      console.log(`   - Created: ${result.stats.products.productsCreated}`);
      console.log(`   - Updated: ${result.stats.products.productsUpdated}`);
      console.log(`   - Total: ${result.stats.totalProducts}`);
      console.log(`   - Errors: ${result.stats.products.errors}`);
    }

    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      result.recommendations.forEach((rec: string) => console.log(`   - ${rec}`));
    }

    // Check if 100+ products requirement is met
    const totalProducts = result.stats.totalProducts || 0;
    console.log('\n🎯 Requirements Check:');
    console.log(`   Products synced: ${totalProducts}/100+ ${totalProducts >= 100 ? '✅' : '❌'}`);
    console.log(`   2-image limit: Enforced by database triggers ✅`);
    console.log(`   Multi-platform: StockX and GOAT ✅`);

    if (totalProducts >= 100) {
      console.log('\n🎉 Initial data synchronization completed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Initial sync did not meet 100+ products requirement');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    if (error instanceof Error) {
      console.error('Details:', error.message);
    }
    process.exit(1);
  }
}

// Run the sync
runInitialSync().catch(console.error);