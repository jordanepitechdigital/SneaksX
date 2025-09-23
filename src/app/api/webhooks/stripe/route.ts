import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { supabase } from '@/lib/supabase/server'
import EmailService from '@/services/email/EmailService'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
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

    // Update order status in database
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'completed',
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order after payment:', error)
      return
    }

    // Send order confirmation email
    await sendOrderConfirmationEmail(orderId)

    // TODO: Update inventory/stock
    // TODO: Create order items records

    console.log(`Order ${orderId} updated successfully after payment`)
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

    // Update order status in database
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'failed',
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order after payment failure:', error)
      return
    }

    // TODO: Release reserved inventory
    // Send failure notification to admin
    await EmailService.sendAdminNotification('payment_failed', {
      orderId,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    })

    console.log(`Order ${orderId} marked as failed after payment failure`)
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

    // Update order with customer information from checkout
    const updates: any = {
      payment_status: 'completed',
      status: 'processing',
      updated_at: new Date().toISOString()
    }

    // Add customer email if available
    if (session.customer_details?.email) {
      updates.customer_email = session.customer_details.email
    }

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order after checkout:', error)
      return
    }

    // Send order confirmation email
    await sendOrderConfirmationEmail(orderId)

    // TODO: Process shipping address
    // TODO: Update inventory

    console.log(`Order ${orderId} updated successfully after checkout`)
  } catch (error) {
    console.error('Error handling checkout session completed:', error)
  }
}

async function sendOrderConfirmationEmail(orderId: string) {
  try {
    // Fetch order details with related data
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        users (email, full_name),
        order_items (
          *,
          products (
            name,
            brands (name),
            product_images (image_url, is_primary)
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      console.error('Error fetching order for email:', error)
      return
    }

    const user = order.users
    if (!user?.email) {
      console.error('No user email found for order:', orderId)
      return
    }

    // Transform order items for email
    const emailItems = order.order_items.map((item: any) => ({
      name: item.products?.name || 'Unknown Product',
      brand: item.products?.brands?.name || 'Unknown Brand',
      size: item.size,
      quantity: item.quantity,
      price: parseFloat(item.unit_price),
      image: item.products?.product_images?.find((img: any) => img.is_primary)?.image_url ||
             'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop&crop=center'
    }))

    // Send order confirmation email
    const emailSent = await EmailService.sendOrderConfirmation({
      orderNumber: order.order_number,
      customerName: user.full_name || 'Valued Customer',
      customerEmail: user.email,
      orderDate: order.created_at,
      items: emailItems,
      subtotal: parseFloat(order.subtotal),
      shipping: parseFloat(order.shipping_amount || '0'),
      tax: parseFloat(order.tax_amount || '0'),
      total: parseFloat(order.total_amount),
      estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(), // 7 days from now
    })

    if (emailSent) {
      console.log(`Order confirmation email sent for order ${orderId}`)
    } else {
      console.error(`Failed to send order confirmation email for order ${orderId}`)
    }
  } catch (error) {
    console.error('Error sending order confirmation email:', error)
  }
}