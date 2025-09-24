'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { OrderService } from '@/services/orders'
import { useRealTimeOrders, useOrderStatusMonitor } from '@/hooks/useRealTimeOrders'
import type { Order } from '@/types/order'

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  // Real-time order monitoring
  const {
    orderUpdates,
    isConnected: orderUpdatesConnected,
    clearOrderUpdates,
    getStatusMessage
  } = useRealTimeOrders()

  // Monitor status changes for current orders
  const { statusData, isConnected: statusConnected } = useOrderStatusMonitor(
    orders.map(order => order.id)
  )
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    totalSpent: 0,
  })

  useEffect(() => {
    if (!authLoading && user) {
      const userOrders = OrderService.getUserOrders(user.id)
      const orderStats = OrderService.getOrderStats(user.id)

      setOrders(userOrders)
      setStats(orderStats)
      setLoading(false)
    } else if (!authLoading && !user) {
      setLoading(false)
    }
  }, [user, authLoading])

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'shipped':
        return 'bg-gray-100 text-gray-800'
      case 'delivered':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-300 h-24 rounded-lg"></div>
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-300 h-32 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">Please log in to view your orders.</p>
          <Link
            href="/login?redirect=/orders"
            className="inline-block mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Order History</h1>
            <p className="text-gray-600 mt-2">View and track your orders</p>
          </div>

          {/* Real-time connection status */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                orderUpdatesConnected ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className="text-sm text-gray-600">
                {orderUpdatesConnected ? 'Live tracking active' : 'Tracking offline'}
              </span>
            </div>

            {orderUpdates.length > 0 && (
              <button
                onClick={clearOrderUpdates}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear Updates ({orderUpdates.length})
              </button>
            )}
          </div>
        </div>

        {/* Recent Order Updates */}
        {orderUpdates.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-medium text-gray-900">Recent Updates</h2>
            {orderUpdates.slice(0, 3).map((update, index) => (
              <div
                key={`${update.orderId}-${update.timestamp}`}
                className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-slide-in-right"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      Order #{update.orderId.slice(-8).toUpperCase()}
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      {getStatusMessage(update)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      getStatusColor(update.newStatus)
                    }`}>
                      {update.newStatus.charAt(0).toUpperCase() + update.newStatus.slice(1)}
                    </span>
                    <span className="text-xs text-blue-600">
                      {new Date(update.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-600">Total Orders</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{stats.delivered}</p>
              <p className="text-sm text-gray-600">Delivered</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">€{stats.totalSpent.toFixed(2)}</p>
              <p className="text-sm text-gray-600">Total Spent</p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No orders yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by making your first purchase!</p>
          <div className="mt-6">
            <Link
              href="/products"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Browse Products
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            // Get real-time status if available
            const realTimeStatus = statusData[order.id] || order.status
            const hasStatusUpdate = statusData[order.id] && statusData[order.id] !== order.status

            return (
              <div
                key={order.id}
                className={`bg-white border border-gray-200 rounded-lg p-6 transition-all duration-300 ${
                  hasStatusUpdate ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-medium text-gray-900">
                        Order #{order.id.slice(-8).toUpperCase()}
                      </h3>
                      {statusConnected && (
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      Placed on {formatDate(order.createdAt)}
                    </p>
                    {hasStatusUpdate && (
                      <p className="text-xs text-blue-600 mt-1 animate-pulse">
                        Status just updated!
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex flex-col items-end space-y-1">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full transition-all duration-300 ${
                        getStatusColor(realTimeStatus)
                      } ${hasStatusUpdate ? 'animate-pulse' : ''}`}>
                        {realTimeStatus.charAt(0).toUpperCase() + realTimeStatus.slice(1)}
                      </span>
                      {hasStatusUpdate && (
                        <span className="text-xs text-blue-600">Live update</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">€{order.total.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">{order.items.length} item{order.items.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>

              {/* Order Items Preview */}
              <div className="flex flex-wrap gap-2 mb-4">
                {order.items.slice(0, 4).map((item, index) => (
                  <img
                    key={index}
                    src={item.productImageUrl}
                    alt={item.productName}
                    className="w-12 h-12 object-contain rounded border"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=200&h=200&fit=crop&crop=center'
                    }}
                  />
                ))}
                {order.items.length > 4 && (
                  <div className="w-12 h-12 bg-gray-100 rounded border flex items-center justify-center text-xs text-gray-600">
                    +{order.items.length - 4}
                  </div>
                )}
              </div>

              {/* Shipping Address */}
              <div className="text-sm text-gray-600 mb-4">
                <p className="font-medium">Shipping to:</p>
                <p>
                  {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                </p>
                <p>
                  {order.shippingAddress.address}, {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex space-x-3">
                  <Link
                    href={`/orders/${order.id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Details
                  </Link>
                  {order.status === 'delivered' && (
                    <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                      Leave Review
                    </button>
                  )}
                </div>
                {order.status === 'pending' && (
                  <button className="text-red-600 hover:text-red-800 text-sm font-medium">
                    Cancel Order
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}