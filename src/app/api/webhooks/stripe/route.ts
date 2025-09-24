import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { supabase } from '@/lib/supabase/server'

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

    // TODO: Send confirmation email
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
    // TODO: Send failure notification email

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

    // TODO: Process shipping address
    // TODO: Send confirmation email
    // TODO: Update inventory

    console.log(`Order ${orderId} updated successfully after checkout`)
  } catch (error) {
    console.error('Error handling checkout session completed:', error)
  }
}