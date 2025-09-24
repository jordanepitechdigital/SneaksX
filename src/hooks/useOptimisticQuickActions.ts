/**
 * Optimistic Quick Actions Hook
 * Provides instant feedback for common user actions like ratings, likes, quick buy, etc.
 */

import { useCallback } from 'react'
import { useAdvancedOptimistic, useOptimisticToggle, optimisticPatterns } from './useAdvancedOptimisticUpdates'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { AppError, ErrorType, ErrorSeverity } from '@/services/api/error-types'

// Types for quick actions
export interface ProductRating {
  id: string
  userId: string
  productId: string
  rating: number // 1-5 stars
  review?: string
  createdAt: string
  updatedAt: string
}

export interface ProductStats {
  productId: string
  averageRating: number
  totalRatings: number
  totalReviews: number
  ratingDistribution: {
    1: number
    2: number
    3: number
    4: number
    5: number
  }
  userRating?: number
  isLiked?: boolean
  likeCount: number
  viewCount: number
  lastUpdated: string
}

export interface QuickBuyConfig {
  productId: string
  size: string
  quantity: number
  skipCart?: boolean
}

// Quick actions service
const quickActionsService = {
  async rateProduct(userId: string, productId: string, rating: number, review?: string): Promise<ProductRating> {
    const { data, error } = await supabase
      .from('product_ratings')
      .upsert({
        user_id: userId,
        product_id: productId,
        rating,
        review,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,product_id' })
      .select()
      .single()

    if (error) {
      throw new AppError(
        `Failed to rate product: ${error.message}`,
        ErrorType.DATABASE_ERROR,
        ErrorSeverity.MEDIUM,
        undefined,
        'Unable to submit rating'
      )
    }

    return {
      id: data.id,
      userId: data.user_id,
      productId: data.product_id,
      rating: data.rating,
      review: data.review,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  },

  async likeProduct(userId: string, productId: string): Promise<void> {
    const { error } = await supabase
      .from('product_likes')
      .insert({
        user_id: userId,
        product_id: productId,
        created_at: new Date().toISOString()
      })

    if (error && !error.message.includes('duplicate')) {
      throw new AppError(
        `Failed to like product: ${error.message}`,
        ErrorType.DATABASE_ERROR,
        ErrorSeverity.LOW,
        undefined,
        'Unable to like product'
      )
    }
  },

  async unlikeProduct(userId: string, productId: string): Promise<void> {
    const { error } = await supabase
      .from('product_likes')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId)

    if (error) {
      throw new AppError(
        `Failed to unlike product: ${error.message}`,
        ErrorType.DATABASE_ERROR,
        ErrorSeverity.LOW,
        undefined,
        'Unable to unlike product'
      )
    }
  },

  async incrementView(productId: string): Promise<void> {
    const { error } = await supabase.rpc('increment_product_views', {
      p_product_id: productId
    })

    if (error) {
      console.warn('Failed to increment product view:', error)
      // Don't throw - view tracking is not critical
    }
  },

  async getProductStats(productId: string, userId?: string): Promise<ProductStats> {
    const [statsQuery, userRatingQuery, userLikeQuery] = await Promise.all([
      // Get general stats
      supabase
        .from('product_stats_view')
        .select('*')
        .eq('product_id', productId)
        .single(),

      // Get user's rating if logged in
      userId ? supabase
        .from('product_ratings')
        .select('rating')
        .eq('product_id', productId)
        .eq('user_id', userId)
        .single() : Promise.resolve({ data: null }),

      // Get user's like status if logged in
      userId ? supabase
        .from('product_likes')
        .select('id')
        .eq('product_id', productId)
        .eq('user_id', userId)
        .single() : Promise.resolve({ data: null })
    ])

    const stats = statsQuery.data
    if (statsQuery.error || !stats) {
      throw new AppError(
        `Failed to fetch product stats: ${statsQuery.error?.message}`,
        ErrorType.DATABASE_ERROR,
        ErrorSeverity.MEDIUM,
        undefined,
        'Unable to load product information'
      )
    }

    return {
      productId,
      averageRating: stats.average_rating || 0,
      totalRatings: stats.total_ratings || 0,
      totalReviews: stats.total_reviews || 0,
      ratingDistribution: stats.rating_distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      userRating: userRatingQuery.data?.rating,
      isLiked: !!userLikeQuery.data,
      likeCount: stats.like_count || 0,
      viewCount: stats.view_count || 0,
      lastUpdated: new Date().toISOString()
    }
  },

  async quickBuy(config: QuickBuyConfig): Promise<{ orderId: string; redirectUrl?: string }> {
    // This would integrate with the existing cart/order system
    // For now, simulate the API call
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.8) { // 20% failure rate for testing
          reject(new AppError(
            'Quick buy failed - insufficient inventory',
            ErrorType.BUSINESS_LOGIC_ERROR,
            ErrorSeverity.HIGH,
            undefined,
            'This item is no longer available'
          ))
        } else {
          resolve({
            orderId: `order-${Date.now()}`,
            redirectUrl: '/orders/confirmation'
          })
        }
      }, 1000)
    })
  }
}

