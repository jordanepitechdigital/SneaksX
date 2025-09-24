/**
 * Enhanced Real-time Hooks with React Query Integration
 * Combines existing real-time functionality with improved error handling,
 * automatic cache updates, and centralized notifications
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback, useRef } from 'react'
import { useRealtimeManager } from '@/services/realtime/subscription-manager'
import { useNotifications } from '@/services/realtime/notification-system'
import { useLoading } from '@/contexts/LoadingContext'
import { AppError, ErrorType, ErrorSeverity } from '@/services/api/error-types'
import { supabase } from '@/lib/supabase/client'

/**
 * Enhanced real-time stock monitoring with React Query integration
 */
export function useEnhancedRealTimeStock(
  productId: string,
  options: {
    enabled?: boolean
    onStockChange?: (productId: string, stockData: any) => void
    onPriceChange?: (productId: string, priceData: any) => void
    enableNotifications?: boolean
  } = {}
) {
  const { enabled = true, onStockChange, onPriceChange, enableNotifications = true } = options
  const queryClient = useQueryClient()
  const subscriptionManager = useRealtimeManager()
  const notifications = useNotifications()
  const { startLoading, stopLoading } = useLoading()
  const subscriptionRef = useRef<string | null>(null)

  // Query for initial stock data
  const stockQuery = useQuery({
    queryKey: ['stock', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('product_id, size, quantity, price, last_updated')
        .eq('product_id', productId)

      if (error) {
        throw new AppError(
          `Failed to fetch stock data: ${error.message}`,
          ErrorType.DATABASE_ERROR,
          ErrorSeverity.MEDIUM,
          undefined,
          'Unable to load product availability'
        )
      }

      return data || []
    },
    enabled: enabled && !!productId,
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchOnWindowFocus: true
  })

  // Set up real-time subscription
  useEffect(() => {
    if (!enabled || !productId || !stockQuery.data) {
      return
    }

    startLoading(`realtime-stock-${productId}`, 'Connecting to real-time updates...')

    const subscriptionId = subscriptionManager.subscribe({
      channel: `stock-${productId}`,
      table: 'inventory',
      event: '*',
      filter: `product_id=eq.${productId}`,
      onData: (payload) => {
        const { new: newRecord, old: oldRecord, eventType } = payload

        // Update React Query cache
        queryClient.setQueryData(['stock', productId], (old: any[] | undefined) => {
          if (!old) return [newRecord]

          switch (eventType) {
            case 'INSERT':
              return [...old, newRecord]
            case 'UPDATE':
              return old.map(item =>
                item.product_id === newRecord.product_id && item.size === newRecord.size
                  ? newRecord
                  : item
              )
            case 'DELETE':
              return old.filter(item =>
                !(item.product_id === oldRecord.product_id && item.size === oldRecord.size)
              )
            default:
              return old
          }
        })

        // Handle stock change notifications
        if (eventType === 'UPDATE' && enableNotifications) {
          const oldQuantity = oldRecord?.quantity || 0
          const newQuantity = newRecord?.quantity || 0
          const oldPrice = oldRecord?.price || 0
          const newPrice = newRecord?.price || 0

          // Stock quantity changes
          if (oldQuantity !== newQuantity) {
            notifications.notifyStockChange(
              productId,
              newRecord.product_name || `Product ${productId}`,
              newRecord.size,
              oldQuantity,
              newQuantity
            )
            onStockChange?.(productId, { old: oldRecord, new: newRecord })
          }

          // Price changes
          if (oldPrice !== newPrice && oldPrice > 0) {
            const changePercentage = ((newPrice - oldPrice) / oldPrice) * 100
            notifications.notifyPriceChange(
              productId,
              newRecord.product_name || `Product ${productId}`,
              oldPrice,
              newPrice,
              changePercentage
            )
            onPriceChange?.(productId, { old: oldRecord, new: newRecord, changePercentage })
          }
        }

        stopLoading(`realtime-stock-${productId}`)
      },
      onError: (error) => {
        console.error('Real-time stock subscription error:', error)
        stopLoading(`realtime-stock-${productId}`)

        if (enableNotifications) {
          notifications.notify({
            type: notifications.NotificationType.SYSTEM_ALERT,
            priority: notifications.NotificationPriority.MEDIUM,
            title: 'Real-time Updates Unavailable',
            message: 'Stock updates may not be real-time'
          })
        }
      },
      queryKeysToInvalidate: [['stock', productId]],
      retryAttempts: 3,
      retryDelay: 2000
    })

    subscriptionRef.current = subscriptionId
    stopLoading(`realtime-stock-${productId}`)

    return () => {
      if (subscriptionRef.current) {
        subscriptionManager.unsubscribe(subscriptionRef.current)
        subscriptionRef.current = null
      }
    }
  }, [enabled, productId, stockQuery.data, subscriptionManager, notifications, enableNotifications, onStockChange, onPriceChange, queryClient, startLoading, stopLoading])

  const getStockForSize = useCallback((size: string) => {
    return stockQuery.data?.find(item => item.size === size)?.quantity || 0
  }, [stockQuery.data])

  const getPriceForSize = useCallback((size: string) => {
    return stockQuery.data?.find(item => item.size === size)?.price || 0
  }, [stockQuery.data])

  const isAvailable = useCallback((size: string) => {
    return getStockForSize(size) > 0
  }, [getStockForSize])

  const getAvailableSizes = useCallback(() => {
    return stockQuery.data?.filter(item => item.quantity > 0).map(item => item.size) || []
  }, [stockQuery.data])

  return {
    ...stockQuery,
    stockData: stockQuery.data || [],
    getStockForSize,
    getPriceForSize,
    isAvailable,
    getAvailableSizes,
    isConnected: subscriptionRef.current !== null,
    subscriptionId: subscriptionRef.current
  }
}

