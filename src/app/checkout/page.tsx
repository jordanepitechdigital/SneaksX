'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { OrderService } from '@/services/orders'
import PaymentService from '@/services/payments'
import type { ShippingAddress, PaymentMethod, CheckoutData } from '@/types/order'
import type { PaymentIntent } from '@/services/payments'

export default function CheckoutPage() {
  const router = useRouter()
  const { cart, actions } = useCart()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'shipping' | 'payment' | 'review'>('shipping')
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null)
  const [processingPayment, setProcessingPayment] = useState(false)

  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    phone: '',
  })

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>({
    id: 'mock-payment',
    type: 'card',
    last4: '4242',
    brand: 'visa',
    expiryMonth: 12,
    expiryYear: 2025,
  })

  // Calculate totals
  const subtotal = cart.totalPrice
  const shipping = subtotal > 100 ? 0 : 9.99 // Free shipping over €100
  const tax = subtotal * 0.21 // 21% VAT for EU
  const total = subtotal + shipping + tax

  useEffect(() => {
    // Redirect if not authenticated
    if (!user) {
      router.push('/login?redirect=/checkout')
      return
    }

    // Redirect if cart is empty
    if (cart.items.length === 0) {
      router.push('/cart')
      return
    }

    // Pre-fill with user data if available
    if (user.user_metadata) {
      const fullName = user.user_metadata.full_name || ''
      const [firstName, ...lastNameParts] = fullName.split(' ')
      setShippingAddress(prev => ({
        ...prev,
        firstName: firstName || '',
        lastName: lastNameParts.join(' ') || '',
      }))
    }
  }, [user, cart.items.length, router])

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    const requiredFields = ['firstName', 'lastName', 'address', 'city', 'state', 'postalCode', 'country']
    const missingFields = requiredFields.filter(field => !shippingAddress[field as keyof ShippingAddress])

    if (missingFields.length > 0) {
      setError('Please fill in all required fields')
      return
    }

    setStep('payment')
  }

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Ensure user is authenticated
      if (!user) {
        router.push('/login?redirect=/checkout')
        return
      }

      // Create order first (with pending status)
      const checkoutData: CheckoutData = {
        shippingAddress,
        paymentMethod,
        items: cart.items,
        subtotal,
        shipping,
        tax,
        total,
      }

      const { order } = await OrderService.createOrder(user.id, checkoutData)

      // Create payment intent
      const intent = await PaymentService.createPaymentIntent({
        amount: total,
        currency: 'eur',
        orderId: order.id,
        userId: user.id,
        metadata: {
          customerEmail: user.email || '',
          orderNumber: `ORD-${Date.now()}`,
        },
      })

      setPaymentIntent(intent)
      setStep('review')
    } catch (err) {
      setError('Failed to prepare payment. Please try again.')
      console.error('Payment preparation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePlaceOrder = async () => {
    if (!paymentIntent) {
      setError('Payment not initialized. Please try again.')
      return
    }

    if (!user) {
      setError('Please log in to complete your order.')
      return
    }

    setProcessingPayment(true)
    setError(null)

    try {
      // Use mock payment system (replace with your custom payment implementation)
      const session = await PaymentService.createCheckoutSession({
        line_items: cart.items.map(item => ({
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${item.product.brand} ${item.product.name}`,
              description: `Size: ${item.size}`,
              images: [item.product.imageUrl],
            },
            unit_amount: Math.round(item.product.price * 100), // Convert to cents
          },
          quantity: item.quantity,
        })),
        success_url: `${window.location.origin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}/checkout`,
        orderId: paymentIntent.metadata?.orderId || '',
        userId: user.id,
      })

      // Clear cart before redirect (since payment will be processed)
      actions.clearCart()

      // Redirect to payment processing
      await PaymentService.redirectToCheckout(session.sessionId)
    } catch (err) {
      setError('Failed to process payment. Please try again.')
      console.error('Payment processing error:', err)
    } finally {
      setProcessingPayment(false)
    }
  }

  if (!user || cart.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-center space-x-4">
          {[
            { key: 'shipping', label: 'Shipping' },
            { key: 'payment', label: 'Payment' },
            { key: 'review', label: 'Review' },
          ].map((stepItem, index) => (
            <div key={stepItem.key} className="flex items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${step === stepItem.key
                  ? 'bg-blue-600 text-white'
                  : index < ['shipping', 'payment', 'review'].indexOf(step)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-300 text-gray-600'
                }
              `}>
                {index < ['shipping', 'payment', 'review'].indexOf(step) ? '✓' : index + 1}
              </div>
              <span className="ml-2 text-sm font-medium text-gray-900">{stepItem.label}</span>
              {index < 2 && <div className="w-8 h-0.5 bg-gray-300 mx-4"></div>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          {/* Shipping Form */}
          {step === 'shipping' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Shipping Information</h2>
              <form onSubmit={handleShippingSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.firstName}
                      onChange={(e) => setShippingAddress(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.lastName}
                      onChange={(e) => setShippingAddress(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.address}
                    onChange={(e) => setShippingAddress(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.state}
                      onChange={(e) => setShippingAddress(prev => ({ ...prev, state: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Postal Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.postalCode}
                      onChange={(e) => setShippingAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Country *
                    </label>
                    <select
                      required
                      value={shippingAddress.country}
                      onChange={(e) => setShippingAddress(prev => ({ ...prev, country: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="IT">Italy</option>
                      <option value="ES">Spain</option>
                      <option value="NL">Netherlands</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={shippingAddress.phone || ''}
                    onChange={(e) => setShippingAddress(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Continue to Payment
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Payment Form */}
          {step === 'payment' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Payment Information</h2>
              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-blue-800">
                      Mock payment system. Custom payment processing will be implemented later.
                    </p>
                  </div>
                </div>

                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">Mock Payment Method</p>
                        <p className="text-xs text-gray-600">Custom payment system will be integrated</p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      checked
                      readOnly
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                  </div>
                </div>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('shipping')}
                    className="text-gray-600 hover:text-gray-800 px-4 py-2"
                  >
                    ← Back to Shipping
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Review Order
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Review Order */}
          {step === 'review' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Review Your Order</h2>

              {/* Shipping Address */}
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">Shipping Address</h3>
                <div className="text-sm text-gray-600">
                  <p>{shippingAddress.firstName} {shippingAddress.lastName}</p>
                  <p>{shippingAddress.address}</p>
                  <p>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}</p>
                  <p>{shippingAddress.country}</p>
                  {shippingAddress.phone && <p>{shippingAddress.phone}</p>}
                </div>
              </div>

              {/* Payment Method */}
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">Payment Method</h3>
                <p className="text-sm text-gray-600">Mock Payment Method (Custom system will be integrated)</p>
              </div>

              {/* Order Items */}
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">Order Items</h3>
                <div className="space-y-3">
                  {cart.items.map((item) => (
                    <div key={item.id} className="flex items-center space-x-3 py-2">
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="w-12 h-12 object-contain rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.product.name}</p>
                        <p className="text-xs text-gray-600">{item.product.brand} • Size {item.size}</p>
                      </div>
                      <div className="text-sm">
                        <p className="text-gray-900">€{item.product.price.toFixed(2)} × {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep('payment')}
                  className="text-gray-600 hover:text-gray-800 px-4 py-2"
                >
                  ← Back to Payment
                </button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={loading}
                  className={`px-6 py-2 rounded-md font-medium ${
                    loading
                      ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500'
                  }`}
                >
                  {loading ? 'Processing...' : 'Place Order'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-8">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-gray-900">€{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="text-gray-900">
                  {shipping === 0 ? 'Free' : `€${shipping.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-900">€{tax.toFixed(2)}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {subtotal < 100 && (
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md">
                Add €{(100 - subtotal).toFixed(2)} more for free shipping!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}