// Query keys
export const quickActionKeys = {
  productStats: (productId: string, userId?: string) => ['product-stats', productId, userId] as const,
  userRating: (productId: string, userId: string) => ['user-rating', productId, userId] as const,
  userLike: (productId: string, userId: string) => ['user-like', productId, userId] as const,
}

/**
 * Optimistic product rating hook
 */
export function useOptimisticProductRating(productId: string) {
  const { user } = useAuth()

  return useAdvancedOptimistic({
    queryKey: quickActionKeys.productStats(productId, user?.id),
    mutationFn: async ({ rating, review }: { rating: number; review?: string }) => {
      if (!user?.id) {
        throw new AppError(
          'Authentication required',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          undefined,
          'Please sign in to rate products'
        )
      }
      return quickActionsService.rateProduct(user.id, productId, rating, review)
    },
    updateFn: (currentStats: ProductStats | undefined, { rating }) => {
      if (!currentStats) return undefined

      const hadPreviousRating = currentStats.userRating !== undefined
      const previousRating = currentStats.userRating || 0

      // Calculate new average and total
      let newTotalRatings = currentStats.totalRatings
      let newTotal = currentStats.averageRating * currentStats.totalRatings

      if (hadPreviousRating) {
        // Replace existing rating
        newTotal = newTotal - previousRating + rating
      } else {
        // Add new rating
        newTotalRatings++
        newTotal = newTotal + rating
      }

      const newAverageRating = newTotalRatings > 0 ? newTotal / newTotalRatings : 0

      // Update rating distribution
      const newDistribution = { ...currentStats.ratingDistribution }
      if (hadPreviousRating) {
        newDistribution[previousRating as keyof typeof newDistribution]--
      }
      newDistribution[rating as keyof typeof newDistribution]++

      return {
        ...currentStats,
        averageRating: newAverageRating,
        totalRatings: newTotalRatings,
        userRating: rating,
        ratingDistribution: newDistribution,
        lastUpdated: new Date().toISOString()
      }
    },
    loadingMessage: 'Submitting rating...',
    enableTransitions: true,
    onError: (error) => {
      console.error('Failed to submit rating:', error)
    }
  })
}

/**
 * Optimistic product like/unlike toggle
 */
export function useOptimisticProductLike(productId: string) {
  const { user } = useAuth()

  return useOptimisticToggle(
    quickActionKeys.productStats(productId, user?.id),
    {
      toggleFn: async (currentlyLiked: boolean) => {
        if (!user?.id) {
          throw new AppError(
            'Authentication required',
            ErrorType.UNAUTHORIZED,
            ErrorSeverity.HIGH,
            undefined,
            'Please sign in to like products'
          )
        }

        if (currentlyLiked) {
          await quickActionsService.unlikeProduct(user.id, productId)
        } else {
          await quickActionsService.likeProduct(user.id, productId)
        }

        return !currentlyLiked
      },
      getToggleState: (stats: ProductStats) => stats?.isLiked || false,
      updateToggleState: (stats: ProductStats, newState: boolean) => ({
        ...stats,
        isLiked: newState,
        likeCount: stats.likeCount + (newState ? 1 : -1),
        lastUpdated: new Date().toISOString()
      }),
      loadingMessage: 'Updating...'
    }
  )
}

/**
 * Optimistic view count increment
 */
export function useOptimisticViewIncrement(productId: string) {
  const viewCountPattern = optimisticPatterns.counter(
    quickActionKeys.productStats(productId),
    async (delta: number) => {
      await quickActionsService.incrementView(productId)
      return delta
    }
  )

  const incrementView = useCallback(() => {
    return viewCountPattern.mutateAsync(1)
  }, [viewCountPattern])

  return {
    incrementView,
    isPending: viewCountPattern.isPending
  }
}

/**
 * Optimistic quick buy action
 */
