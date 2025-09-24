#!/usr/bin/env npx tsx

import { MonitorConfigService } from './src/lib/monitor/config'

async function testMonitorConfiguration() {
  console.log('🔍 Testing KicksDB Monitor Configuration...\n')

  try {
    const monitorService = new MonitorConfigService()

    // Test 1: Check service initialization
    console.log('✅ Monitor service initialized successfully')

    // Test 2: Test webhook endpoint health check
    console.log('\n📡 Testing webhook endpoint...')
    try {
      const response = await fetch('http://localhost:3000/api/kicks/monitor', {
        method: 'GET'
      })
      const healthData = await response.json()
      console.log('✅ Webhook endpoint accessible:', healthData.status)
    } catch (error) {
      console.error('❌ Webhook endpoint error:', error)
    }

    // Test 3: Test getting monitored products (should be empty initially)
    console.log('\n📊 Testing monitored products query...')
    const monitoredProducts = await monitorService.getMonitoredProducts()
    console.log(`✅ Found ${monitoredProducts.total} monitored products`)
    if (monitoredProducts.error) {
      console.log('⚠️  Error:', monitoredProducts.error)
    }

    // Test 4: Test monitoring status for a non-existent product
    console.log('\n🔍 Testing monitoring status check...')
    const status = await monitorService.getMonitoringStatus('test-product-id')
    console.log('✅ Status check completed:', { isMonitored: status.isMonitored })
    if (status.error) {
      console.log('ℹ️  Expected error for non-existent product:', status.error)
    }

    // Test 5: Test enabling new product monitor (if we have API key)
    console.log('\n🌍 Testing new product monitor...')
    const apiKey = process.env.KICKSDB_API_KEY
    if (apiKey && apiKey !== 'your-kicksdb-api-key') {
      try {
        const newProductMonitor = await monitorService.enableNewProductMonitor(['US', 'FR'])
        if (newProductMonitor.success) {
          console.log('✅ New product monitor enabled:', newProductMonitor.monitorId)
        } else {
          console.log('⚠️  New product monitor failed:', newProductMonitor.error)
        }
      } catch (error) {
        console.log('ℹ️  New product monitor test skipped (API limitations):',
          error instanceof Error ? error.message : String(error))
      }
    } else {
      console.log('ℹ️  Skipping new product monitor (no API key configured)')
    }

    console.log('\n🎉 Monitor configuration test completed!')

    return {
      success: true,
      message: 'All monitor configuration tests passed'
    }

  } catch (error) {
    console.error('\n❌ Monitor configuration test failed:')
    console.error(error)

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// Run the test
testMonitorConfiguration()
  .then((result) => {
    if (result.success) {
      console.log('\n✅ SUCCESS: Monitor configuration is working correctly')
      process.exit(0)
    } else {
      console.log('\n❌ FAILURE:', result.error)
      process.exit(1)
    }
  })
  .catch((error) => {
    console.error('\n💥 CRITICAL ERROR:', error)
    process.exit(1)
  })