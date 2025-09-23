// Generic Payment Service (Custom payment implementation will be added later)
import { OrderService } from '@/services/orders'

export interface PaymentIntent {
  id: string
  amount: number
  currency: string
  status: string
  metadata?: Record<string, string>
}

export interface CreatePaymentIntentRequest {
  amount: number
  currency?: string
  orderId: string
  userId?: string
  metadata?: Record<string, string>
}

export interface ProcessPaymentRequest {
  paymentIntentId: string
  paymentMethod: {
    type: 'card' | 'bank_transfer' | 'crypto'
    details?: Record<string, any>
  }
  return_url: string
}

export class PaymentService {
  // Mock payment processing - replace with your custom payment system
  static async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent> {
    try {
      // This will be replaced with your custom payment system API
      const mockPaymentIntent: PaymentIntent = {
        id: `pi_mock_${request.orderId}`, // Include order ID in payment intent ID for easier tracking
        amount: Math.round(request.amount * 100), // Convert to cents
        currency: request.currency || 'eur',
        status: 'requires_payment_method',
        metadata: {
          ...request.metadata,
          orderId: request.orderId,
          userId: request.userId
        },
      }

      return mockPaymentIntent
    } catch (error) {
      console.error('Error creating payment intent:', error)
      throw error
    }
  }

  static async processPayment(request: ProcessPaymentRequest): Promise<{ success: boolean; error?: string; orderId?: string }> {
    try {
      // Mock payment processing - replace with your custom payment system
      console.log('Processing payment:', request)

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Extract order ID from payment intent ID (format: pi_mock_{orderId})
      const orderId = request.paymentIntentId.startsWith('pi_mock_')
        ? request.paymentIntentId.replace('pi_mock_', '')
        : undefined

      // Simulate random payment outcomes for testing
      const shouldSucceed = Math.random() > 0.1 // 90% success rate

      if (shouldSucceed) {
        // Complete the order payment and commit stock
        if (orderId) {
          const orderCompleted = await OrderService.completeOrderPayment(orderId, request.paymentIntentId)
          if (!orderCompleted) {
            throw new Error('Payment succeeded but order completion failed')
          }
        }

        return { success: true, orderId }
      } else {
        // Fail the order payment and release stock
        if (orderId) {
          await OrderService.failOrderPayment(orderId, 'Payment declined by processor')
        }

        return {
          success: false,
          error: 'Payment was declined by your bank or card issuer',
          orderId
        }
      }
    } catch (error) {
      console.error('Error processing payment:', error)

      // Extract order ID for cleanup
      const orderId = request.paymentIntentId.startsWith('pi_mock_')
        ? request.paymentIntentId.replace('pi_mock_', '')
        : undefined

      // Ensure stock is released on payment processing errors
      if (orderId) {
        await OrderService.failOrderPayment(orderId, 'Payment processing error')
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment processing failed',
        orderId
      }
    }
  }

  static async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    try {
      // Mock retrieval - replace with your custom payment system
      const mockPaymentIntent: PaymentIntent = {
        id: paymentIntentId,
        amount: 0,
        currency: 'eur',
        status: 'succeeded',
      }

      return mockPaymentIntent
    } catch (error) {
      console.error('Error retrieving payment intent:', error)
      throw error
    }
  }

  static formatPrice(amount: number, currency = 'EUR'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // Mock checkout session for compatibility
  static async createCheckoutSession(request: {
    line_items: Array<{
      price_data: {
        currency: string
        product_data: {
          name: string
          description?: string
          images?: string[]
        }
        unit_amount: number
      }
      quantity: number
    }>
    success_url: string
    cancel_url: string
    orderId: string
    userId?: string
  }): Promise<{ sessionId: string; url: string }> {
    try {
      // Mock checkout session - replace with your custom payment system
      const mockSession = {
        sessionId: `cs_mock_${Date.now()}`,
        url: request.success_url.replace('{CHECKOUT_SESSION_ID}', `cs_mock_${Date.now()}`)
      }

      return mockSession
    } catch (error) {
      console.error('Error creating checkout session:', error)
      throw error
    }
  }

  // Mock redirect function
  static async redirectToCheckout(sessionId: string): Promise<void> {
    // This will be replaced with your custom payment system redirect
    console.log('Redirecting to checkout:', sessionId)

    // For now, just show a mock success
    alert('Mock Payment: Order processed successfully! (Replace with your payment system)')

    // Redirect to success page
    window.location.href = '/order-success?session_id=' + sessionId
  }
}

export default PaymentService