export function useOptimisticQuickBuy() {
  const { user } = useAuth()

  return useAdvancedOptimistic({
    queryKey: ['quick-buy-status'],
    mutationFn: async (config: QuickBuyConfig) => {
      if (!user?.id) {
        throw new AppError(
          'Authentication required',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          undefined,
          'Please sign in to make purchases'
        )
      }
      return quickActionsService.quickBuy(config)
    },
    updateFn: (currentStatus: any, config: QuickBuyConfig) => ({
      ...currentStatus,
      isProcessing: true,
      lastAttempt: {
        productId: config.productId,
        size: config.size,
        quantity: config.quantity,
        timestamp: new Date().toISOString()
      }
    }),
    rollbackFn: (currentStatus: any) => ({
      ...currentStatus,
      isProcessing: false,
      error: 'Purchase failed'
    }),
    loadingMessage: 'Processing quick buy...',
    retryAttempts: 1, // Don't auto-retry purchases
    onSuccess: (result) => {
      // Redirect to confirmation or order page
      if (result.redirectUrl && typeof window !== 'undefined') {
        window.location.href = result.redirectUrl
      }
    },
    onError: (error) => {
      console.error('Quick buy failed:', error)
    }
  })
}

/**
 * Combined quick actions hook
 */
export function useQuickActions(productId: string) {
  const ratingMutation = useOptimisticProductRating(productId)
  const likeMutation = useOptimisticProductLike(productId)
  const viewIncrement = useOptimisticViewIncrement(productId)
  const quickBuyMutation = useOptimisticQuickBuy()

  const rate = useCallback(async (rating: number, review?: string) => {
    return ratingMutation.mutateAsync({ rating, review })
  }, [ratingMutation])

  const toggleLike = useCallback(async () => {
    return likeMutation.mutateAsync()
  }, [likeMutation])

  const quickBuy = useCallback(async (config: Omit<QuickBuyConfig, 'productId'>) => {
    return quickBuyMutation.mutateAsync({ ...config, productId })
  }, [quickBuyMutation, productId])

  const incrementView = viewIncrement.incrementView

  return {
    // Actions
    rate,
    toggleLike,
    quickBuy,
    incrementView,

    // States
    isRating: ratingMutation.isPending,
    isToggling: likeMutation.isPending,
    isQuickBuying: quickBuyMutation.isPending,
    isIncrementingView: viewIncrement.isPending,

    // Any action pending
    isPending: ratingMutation.isPending || likeMutation.isPending ||
               quickBuyMutation.isPending || viewIncrement.isPending,

    // Individual mutations for advanced usage
    ratingMutation,
    likeMutation,
    quickBuyMutation
  }
}

/**
 * Bulk actions for multiple products
 */
export function useBulkQuickActions() {
  const { user } = useAuth()

  const bulkLike = useAdvancedOptimistic({
    queryKey: ['bulk-actions', 'like'],
    mutationFn: async (productIds: string[]) => {
      if (!user?.id) {
        throw new AppError(
          'Authentication required',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          undefined,
          'Please sign in to like products'
        )
      }

      const promises = productIds.map(productId =>
        quickActionsService.likeProduct(user.id!, productId)
      )
      await Promise.all(promises)
      return productIds
    },
    updateFn: (currentState: any, productIds: string[]) => ({
      ...currentState,
      likedProducts: [...(currentState.likedProducts || []), ...productIds],
      lastAction: {
        type: 'bulk_like',
        productIds,
        timestamp: new Date().toISOString()
      }
    }),
    loadingMessage: `Liking ${0} products...`,
    enableTransitions: true
  })

  const bulkAddToWishlist = useAdvancedOptimistic({
    queryKey: ['bulk-actions', 'wishlist'],
    mutationFn: async (productIds: string[]) => {
      if (!user?.id) {
        throw new AppError(
          'Authentication required',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          undefined,
          'Please sign in to manage wishlist'
        )
      }

      // This would integrate with the wishlist service
      return productIds
    },
    updateFn: (currentState: any, productIds: string[]) => ({
      ...currentState,
      wishlistProducts: [...(currentState.wishlistProducts || []), ...productIds],
      lastAction: {
        type: 'bulk_wishlist',
        productIds,
        timestamp: new Date().toISOString()
      }
    }),
    loadingMessage: `Adding ${0} products to wishlist...`,
    enableTransitions: true
  })

  return {
    bulkLike: (productIds: string[]) => bulkLike.mutateAsync(productIds),
    bulkAddToWishlist: (productIds: string[]) => bulkAddToWishlist.mutateAsync(productIds),
    isBulkLiking: bulkLike.isPending,
    isBulkAddingToWishlist: bulkAddToWishlist.isPending,
    isPending: bulkLike.isPending || bulkAddToWishlist.isPending
  }
}