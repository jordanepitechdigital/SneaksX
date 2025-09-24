#!/usr/bin/env npx tsx

import 'dotenv/config'
import { InventoryService } from './src/services/inventory'

async function testSimple() {
  console.log('🧪 Testing simple stock reservation...')

  try {
    // Test stock availability first
    const availability = await InventoryService.checkStockAvailability([
      { productId: '4a84a273-304d-454f-9f03-c5473b48d9c8', size: '9', quantity: 1 }
    ])

    console.log('Stock availability:', availability[0])

    if (!availability[0].isAvailable) {
      console.log('Stock not available for testing')
      return
    }

    // Test reservation
    console.log('Attempting reservation...')
    const result = await InventoryService.reserveStock([
      { productId: '4a84a273-304d-454f-9f03-c5473b48d9c8', size: '9', quantity: 1 }
    ], {
      userId: '3a276d08-7f98-4756-9d33-055211b95c45',
      sessionId: 'test-123'
    })

    console.log('Reservation result:', result)

  } catch (error) {
    console.error('Error:', error)
  }
}

testSimple().catch(console.error)