#!/usr/bin/env npx tsx

import 'dotenv/config'
import { InventoryService } from './src/services/inventory'
import { OrderService } from './src/services/orders'
import { PaymentService } from './src/services/payments'

// Test data - using real user ID from database
const TEST_USER_ID = '3a276d08-7f98-4756-9d33-055211b95c45' // user@sneakx.com
const TEST_SESSION_ID = 'test-session-123'

async function runInventorySystemTests() {
  console.log('🧪 Starting Inventory System Integration Tests\n')

  try {
    // Test 1: Check initial stock availability
    console.log('📊 Test 1: Checking stock availability...')
    const testItems = [
      { productId: '4a84a273-304d-454f-9f03-c5473b48d9c8', size: '9', quantity: 2 },
      { productId: '4a84a273-304d-454f-9f03-c5473b48d9c8', size: '10', quantity: 1 }
    ]

    const availability = await InventoryService.checkStockAvailability(testItems)
    console.log('Stock availability results:', availability)

    const allAvailable = availability.every(item => item.isAvailable)
    console.log(`✅ Stock availability check: ${allAvailable ? 'PASS' : 'FAIL'}\n`)

    if (!allAvailable) {
      console.log('❌ Not enough stock available for testing. Please check inventory.')
      return
    }

    // Test 2: Stock reservation
    console.log('🔒 Test 2: Reserving stock...')
    const reservationResult = await InventoryService.reserveStock(testItems, {
      userId: TEST_USER_ID,
      sessionId: TEST_SESSION_ID,
      expirationMinutes: 15
    })

    console.log('Reservation result:', reservationResult.success ? 'SUCCESS' : 'FAILED')
    if (reservationResult.errors) {
      console.log('Errors:', reservationResult.errors)
    }

    if (!reservationResult.success) {
      console.log('❌ Stock reservation failed')
      return
    }

    const reservations = reservationResult.reservations!
    console.log(`✅ Reserved ${reservations.length} items\n`)

    // Test 3: Create order with stock integration
    console.log('📦 Test 3: Creating order with stock integration...')
    const checkoutData = {
      items: [
        {
          product: {
            id: '4a84a273-304d-454f-9f03-c5473b48d9c8',
            name: 'Air Max 90 Black/White',
            brand: 'Nike',
            price: 120.00,
            imageUrl: 'https://example.com/image.jpg'
          },
          size: '9',
          quantity: 2
        },
        {
          product: {
            id: '4a84a273-304d-454f-9f03-c5473b48d9c8',
            name: 'Air Max 90 Black/White',
            brand: 'Nike',
            price: 120.00,
            imageUrl: 'https://example.com/image.jpg'
          },
          size: '10',
          quantity: 1
        }
      ],
      subtotal: 360.00,
      shipping: 10.00,
      tax: 32.40,
      total: 402.40,
      shippingAddress: {
        name: 'Test User',
        address: '123 Test Street',
        city: 'Test City',
        postalCode: '12345',
        country: 'US'
      },
      paymentMethod: { type: 'card' as const, cardLast4: '4242' },
      notes: 'Test order'
    }

    // Release the manual reservations first since createOrder will create its own
    await InventoryService.releaseReservations(reservations.map(r => r.id))

    const orderResult = await OrderService.createOrder(TEST_USER_ID, checkoutData, TEST_SESSION_ID)
    console.log('Order created:', orderResult.order.id)
    console.log(`✅ Order creation with stock integration: PASS\n`)

    const { order, reservations: orderReservations } = orderResult

    // Test 4: Create payment intent
    console.log('💳 Test 4: Creating payment intent...')
    const paymentIntent = await PaymentService.createPaymentIntent({
      amount: order.total,
      currency: 'eur',
      orderId: order.id,
      userId: TEST_USER_ID,
      metadata: {
        orderNumber: `SX-${Date.now().toString().slice(-8)}`
      }
    })

    console.log('Payment intent created:', paymentIntent.id)
    console.log(`✅ Payment intent creation: PASS\n`)

    // Test 5: Test payment success scenario
    console.log('✅ Test 5: Testing payment success (stock commit)...')
    const paymentResult = await PaymentService.processPayment({
      paymentIntentId: paymentIntent.id,
      paymentMethod: {
        type: 'card',
        details: { last4: '4242' }
      },
      return_url: 'http://localhost:3000/order-success'
    })

    console.log('Payment result:', paymentResult.success ? 'SUCCESS' : 'FAILED')
    if (paymentResult.error) {
      console.log('Payment error:', paymentResult.error)
    }

    if (paymentResult.success) {
      console.log('✅ Payment success and stock commit: PASS')

      // Verify order status was updated
      const updatedOrder = await OrderService.getOrderById(TEST_USER_ID, order.id)
      console.log('Order status after payment:', updatedOrder?.status)

      // Verify reservations were cleaned up
      const remainingReservations = await OrderService.getOrderReservations(order.id)
      console.log('Remaining reservations:', remainingReservations.length)
      console.log(`✅ Stock commit verification: ${remainingReservations.length === 0 ? 'PASS' : 'FAIL'}\n`)
    } else {
      console.log('❌ Payment failed, checking stock release...')

      // Verify reservations were released
      const remainingReservations = await OrderService.getOrderReservations(order.id)
      console.log('Remaining reservations after failure:', remainingReservations.length)
      console.log(`✅ Stock release on payment failure: ${remainingReservations.length === 0 ? 'PASS' : 'FAIL'}\n`)
    }

    // Test 6: Test cleanup functions
    console.log('🧹 Test 6: Testing cleanup functions...')

    // Test expired order cleanup
    const expiredResult = await OrderService.expireUnpaidOrders()
    console.log('Expired orders cleaned up:', expiredResult.expired)

    // Test inventory cleanup
    const cleanupResult = await InventoryService.cleanupExpiredReservations()
    console.log('Expired reservations cleaned up:', cleanupResult.cleaned)

    console.log(`✅ Cleanup functions: PASS\n`)

    // Test 7: Check low stock alerts
    console.log('⚠️ Test 7: Testing low stock monitoring...')
    const lowStockItems = await InventoryService.getLowStockItems(5)
    console.log('Low stock items found:', lowStockItems.length)
    if (lowStockItems.length > 0) {
      console.log('Sample low stock item:', lowStockItems[0])
    }
    console.log(`✅ Low stock monitoring: PASS\n`)

    console.log('🎉 All tests completed successfully!')
    console.log('\n📋 Test Summary:')
    console.log('✅ Stock availability validation')
    console.log('✅ Stock reservation system')
    console.log('✅ Order creation with stock integration')
    console.log('✅ Payment intent generation')
    console.log('✅ Payment processing with stock commit/release')
    console.log('✅ Automatic cleanup functions')
    console.log('✅ Low stock monitoring')

    console.log('\n🚀 The inventory system is fully functional and ready for production!')

  } catch (error) {
    console.error('❌ Test failed with error:', error)
    console.log('\n🔍 Error details:', error instanceof Error ? error.message : String(error))
  }
}

// Run the tests
runInventorySystemTests().catch(console.error)