/**
 * Enhanced real-time order monitoring with React Query integration
 */
export function useEnhancedRealTimeOrders(
  userId: string,
  options: {
    enabled?: boolean
    onOrderUpdate?: (orderId: string, orderData: any) => void
    enableNotifications?: boolean
  } = {}
) {
  const { enabled = true, onOrderUpdate, enableNotifications = true } = options
  const queryClient = useQueryClient()
  const subscriptionManager = useRealtimeManager()
  const notifications = useNotifications()
  const { startLoading, stopLoading } = useLoading()
  const subscriptionRef = useRef<string | null>(null)

  // Query for initial orders data
  const ordersQuery = useQuery({
    queryKey: ['orders', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            products (*)
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new AppError(
          `Failed to fetch orders: ${error.message}`,
          ErrorType.DATABASE_ERROR,
          ErrorSeverity.MEDIUM,
          undefined,
          'Unable to load your orders'
        )
      }

      return data || []
    },
    enabled: enabled && !!userId,
    staleTime: 60000, // Consider data stale after 1 minute
    refetchOnWindowFocus: true
  })

  // Set up real-time subscription
  useEffect(() => {
    if (!enabled || !userId) {
      return
    }

    startLoading(`realtime-orders-${userId}`, 'Connecting to order updates...')

    const subscriptionId = subscriptionManager.subscribe({
      channel: `orders-${userId}`,
      table: 'orders',
      event: '*',
      filter: `user_id=eq.${userId}`,
      onData: (payload) => {
        const { new: newRecord, old: oldRecord, eventType } = payload

        // Update React Query cache
        queryClient.setQueryData(['orders', userId], (old: any[] | undefined) => {
          if (!old) return [newRecord]

          switch (eventType) {
            case 'INSERT':
              return [newRecord, ...old]
            case 'UPDATE':
              return old.map(order =>
                order.id === newRecord.id ? { ...order, ...newRecord } : order
              )
            case 'DELETE':
              return old.filter(order => order.id !== oldRecord.id)
            default:
              return old
          }
        })

        // Handle order status change notifications
        if (eventType === 'UPDATE' && enableNotifications) {
          const oldStatus = oldRecord?.status
          const newStatus = newRecord?.status

          if (oldStatus !== newStatus && oldStatus && newStatus) {
            notifications.notifyOrderStatus(newRecord.id, oldStatus, newStatus)
            onOrderUpdate?.(newRecord.id, { old: oldRecord, new: newRecord })
          }
        }

        stopLoading(`realtime-orders-${userId}`)
      },
      onError: (error) => {
        console.error('Real-time orders subscription error:', error)
        stopLoading(`realtime-orders-${userId}`)

        if (enableNotifications) {
          notifications.notify({
            type: notifications.NotificationType.SYSTEM_ALERT,
            priority: notifications.NotificationPriority.MEDIUM,
            title: 'Order Updates Unavailable',
            message: 'Order status updates may not be real-time'
          })
        }
      },
      queryKeysToInvalidate: [['orders', userId]],
      retryAttempts: 3,
      retryDelay: 2000
    })

    subscriptionRef.current = subscriptionId
    stopLoading(`realtime-orders-${userId}`)

    return () => {
      if (subscriptionRef.current) {
        subscriptionManager.unsubscribe(subscriptionRef.current)
        subscriptionRef.current = null
      }
    }
  }, [enabled, userId, subscriptionManager, notifications, enableNotifications, onOrderUpdate, queryClient, startLoading, stopLoading])

  const getOrderById = useCallback((orderId: string) => {
    return ordersQuery.data?.find(order => order.id === orderId)
  }, [ordersQuery.data])

  const getOrdersByStatus = useCallback((status: string) => {
    return ordersQuery.data?.filter(order => order.status === status) || []
  }, [ordersQuery.data])

  const getPendingOrders = useCallback(() => {
    return getOrdersByStatus('pending')
  }, [getOrdersByStatus])

  const getActiveOrders = useCallback(() => {
    return ordersQuery.data?.filter(order =>
      ['pending', 'processing', 'shipped'].includes(order.status)
    ) || []
  }, [ordersQuery.data])

  return {
    ...ordersQuery,
    orders: ordersQuery.data || [],
    getOrderById,
    getOrdersByStatus,
    getPendingOrders,
    getActiveOrders,
    isConnected: subscriptionRef.current !== null,
    subscriptionId: subscriptionRef.current
  }
}

