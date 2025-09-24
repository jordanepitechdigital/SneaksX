import { useQueryClient } from '@tanstack/react-query'
import { productKeys } from './useProducts'
import { cartKeys } from './useCart'
import { orderKeys } from './useOrders'

/**
 * Comprehensive Cache Invalidation Strategies
 *
 * This hook provides intelligent cache invalidation strategies for different
 * user actions and system events to ensure data consistency and optimal UX.
 */

export function useCacheInvalidation() {
  const queryClient = useQueryClient()

  // Get session and user context
  const getSessionId = () => {
    if (typeof window === 'undefined') return 'ssr-session'
    return localStorage.getItem('cart_session_id') || 'no-session'
  }

  const getUserId = () => {
    // This would be replaced with actual user context
    return undefined // Will be replaced by useAuth hook in components
  }

  return {
    // PRODUCT-RELATED INVALIDATIONS

    // When product data changes (admin actions)
    invalidateProductData: (productId?: string) => {
      if (productId) {
        // Invalidate specific product
        queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) })
      }
      // Invalidate all product lists (might contain the updated product)
      queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.all })
    },

    // When product stock changes
    invalidateProductStock: (productId: string) => {
      queryClient.invalidateQueries({ queryKey: [...productKeys.detail(productId), 'stock'] })
      // Also invalidate cart validation as stock affects cart validity
      const sessionId = getSessionId()
      const userId = getUserId()
      queryClient.invalidateQueries({ queryKey: cartKeys.validation(sessionId, userId) })
    },

    // When featured products change
    invalidateFeaturedProducts: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'products' &&
          query.queryKey.includes('featured')
      })
    },

    // When search results might be stale
    invalidateSearchResults: (query?: string) => {
      if (query) {
        queryClient.invalidateQueries({
          predicate: (queryObj) =>
            queryObj.queryKey[0] === 'products' &&
            queryObj.queryKey.includes('search') &&
            queryObj.queryKey.includes(query)
        })
      } else {
        queryClient.invalidateQueries({
          predicate: (queryObj) =>
            queryObj.queryKey[0] === 'products' &&
            queryObj.queryKey.includes('search')
        })
      }
    },

    // CART-RELATED INVALIDATIONS

    // When cart changes (add, update, remove items)
    invalidateCartData: (userId?: string) => {
      const sessionId = getSessionId()
      queryClient.invalidateQueries({ queryKey: cartKeys.summary(sessionId, userId) })
      queryClient.invalidateQueries({ queryKey: cartKeys.validation(sessionId, userId) })
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
    },

    // When user logs in/out (transfer cart context)
    invalidateCartOnAuthChange: (newUserId?: string) => {
      const sessionId = getSessionId()

      // Invalidate all cart queries
      queryClient.invalidateQueries({ queryKey: cartKeys.all })

      // Remove old session-only queries
      queryClient.removeQueries({ queryKey: cartKeys.summary(sessionId, undefined) })

      // Refetch with new user context
      if (newUserId) {
        queryClient.prefetchQuery({
          queryKey: cartKeys.summary(sessionId, newUserId),
          queryFn: () =>
            import('@/services/api/ecommerce').then(({ ecommerceService }) =>
              ecommerceService.getCart(sessionId, newUserId)
            ),
        })
      }
    },

    // When checkout completes (clear cart)
    invalidateCartOnCheckout: (userId?: string) => {
      const sessionId = getSessionId()

      // Remove cart queries
      queryClient.removeQueries({ queryKey: cartKeys.all })

      // Set empty cart optimistically
      queryClient.setQueryData(cartKeys.summary(sessionId, userId), {
        items: [],
        totalItems: 0,
        subtotal: 0,
        estimatedShipping: 10,
        estimatedTax: 0,
        estimatedTotal: 10,
      })
    },

    // ORDER-RELATED INVALIDATIONS

    // When new order is created
    invalidateOrdersOnCreate: (userId: string, newOrder?: any) => {
      // Invalidate orders list and stats
      queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) })
      queryClient.invalidateQueries({ queryKey: orderKeys.stats(userId) })

      // Add new order to cache if provided
      if (newOrder) {
        queryClient.setQueryData(
          orderKeys.detail(newOrder.id, userId),
          newOrder
        )
      }
    },

    // When order status changes
    invalidateOrderStatus: (orderId: string, userId: string, newStatus?: string) => {
      // Update specific order in cache
      if (newStatus) {
        queryClient.setQueryData(
          orderKeys.detail(orderId, userId),
          (old: any) => old ? { ...old, status: newStatus } : undefined
        )
      }

      // Invalidate orders list and stats
      queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) })
      queryClient.invalidateQueries({ queryKey: orderKeys.stats(userId) })
    },

    // When payment status changes
    invalidateOrderPayment: (orderId: string, userId: string) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId, userId) })
      queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) })
      queryClient.invalidateQueries({ queryKey: orderKeys.stats(userId) })
    },

    // SYSTEM-WIDE INVALIDATIONS

    // When user logs out (clear all user-specific data)
    invalidateAllUserData: () => {
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            key.includes('orders') ||
            (key.includes('cart') && key.some(k => typeof k === 'string' && k.startsWith('user_')))
          )
        }
      })
    },

    // When app regains focus (refresh critical data)
    invalidateOnAppFocus: () => {
      const now = Date.now()

      // Only invalidate if data is older than 30 seconds
      queryClient.invalidateQueries({
        predicate: (query) => {
          const staleTime = query.state.dataUpdatedAt
          return (
            now - staleTime > 30 * 1000 && // 30 seconds
            (
              query.queryKey.includes('cart') ||
              (query.queryKey.includes('products') && query.queryKey.includes('stock')) ||
              query.queryKey.includes('validation')
            )
          )
        }
      })
    },

    // When network reconnects (refresh all data)
    invalidateOnNetworkReconnect: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.state.status === 'error' ||
          query.queryKey.includes('cart') ||
          query.queryKey.includes('validation')
      })
    },

    // BATCH INVALIDATIONS

    // Invalidate all product-related queries
    invalidateAllProducts: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all })
    },

    // Invalidate all cart-related queries
    invalidateAllCart: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
    },

    // Invalidate all order-related queries
    invalidateAllOrders: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all })
    },

    // Nuclear option: invalidate everything
    invalidateEverything: () => {
      queryClient.invalidateQueries()
    },

    // SELECTIVE CACHE CLEARING

    // Clear stale data (older than specified time)
    clearStaleData: (maxAge = 10 * 60 * 1000) => { // 10 minutes default
      const now = Date.now()
      queryClient.removeQueries({
        predicate: (query) => {
          const age = now - query.state.dataUpdatedAt
          return age > maxAge && !query.queryKey.includes('featured') // Keep featured products longer
        }
      })
    },

    // Clear error queries
    clearErrorQueries: () => {
      queryClient.removeQueries({
        predicate: (query) => query.state.status === 'error'
      })
    },

    // UTILITY FUNCTIONS

    // Get cache statistics
    getCacheStats: () => {
      const queries = queryClient.getQueryCache().getAll()

      const stats = {
        total: queries.length,
        byStatus: {
          success: queries.filter(q => q.state.status === 'success').length,
          error: queries.filter(q => q.state.status === 'error').length,
          pending: queries.filter(q => q.state.status === 'pending').length,
        },
        byType: {
          products: queries.filter(q => q.queryKey.includes('products')).length,
          cart: queries.filter(q => q.queryKey.includes('cart')).length,
          orders: queries.filter(q => q.queryKey.includes('orders')).length,
        },
        memory: {
          // Approximate memory usage (rough calculation)
          estimatedKB: Math.round(
            queries.reduce((acc, q) => acc + JSON.stringify(q.state.data || {}).length, 0) / 1024
          )
        }
      }

      return stats
    },

    // Check if specific data is stale
    isDataStale: (queryKey: any[], maxAge = 5 * 60 * 1000) => { // 5 minutes default
      const query = queryClient.getQueryCache().find({ queryKey })
      if (!query) return true

      const age = Date.now() - query.state.dataUpdatedAt
      return age > maxAge
    },
  }
}

// Hook for debugging cache state in development
export function useCacheDebug() {
  const queryClient = useQueryClient()
  const cache = useCacheInvalidation()

  if (process.env.NODE_ENV === 'development') {
    return {
      logCacheStats: () => console.table(cache.getCacheStats()),
      logAllQueries: () => console.log(queryClient.getQueryCache().getAll()),
      clearAllCache: () => queryClient.clear(),
      ...cache
    }
  }

  return cache
}