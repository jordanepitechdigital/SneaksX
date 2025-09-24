#!/usr/bin/env npx tsx

import 'dotenv/config'
import { supabase } from './src/lib/supabase/client'

console.log('🔄 Testing Real-time WebSocket Subscriptions...\n')

async function testRealTimeConnections() {
  let testsCompleted = 0
  const totalTests = 3

  console.log('1. Testing Product Stock Subscription...')

  // Test 1: Product Stock Updates
  const stockChannel = supabase
    .channel('test-stock-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'product_stock'
      },
      (payload) => {
        console.log('✅ Stock update received:', {
          productId: payload.new.product_id,
          size: payload.new.size,
          newQuantity: payload.new.quantity,
          reservedQuantity: payload.new.reserved_quantity
        })
      }
    )
    .subscribe((status) => {
      console.log(`   Stock subscription status: ${status}`)
      if (status === 'SUBSCRIBED') {
        testsCompleted++
        checkCompletion()
      }
    })

  console.log('\n2. Testing Order Status Subscription...')

  // Test 2: Order Updates
  const orderChannel = supabase
    .channel('test-order-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders'
      },
      (payload) => {
        console.log('✅ Order update received:', {
          orderId: payload.new.id,
          oldStatus: payload.old.status,
          newStatus: payload.new.status
        })
      }
    )
    .subscribe((status) => {
      console.log(`   Order subscription status: ${status}`)
      if (status === 'SUBSCRIBED') {
        testsCompleted++
        checkCompletion()
      }
    })

  console.log('\n3. Testing Product Price Subscription...')

  // Test 3: Product Price Updates
  const priceChannel = supabase
    .channel('test-price-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'products',
        filter: 'current_price=neq.null'
      },
      (payload) => {
        console.log('✅ Price update received:', {
          productId: payload.new.id,
          productName: payload.new.name,
          oldPrice: payload.old.current_price,
          newPrice: payload.new.current_price
        })
      }
    )
    .subscribe((status) => {
      console.log(`   Price subscription status: ${status}`)
      if (status === 'SUBSCRIBED') {
        testsCompleted++
        checkCompletion()
      }
    })

  function checkCompletion() {
    if (testsCompleted === totalTests) {
      console.log('\n🎉 All WebSocket subscriptions successfully established!')
      console.log('\n📊 Real-time Feature Test Results:')
      console.log('   ✅ Stock updates: Connected')
      console.log('   ✅ Order tracking: Connected')
      console.log('   ✅ Price monitoring: Connected')
      console.log('\n🔗 WebSocket Connection Status: HEALTHY')

      // Cleanup
      setTimeout(() => {
        stockChannel.unsubscribe()
        orderChannel.unsubscribe()
        priceChannel.unsubscribe()
        console.log('\n🧹 Cleaned up subscriptions. Test complete!')
        process.exit(0)
      }, 2000)
    }
  }

  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('\n⚠️ Timeout reached. Some subscriptions may have failed.')
    console.log(`✅ Successfully connected: ${testsCompleted}/${totalTests}`)
    stockChannel.unsubscribe()
    orderChannel.unsubscribe()
    priceChannel.unsubscribe()
    process.exit(testsCompleted === totalTests ? 0 : 1)
  }, 10000)
}

// Run the test
testRealTimeConnections().catch(console.error)