/**
 * Enhanced real-time cart synchronization
 */
export function useEnhancedRealTimeCart(
  userId: string,
  options: {
    enabled?: boolean
    onCartChange?: (cartData: any) => void
    enableNotifications?: boolean
  } = {}
) {
  const { enabled = true, onCartChange, enableNotifications = true } = options
  const queryClient = useQueryClient()
  const subscriptionManager = useRealtimeManager()
  const notifications = useNotifications()
  const subscriptionRef = useRef<string | null>(null)

  // Set up real-time cart subscription
  useEffect(() => {
    if (!enabled || !userId) {
      return
    }

    const subscriptionId = subscriptionManager.subscribe({
      channel: `cart-${userId}`,
      table: 'cart_items',
      event: '*',
      filter: `user_id=eq.${userId}`,
      onData: (payload) => {
        const { new: newRecord, old: oldRecord, eventType } = payload

        // Invalidate cart queries to refetch
        queryClient.invalidateQueries({ queryKey: ['cart', userId] })

        // Handle cart change notifications
        if (eventType === 'DELETE' && enableNotifications && oldRecord) {
          // Check if item became unavailable
          notifications.notifyCartItemUnavailable(
            oldRecord.product_id,
            oldRecord.product_name || `Product ${oldRecord.product_id}`,
            oldRecord.size
          )
        }

        onCartChange?.({ old: oldRecord, new: newRecord, eventType })
      },
      onError: (error) => {
        console.error('Real-time cart subscription error:', error)

        if (enableNotifications) {
          notifications.notify({
            type: notifications.NotificationType.SYSTEM_ALERT,
            priority: notifications.NotificationPriority.LOW,
            title: 'Cart Sync Unavailable',
            message: 'Cart updates may not sync in real-time'
          })
        }
      },
      queryKeysToInvalidate: [['cart', userId]],
      retryAttempts: 2,
      retryDelay: 1000
    })

    subscriptionRef.current = subscriptionId

    return () => {
      if (subscriptionRef.current) {
        subscriptionManager.unsubscribe(subscriptionRef.current)
        subscriptionRef.current = null
      }
    }
  }, [enabled, userId, subscriptionManager, notifications, enableNotifications, onCartChange, queryClient])

  return {
    isConnected: subscriptionRef.current !== null,
    subscriptionId: subscriptionRef.current
  }
}

/**
 * Real-time connection health monitor
 */
export function useRealTimeHealth() {
  const subscriptionManager = useRealtimeManager()
  const notifications = useNotifications()

  const getConnectionHealth = useCallback(() => {
    return {
      isConnected: subscriptionManager.isAnyConnected(),
      healthScore: subscriptionManager.getHealthScore(),
      statuses: subscriptionManager.getAllStatuses()
    }
  }, [subscriptionManager])

  const reconnectAll = useCallback(() => {
    subscriptionManager.reconnectAll()

    notifications.notify({
      type: notifications.NotificationType.SYSTEM_ALERT,
      priority: notifications.NotificationPriority.LOW,
      title: 'Reconnecting...',
      message: 'Attempting to restore real-time connections'
    })
  }, [subscriptionManager, notifications])

  return {
    ...getConnectionHealth(),
    reconnectAll,
    getConnectionHealth
  }
}