import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { supabase } from '@/lib/supabase/server'
import { EmailService } from '@/services/email/EmailService'
import { InventoryService } from '@/services/inventory'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
})

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = headers()
  const sig = headersList.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret)
  } catch (err) {
    console.error(`Webhook signature verification failed:`, err)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      await handlePaymentSucceeded(paymentIntent)
      break

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent
      await handlePaymentFailed(failedPayment)
      break

    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session
      await handleCheckoutSessionCompleted(session)
      break

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log(`Payment succeeded: ${paymentIntent.id}`)

    const orderId = paymentIntent.metadata.orderId
    if (!orderId) {
      console.error('No orderId in payment intent metadata')
      return
    }

    // Get full order details for processing
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (
            id,
            name,
            brand,
            images,
            brands (name)
          )
        ),
        users (
          email,
          user_metadata
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !orderData) {
      console.error('Error fetching order details:', orderError)
      return
    }

    // Update order status in database
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'completed',
        status: 'processing',
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order after payment:', error)
      return
    }

    // Commit inventory reservations (convert reserved stock to sold)
    try {
      // Get reservation IDs from the order
      const reservationIds = orderData.order_items
        .map((item: any) => item.reservation_id)
        .filter(Boolean)

      if (reservationIds.length > 0) {
        const result = await InventoryService.commitReservedStock(reservationIds, orderId)
        if (result.success) {
          console.log(`Inventory committed for order ${orderId}`)
        } else {
          console.error(`Failed to commit inventory for order ${orderId}:`, result.error)
        }
      } else {
        console.warn(`No reservation IDs found for order ${orderId}`)
      }
    } catch (inventoryError) {
      console.error('Error committing inventory:', inventoryError)
      // Don't fail the webhook, but log for manual review
    }

    // Send order confirmation email
    try {
      const emailData = {
        orderNumber: orderData.order_number || `#${orderId.slice(-8).toUpperCase()}`,
        customerName: orderData.users?.user_metadata?.full_name || 'Customer',
        customerEmail: orderData.users?.email || orderData.customer_email,
        orderDate: new Date(orderData.created_at).toLocaleDateString(),
        items: orderData.order_items.map((item: any) => ({
          name: item.products?.name || 'Unknown Product',
          brand: Array.isArray(item.products?.brands) ? item.products.brands[0]?.name : item.products?.brands?.name || item.products?.brand,
          size: item.size,
          quantity: item.quantity,
          price: item.unit_price,
          image: item.products?.images?.[0] || '/placeholder-product.jpg'
        })),
        subtotal: orderData.subtotal,
        shipping: orderData.shipping_cost || 0,
        tax: orderData.tax_amount || 0,
        total: orderData.total,
        shippingAddress: orderData.shipping_address ? {
          name: `${orderData.shipping_address.firstName} ${orderData.shipping_address.lastName}`,
          address: orderData.shipping_address.address,
          city: orderData.shipping_address.city,
          postalCode: orderData.shipping_address.postalCode,
          country: orderData.shipping_address.country
        } : undefined,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
      }

      await EmailService.sendOrderConfirmation(emailData)
      console.log(`Order confirmation email sent for order ${orderId}`)
    } catch (emailError) {
      console.error('Error sending order confirmation email:', emailError)
      // Don't fail the webhook, but log for manual follow-up
    }

    // Send admin notification for high-value orders
    try {
      if (orderData.total > 500) {
        await EmailService.sendAdminNotification('high_value_order', {
          orderNumber: orderData.order_number || `#${orderId.slice(-8).toUpperCase()}`,
          total: orderData.total,
          customerEmail: orderData.users?.email || orderData.customer_email,
          paymentIntentId: paymentIntent.id
        })
      }
    } catch (adminEmailError) {
      console.error('Error sending admin notification:', adminEmailError)
    }

    console.log(`Order ${orderId} processed successfully after payment`)
  } catch (error) {
    console.error('Error handling payment succeeded:', error)
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log(`Payment failed: ${paymentIntent.id}`)

    const orderId = paymentIntent.metadata.orderId
    if (!orderId) {
      console.error('No orderId in payment intent metadata')
      return
    }

    // Get order details before marking as failed
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        users (email, user_metadata)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !orderData) {
      console.error('Error fetching order details:', orderError)
      return
    }

    // Update order status in database
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'failed',
        status: 'cancelled',
        stripe_payment_intent_id: paymentIntent.id,
        failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order after payment failure:', error)
      return
    }

    // Release inventory reservations
    try {
      // Get reservation IDs from the order items
      const reservationIds = orderData.order_items
        .map((item: any) => item.reservation_id)
        .filter(Boolean)

      if (reservationIds.length > 0) {
        const result = await InventoryService.releaseReservations(reservationIds)
        if (result.success) {
          console.log(`Inventory reservations released for failed order ${orderId}`)
        } else {
          console.error(`Failed to release reservations for order ${orderId}:`, result.error)
        }
      } else {
        console.warn(`No reservation IDs found for failed order ${orderId}`)
      }
    } catch (inventoryError) {
      console.error('Error releasing inventory reservations:', inventoryError)
      // Continue processing even if inventory release fails
    }

    // Send admin notification for payment failure
    try {
      await EmailService.sendAdminNotification('payment_failed', {
        orderNumber: orderData.order_number || `#${orderId.slice(-8).toUpperCase()}`,
        total: orderData.total,
        customerEmail: orderData.users?.email || orderData.customer_email,
        paymentIntentId: paymentIntent.id,
        failureReason: paymentIntent.last_payment_error?.message || 'Unknown error',
        failureCode: paymentIntent.last_payment_error?.code
      })
      console.log(`Admin notification sent for failed payment ${orderId}`)
    } catch (emailError) {
      console.error('Error sending payment failure notification:', emailError)
    }

    console.log(`Order ${orderId} marked as failed and inventory released`)
  } catch (error) {
    console.error('Error handling payment failed:', error)
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  try {
    console.log(`Checkout session completed: ${session.id}`)

    const orderId = session.metadata?.orderId
    if (!orderId) {
      console.error('No orderId in checkout session metadata')
      return
    }

    // Get existing order data
    const { data: existingOrder, error: fetchError } = await supabase
      .from('orders')
      .select('payment_status, stripe_payment_intent_id')
      .eq('id', orderId)
      .single()

    if (fetchError) {
      console.error('Error fetching existing order:', fetchError)
      return
    }

    // Skip if already processed by payment_intent.succeeded webhook
    if (existingOrder.payment_status === 'completed' && existingOrder.stripe_payment_intent_id) {
      console.log(`Order ${orderId} already processed by payment intent webhook, skipping`)
      return
    }

    // Update order with customer information from checkout
    const updates: any = {
      payment_status: 'completed',
      status: 'processing',
      stripe_checkout_session_id: session.id,
      updated_at: new Date().toISOString()
    }

    // Add customer email if available
    if (session.customer_details?.email) {
      updates.customer_email = session.customer_details.email
    }

    // Process shipping address from checkout session
    if ((session as any).shipping_details) {
      const shippingDetails = (session as any).shipping_details
      updates.shipping_address = {
        firstName: session.customer_details?.name?.split(' ')[0] || '',
        lastName: session.customer_details?.name?.split(' ').slice(1).join(' ') || '',
        address: shippingDetails.address?.line1 || '',
        address2: shippingDetails.address?.line2 || '',
        city: shippingDetails.address?.city || '',
        state: shippingDetails.address?.state || '',
        postalCode: shippingDetails.address?.postal_code || '',
        country: shippingDetails.address?.country || ''
      }
    }

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order after checkout:', error)
      return
    }

    // If payment intent hasn't been processed yet, handle the full order processing here
    if (!existingOrder.stripe_payment_intent_id) {
      console.log(`Processing order ${orderId} via checkout session (no payment intent processed yet)`)

      // Note: In most cases, the payment_intent.succeeded webhook will handle this
      // But this serves as a fallback for checkout sessions without separate payment intents

      // Get full order details for email/inventory processing
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            products (id, name, brand, images, brands (name))
          ),
          users (email, user_metadata)
        `)
        .eq('id', orderId)
        .single()

      if (orderError || !orderData) {
        console.error('Error fetching order details for checkout processing:', orderError)
        return
      }

      // Process inventory and send emails (similar to payment_intent.succeeded)
      try {
        // Get reservation IDs from the order items
        const reservationIds = orderData.order_items
          .map((item: any) => item.reservation_id)
          .filter(Boolean)

        if (reservationIds.length > 0) {
          const result = await InventoryService.commitReservedStock(reservationIds, orderId)
          if (result.success) {
            console.log(`Inventory committed for checkout order ${orderId}`)
          } else {
            console.error(`Failed to commit inventory for checkout order ${orderId}:`, result.error)
          }
        } else {
          console.warn(`No reservation IDs found for checkout order ${orderId}`)
        }
      } catch (inventoryError) {
        console.error('Error committing inventory from checkout:', inventoryError)
      }

      try {
        const emailData = {
          orderNumber: orderData.order_number || `#${orderId.slice(-8).toUpperCase()}`,
          customerName: orderData.users?.user_metadata?.full_name || session.customer_details?.name || 'Customer',
          customerEmail: orderData.users?.email || session.customer_details?.email || orderData.customer_email,
          orderDate: new Date(orderData.created_at).toLocaleDateString(),
          items: orderData.order_items.map((item: any) => ({
            name: item.products?.name || 'Unknown Product',
            brand: Array.isArray(item.products?.brands) ? item.products.brands[0]?.name : item.products?.brands?.name || item.products?.brand,
            size: item.size,
            quantity: item.quantity,
            price: item.unit_price,
            image: item.products?.images?.[0] || '/placeholder-product.jpg'
          })),
          subtotal: orderData.subtotal,
          shipping: orderData.shipping_cost || 0,
          tax: orderData.tax_amount || 0,
          total: orderData.total,
          shippingAddress: updates.shipping_address,
          estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
        }

        await EmailService.sendOrderConfirmation(emailData)
        console.log(`Order confirmation email sent for checkout order ${orderId}`)
      } catch (emailError) {
        console.error('Error sending order confirmation email from checkout:', emailError)
      }
    }

    console.log(`Order ${orderId} updated successfully after checkout session`)
  } catch (error) {
    console.error('Error handling checkout session completed:', error)
  }
}