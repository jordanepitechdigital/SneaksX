#!/usr/bin/env npx tsx

import 'dotenv/config'
import { supabase } from './src/lib/supabase/client'

async function testRPC() {
  console.log('🧪 Testing RPC call directly...')

  try {
    // Test direct RPC call
    console.log('Testing direct RPC call to increment_reserved_quantity...')
    const { data, error } = await supabase.rpc('increment_reserved_quantity', {
      p_product_id: '4a84a273-304d-454f-9f03-c5473b48d9c8',
      p_size: '9',
      p_quantity: 1
    })

    console.log('RPC result data:', data)
    console.log('RPC result error:', error)

    if (error) {
      console.error('RPC Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
    }

    // Check the stock after the call
    const { data: stockData, error: stockError } = await supabase
      .from('product_stock')
      .select('*')
      .eq('product_id', '4a84a273-304d-454f-9f03-c5473b48d9c8')
      .eq('size', '9')
      .single()

    console.log('Stock after RPC call:', stockData)
    console.log('Stock query error:', stockError)

  } catch (error) {
    console.error('Caught error:', error)
  }
}

testRPC().catch(console.error)