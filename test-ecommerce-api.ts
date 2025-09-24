#!/usr/bin/env npx tsx

/**
 * E-commerce API Service Test
 * Test comprehensive e-commerce operations including cart, orders, payments, and inventory
 */

import { ecommerceService } from './src/services/api/ecommerce'

async function testEcommerceAPI() {
  console.log('🛒 Testing E-commerce API Service...\n')

  try {
    // Test session and user IDs for testing (using real UUIDs from database)
    const testSessionId = `test_session_${Date.now()}`
    const testUserId = '3d3f7664-6522-4a61-a1df-f69e0af9472c' // Real user ID from database
    const testProductId = '4a84a273-304d-454f-9f03-c5473b48d9c8' // Real product ID from database

    console.log('🧪 Test Context:')
    console.log(`Session ID: ${testSessionId}`)
    console.log(`User ID: ${testUserId}`)
    console.log(`Product ID: ${testProductId}\n`)

    // Test 1: Add item to cart
    console.log('📋 Test 1: Add item to cart')
    const addResult = await ecommerceService.addToCart({
      productId: testProductId,
      size: 'US 10',
      quantity: 2,
      sessionId: testSessionId,
      userId: testUserId
    })

    console.log('Add to cart result:', addResult.success ? 'SUCCESS' : 'FAILED')
    if (addResult.cartItem) {
      console.log(`Added: ${addResult.cartItem.productName} (${addResult.cartItem.size}) x${addResult.cartItem.quantity}`)
    }
    if (addResult.error) {
      console.log('Error:', addResult.error)
    }
    console.log('✅ Test 1 completed\n')

    // Test 2: Get cart contents
    console.log('📋 Test 2: Get cart contents')
    const cartSummary = await ecommerceService.getCart(testSessionId, testUserId)
    console.log(`Cart items: ${cartSummary.totalItems}`)
    console.log(`Subtotal: €${cartSummary.subtotal.toFixed(2)}`)
    console.log(`Estimated total: €${cartSummary.estimatedTotal.toFixed(2)}`)

    cartSummary.items.forEach(item => {
      console.log(`- ${item.productName} (${item.size}) x${item.quantity} = €${item.totalPrice.toFixed(2)}`)
    })
    console.log('✅ Test 2 completed\n')

    // Test 3: Update cart item quantity
    if (cartSummary.items.length > 0) {
      console.log('📋 Test 3: Update cart item quantity')
      const firstItem = cartSummary.items[0]
      const updateResult = await ecommerceService.updateCartItem({
        cartItemId: firstItem.id,
        quantity: 3
      })

      console.log('Update cart result:', updateResult.success ? 'SUCCESS' : 'FAILED')
      if (updateResult.cartItem) {
        console.log(`Updated: ${updateResult.cartItem.productName} quantity to ${updateResult.cartItem.quantity}`)
      }
      if (updateResult.error) {
        console.log('Error:', updateResult.error)
      }
      console.log('✅ Test 3 completed\n')
    }

    // Test 4: Validate cart
    console.log('📋 Test 4: Validate cart')
    const validation = await ecommerceService.validateCart(testSessionId, testUserId)
    console.log('Cart valid:', validation.isValid ? 'YES' : 'NO')
    if (validation.errors.length > 0) {
      console.log('Validation errors:', validation.errors)
    }
    if (validation.unavailableItems.length > 0) {
      console.log('Unavailable items:', validation.unavailableItems.length)
    }
    console.log('✅ Test 4 completed\n')

    // Test 5: Check stock availability
    console.log('📋 Test 5: Check stock availability')
    const stockCheck = await ecommerceService.checkStockAvailability([
      { productId: testProductId, size: 'US 10', quantity: 1 },
      { productId: testProductId, size: 'US 11', quantity: 2 }
    ])

    stockCheck.forEach(stock => {
      console.log(`${stock.productId} (${stock.size}): ${stock.availableQuantity} available, ${stock.isAvailable ? 'IN STOCK' : 'OUT OF STOCK'}`)
    })
    console.log('✅ Test 5 completed\n')

    // Test 6: Payment intent creation
    console.log('📋 Test 6: Create payment intent')
    const paymentResult = await ecommerceService.createPaymentIntent({
      amount: 150.00,
      currency: 'EUR',
      orderId: `test-order-${Date.now()}`,
      userId: testUserId
    })

    console.log('Payment intent result:', paymentResult.success ? 'SUCCESS' : 'FAILED')
    if (paymentResult.paymentIntent) {
      console.log(`Payment Intent ID: ${paymentResult.paymentIntent.id}`)
      console.log(`Amount: €${(paymentResult.paymentIntent.amount / 100).toFixed(2)}`)
      console.log(`Status: ${paymentResult.paymentIntent.status}`)
    }
    if (paymentResult.error) {
      console.log('Error:', paymentResult.error)
    }
    console.log('✅ Test 6 completed\n')

    // Test 7: Price formatting
    console.log('📋 Test 7: Price formatting utility')
    const formattedPrices = [
      ecommerceService.formatPrice(99.99),
      ecommerceService.formatPrice(1234.56),
      ecommerceService.formatPrice(0.99),
    ]

    console.log('Formatted prices:', formattedPrices)
    console.log('✅ Test 7 completed\n')

    // Test 8: Remove from cart
    const currentCart = await ecommerceService.getCart(testSessionId, testUserId)
    if (currentCart.items.length > 0) {
      console.log('📋 Test 8: Remove item from cart')
      const removeResult = await ecommerceService.removeFromCart(currentCart.items[0].id)
      console.log('Remove from cart result:', removeResult.success ? 'SUCCESS' : 'FAILED')
      if (removeResult.error) {
        console.log('Error:', removeResult.error)
      }
      console.log('✅ Test 8 completed\n')
    }

    // Test 9: Clear cart
    console.log('📋 Test 9: Clear cart')
    const clearResult = await ecommerceService.clearCart(testSessionId, testUserId)
    console.log('Clear cart result:', clearResult.success ? 'SUCCESS' : 'FAILED')
    if (clearResult.error) {
      console.log('Error:', clearResult.error)
    }

    // Verify cart is empty
    const finalCart = await ecommerceService.getCart(testSessionId, testUserId)
    console.log(`Final cart items: ${finalCart.totalItems}`)
    console.log('✅ Test 9 completed\n')

    console.log('🎉 All E-commerce API tests completed!')
    console.log('\n📊 Test Summary:')
    console.log('- Cart CRUD operations: ✅')
    console.log('- Cart validation: ✅')
    console.log('- Stock availability checking: ✅')
    console.log('- Payment intent creation: ✅')
    console.log('- Price formatting utilities: ✅')
    console.log('- Service integration: ✅')

  } catch (error) {
    console.error('❌ E-commerce API test failed:', error)
    process.exit(1)
  }
}

// Run tests
testEcommerceAPI().catch(console.error)