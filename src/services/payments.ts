import { loadStripe, Stripe } from '@stripe/stripe-js'

// Initialize Stripe
let stripePromise: Promise<Stripe | null>

const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return stripePromise
}

export interface PaymentIntent {
  id: string
  client_secret: string
  amount: number
  currency: string
  status: string
}

export interface CreatePaymentIntentRequest {
  amount: number
  currency?: string
  orderId: string
  userId?: string
  metadata?: Record<string, string>
}

export interface ConfirmPaymentRequest {
  paymentIntentId: string
  paymentMethodId?: string
  return_url: string
}

export class PaymentService {
  private static async fetchFromAPI(endpoint: string, options: RequestInit = {}) {
    const url = `/api${endpoint}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Payment API Error: ${error}`)
    }

    return response.json()
  }

  static async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent> {
    try {
      const paymentIntent = await this.fetchFromAPI('/payments/create-intent', {
        method: 'POST',
        body: JSON.stringify(request),
      })

      return paymentIntent
    } catch (error) {
      console.error('Error creating payment intent:', error)
      throw error
    }
  }

  static async confirmPayment(request: ConfirmPaymentRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const stripe = await getStripe()
      if (!stripe) {
        throw new Error('Stripe failed to load')
      }

      const result = await stripe.confirmCardPayment(request.paymentIntentId)

      if (result.error) {
        return {
          success: false,
          error: result.error.message
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Error confirming payment:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment confirmation failed'
      }
    }
  }

  static async processCardPayment(
    clientSecret: string,
    paymentElement: any,
    confirmationUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const stripe = await getStripe()
      if (!stripe) {
        throw new Error('Stripe failed to load')
      }

      const { error } = await stripe.confirmPayment({
        elements: paymentElement,
        confirmParams: {
          return_url: confirmationUrl,
        },
      })

      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Error processing card payment:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Card payment failed'
      }
    }
  }

  static async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    try {
      const paymentIntent = await this.fetchFromAPI(`/payments/retrieve-intent?payment_intent_id=${paymentIntentId}`)
      return paymentIntent
    } catch (error) {
      console.error('Error retrieving payment intent:', error)
      throw error
    }
  }

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
      const session = await this.fetchFromAPI('/payments/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify(request),
      })

      return session
    } catch (error) {
      console.error('Error creating checkout session:', error)
      throw error
    }
  }

  static formatPrice(amount: number, currency = 'EUR'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount / 100)
  }

  static async redirectToCheckout(sessionId: string): Promise<void> {
    const stripe = await getStripe()
    if (!stripe) {
      throw new Error('Stripe failed to load')
    }

    const { error } = await stripe.redirectToCheckout({ sessionId })

    if (error) {
      throw new Error(error.message)
    }
  }
}

export default PaymentService