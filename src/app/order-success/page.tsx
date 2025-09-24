'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { OrderService } from '@/services/orders'
import type { Order } from '@/types/order'

export default function OrderSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const orderId = searchParams.get('orderId')
  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    loadOrderDetails()
  }, [user, orderId, sessionId, router])

  async function loadOrderDetails() {
    try {
      setLoading(true)

      if (orderId && user) {
        // Handle direct order ID
        const orderData = await OrderService.getOrderById(user.id, orderId)
        if (orderData) {
          setOrder(orderData)
        } else {
          setError('Order not found')
        }
      } else if (sessionId) {
        // Handle payment session - show success without specific order details
        setOrder({
          id: 'payment-' + sessionId.slice(-8),
          userId: user?.id || '',
          items: [],
          subtotal: 0,
          shipping: 0,
          tax: 0,
          total: 0,
          status: 'processing',
          shippingAddress: null,
          paymentMethod: { id: 'temp', type: 'card', last4: '****' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      } else {
        // Fallback for legacy URLs
        setOrder({
          id: `SX-${Date.now().toString().slice(-8)}`,
          userId: user?.id || '',
          items: [],
          subtotal: 0,
          shipping: 0,
          tax: 0,
          total: 0,
          status: 'processing',
          shippingAddress: null,
          paymentMethod: { id: 'temp', type: 'card', last4: '****' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('Error loading order details:', err)
      setError('Failed to load order details')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/orders"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            View All Orders
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center">
        {/* Success Icon */}
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-6">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        {/* Success Message */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Order Placed Successfully!
        </h1>

        <p className="text-gray-600 mb-2">
          Thank you for your purchase. Your order has been confirmed.
        </p>

        <p className="text-sm text-gray-500 mb-8">
          Order Number: <span className="font-medium text-gray-900">{order?.id || 'N/A'}</span>
        </p>

        {/* Order Details */}
        <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">What's Next?</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-xs font-medium text-blue-600">1</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Order Confirmation</p>
                <p>You'll receive an email confirmation shortly with your order details.</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-xs font-medium text-blue-600">2</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Processing</p>
                <p>We'll prepare your order for shipping within 1-2 business days.</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-xs font-medium text-blue-600">3</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Shipping</p>
                <p>Your order will be shipped and you'll receive tracking information.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
          <Link
            href="/products"
            className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium text-center block"
          >
            Continue Shopping
          </Link>

          <Link
            href="/profile"
            className="w-full sm:w-auto bg-white text-gray-700 px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium text-center block"
          >
            View Order History
          </Link>
        </div>

        {/* Contact Support */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Need help with your order?{' '}
            <Link href="/contact" className="text-blue-600 hover:text-blue-800 font-medium">
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}