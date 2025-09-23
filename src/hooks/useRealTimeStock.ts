'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export interface StockUpdate {
  productId: string
  size: string
  quantity: number
  reservedQuantity: number
  availableQuantity: number
  timestamp: string
}

export interface PriceUpdate {
  productId: string
  oldPrice: number
  newPrice: number
  changePercentage: number
  timestamp: string
}

export interface RealTimeStockData {
  stockUpdates: StockUpdate[]
  priceUpdates: PriceUpdate[]
  lowStockAlerts: Array<{ productId: string; productName: string; size: string; availableQuantity: number }>
  isConnected: boolean
  lastUpdate: string | null
}

export function useRealTimeStock() {
  const { user } = useAuth()
  const [data, setData] = useState<RealTimeStockData>({
    stockUpdates: [],
    priceUpdates: [],
    lowStockAlerts: [],
    isConnected: false,
    lastUpdate: null
  })

  useEffect(() => {
    if (!user) return

    let stockChannel: any
    let priceChannel: any

    const setupSubscriptions = async () => {
      try {
        // Subscribe to stock changes
        stockChannel = supabase
          .channel('stock-updates')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'product_stock'
            },
            (payload) => {
              const stockUpdate: StockUpdate = {
                productId: payload.new.product_id,
                size: payload.new.size,
                quantity: payload.new.quantity,
                reservedQuantity: payload.new.reserved_quantity,
                availableQuantity: payload.new.available_quantity,
                timestamp: new Date().toISOString()
              }

              setData(prev => ({
                ...prev,
                stockUpdates: [stockUpdate, ...prev.stockUpdates].slice(0, 50), // Keep last 50 updates
                lastUpdate: stockUpdate.timestamp
              }))

              // Check for low stock alert
              if (stockUpdate.availableQuantity <= 5 && stockUpdate.availableQuantity > 0) {
                // Fetch product name for alert
                fetchProductForAlert(stockUpdate.productId, stockUpdate.size, stockUpdate.availableQuantity)
              }
            }
          )
          .subscribe((status) => {
            setData(prev => ({
              ...prev,
              isConnected: status === 'SUBSCRIBED'
            }))
          })

        // Subscribe to price changes
        priceChannel = supabase
          .channel('price-updates')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'products',
              filter: 'current_price=neq.null'
            },
            (payload) => {
              const oldPrice = payload.old?.current_price || 0
              const newPrice = payload.new?.current_price || 0

              if (oldPrice !== newPrice && oldPrice > 0) {
                const changePercentage = ((newPrice - oldPrice) / oldPrice) * 100

                const priceUpdate: PriceUpdate = {
                  productId: payload.new.id,
                  oldPrice,
                  newPrice,
                  changePercentage,
                  timestamp: new Date().toISOString()
                }

                setData(prev => ({
                  ...prev,
                  priceUpdates: [priceUpdate, ...prev.priceUpdates].slice(0, 50), // Keep last 50 updates
                  lastUpdate: priceUpdate.timestamp
                }))
              }
            }
          )
          .subscribe()

      } catch (error) {
        console.error('Error setting up real-time subscriptions:', error)
      }
    }

    setupSubscriptions()

    return () => {
      if (stockChannel) {
        supabase.removeChannel(stockChannel)
      }
      if (priceChannel) {
        supabase.removeChannel(priceChannel)
      }
    }
  }, [user])

  const fetchProductForAlert = async (productId: string, size: string, availableQuantity: number) => {
    try {
      const { data: product } = await supabase
        .from('products')
        .select('name')
        .eq('id', productId)
        .single()

      if (product) {
        const alert = {
          productId,
          productName: product.name,
          size,
          availableQuantity
        }

        setData(prev => ({
          ...prev,
          lowStockAlerts: [alert, ...prev.lowStockAlerts.filter(
            a => !(a.productId === productId && a.size === size)
          )].slice(0, 20) // Keep last 20 alerts
        }))
      }
    } catch (error) {
      console.error('Error fetching product for alert:', error)
    }
  }

  const clearStockUpdates = () => {
    setData(prev => ({
      ...prev,
      stockUpdates: []
    }))
  }

  const clearPriceUpdates = () => {
    setData(prev => ({
      ...prev,
      priceUpdates: []
    }))
  }

  const dismissAlert = (productId: string, size: string) => {
    setData(prev => ({
      ...prev,
      lowStockAlerts: prev.lowStockAlerts.filter(
        alert => !(alert.productId === productId && alert.size === size)
      )
    }))
  }

  return {
    ...data,
    clearStockUpdates,
    clearPriceUpdates,
    dismissAlert
  }
}

// Hook for monitoring specific products
export function useProductStockMonitor(productIds: string[]) {
  const [stockData, setStockData] = useState<Record<string, Record<string, StockUpdate>>>({})
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!productIds.length) return

    const channel = supabase
      .channel('product-stock-monitor')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'product_stock',
          filter: `product_id=in.(${productIds.join(',')})`
        },
        (payload) => {
          const update: StockUpdate = {
            productId: payload.new.product_id,
            size: payload.new.size,
            quantity: payload.new.quantity,
            reservedQuantity: payload.new.reserved_quantity,
            availableQuantity: payload.new.available_quantity,
            timestamp: new Date().toISOString()
          }

          setStockData(prev => ({
            ...prev,
            [update.productId]: {
              ...prev[update.productId],
              [update.size]: update
            }
          }))
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [productIds])

  const getStockForProduct = (productId: string, size?: string) => {
    if (size) {
      return stockData[productId]?.[size]
    }
    return stockData[productId] || {}
  }

  return {
    stockData,
    isConnected,
    getStockForProduct
  }
}

// Hook for cart-specific stock monitoring
export function useCartStockMonitor(cartItems: Array<{ productId: string; size: string; quantity: number }>) {
  const { stockData, isConnected } = useProductStockMonitor(
    cartItems.map(item => item.productId)
  )

  const getCartItemAvailability = () => {
    return cartItems.map(item => {
      const stock = stockData[item.productId]?.[item.size]
      return {
        ...item,
        availableQuantity: stock?.availableQuantity || 0,
        isAvailable: (stock?.availableQuantity || 0) >= item.quantity,
        lastUpdated: stock?.timestamp
      }
    })
  }

  const hasUnavailableItems = () => {
    return getCartItemAvailability().some(item => !item.isAvailable)
  }

  const getUnavailableItems = () => {
    return getCartItemAvailability().filter(item => !item.isAvailable)
  }

  return {
    isConnected,
    getCartItemAvailability,
    hasUnavailableItems,
    getUnavailableItems
  }
}