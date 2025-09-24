'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Order } from '@/types/order'

export interface OrderUpdate {
  orderId: string
  oldStatus: string
  newStatus: string
  timestamp: string
  notes?: string
}

export interface RealTimeOrderData {
  orderUpdates: OrderUpdate[]
  isConnected: boolean
  lastUpdate: string | null
}

export function useRealTimeOrders() {
  const { user } = useAuth()
  const [data, setData] = useState<RealTimeOrderData>({
    orderUpdates: [],
    isConnected: false,
    lastUpdate: null
  })

  useEffect(() => {
    if (!user) return

    let orderChannel: any

    const setupSubscriptions = async () => {
      try {
        // Subscribe to order status changes
        orderChannel = supabase
          .channel('order-updates')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'orders',
              filter: `user_id=eq.${user.id}`
            },
            (payload) => {
              const oldStatus = payload.old?.status
              const newStatus = payload.new?.status

              // Only track actual status changes
              if (oldStatus !== newStatus) {
                const orderUpdate: OrderUpdate = {
                  orderId: payload.new.id,
                  oldStatus,
                  newStatus,
                  timestamp: new Date().toISOString(),
                  notes: payload.new.notes
                }

                setData(prev => ({
                  ...prev,
                  orderUpdates: [orderUpdate, ...prev.orderUpdates].slice(0, 50), // Keep last 50 updates
                  lastUpdate: orderUpdate.timestamp
                }))
              }
            }
          )
          .subscribe((status) => {
            setData(prev => ({
              ...prev,
              isConnected: status === 'SUBSCRIBED'
            }))
          })

      } catch (error) {
        console.error('Error setting up real-time order subscriptions:', error)
      }
    }

    setupSubscriptions()

    return () => {
      if (orderChannel) {
        supabase.removeChannel(orderChannel)
      }
    }
  }, [user])

  const clearOrderUpdates = () => {
    setData(prev => ({
      ...prev,
      orderUpdates: []
    }))
  }

  const getStatusMessage = (update: OrderUpdate) => {
    switch (update.newStatus) {
      case 'processing':
        return 'Your order is being processed'
      case 'shipped':
        return 'Your order has been shipped'
      case 'delivered':
        return 'Your order has been delivered'
      case 'cancelled':
        return 'Your order has been cancelled'
      default:
        return `Order status updated to ${update.newStatus}`
    }
  }

  const getStatusColor = (status: string) => {
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

  return {
    ...data,
    clearOrderUpdates,
    getStatusMessage,
    getStatusColor
  }
}

// Hook for monitoring specific orders
export function useOrderStatusMonitor(orderIds: string[]) {
  const [statusData, setStatusData] = useState<Record<string, Order['status']>>({})
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!orderIds.length) return

    const channel = supabase
      .channel('order-status-monitor')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=in.(${orderIds.join(',')})`
        },
        (payload) => {
          const orderId = payload.new.id
          const newStatus = payload.new.status

          setStatusData(prev => ({
            ...prev,
            [orderId]: newStatus
          }))
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderIds])

  const getStatusForOrder = (orderId: string) => {
    return statusData[orderId]
  }

  return {
    statusData,
    isConnected,
    getStatusForOrder
  }
}