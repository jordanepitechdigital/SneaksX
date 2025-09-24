/**
 * Optimistic Wishlist/Favorites Hook with React Query Integration
 * Combines local context updates with server synchronization for seamless UX
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useTransition } from 'react'
import { useUserPreferences } from '@/contexts/UserPreferencesContext'
import { useAuth } from '@/contexts/AuthContext'
import { useLoading } from '@/contexts/LoadingContext'
import { supabase } from '@/lib/supabase/client'
import { AppError, ErrorType, ErrorSeverity } from '@/services/api/error-types'

// Types for wishlist operations
export interface WishlistItem {
  id: string
  userId: string
  productId: string
  productName?: string
  productBrand?: string
  productImageUrl?: string
  productPrice?: number
  addedAt: string
  updatedAt: string
}

export interface WishlistSyncData {
  items: WishlistItem[]
  lastSynced: string
  totalItems: number
}

// Query Keys Factory
export const wishlistKeys = {
  all: ['wishlist'] as const,
  lists: () => [...wishlistKeys.all, 'lists'] as const,
  list: (userId: string) => [...wishlistKeys.lists(), userId] as const,
  items: (userId: string) => [...wishlistKeys.all, 'items', userId] as const,
  item: (userId: string, productId: string) => [...wishlistKeys.items(userId), productId] as const,
}

// Server-side wishlist operations
const wishlistService = {
  async getWishlist(userId: string): Promise<WishlistSyncData> {
    const { data, error } = await supabase
      .from('user_wishlists')
      .select('*')
      .eq('user_id', userId)
      .order('added_at', { ascending: false })

    if (error) {
      throw new AppError(
        `Failed to fetch wishlist: ${error.message}`,
        ErrorType.DATABASE_ERROR,
        ErrorSeverity.MEDIUM,
        undefined,
        'Unable to load your favorites'
      )
    }

    return {
      items: data?.map(item => ({
        id: item.id,
        userId: item.user_id,
        productId: item.product_id,
        productName: item.product_name,
        productBrand: item.product_brand,
        productImageUrl: item.product_image_url,
        productPrice: item.product_price,
        addedAt: item.added_at,
        updatedAt: item.updated_at
      })) || [],
      lastSynced: new Date().toISOString(),
      totalItems: data?.length || 0
    }
  },

  async addToWishlist(userId: string, productId: string, productData?: Partial<WishlistItem>): Promise<WishlistItem> {
    const { data, error } = await supabase
      .from('user_wishlists')
      .insert({
        user_id: userId,
        product_id: productId,
        product_name: productData?.productName,
        product_brand: productData?.productBrand,
        product_image_url: productData?.productImageUrl,
        product_price: productData?.productPrice,
        added_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      throw new AppError(
        `Failed to add to wishlist: ${error.message}`,
        ErrorType.DATABASE_ERROR,
        ErrorSeverity.MEDIUM,
        undefined,
        'Unable to add to favorites'
      )
    }

    return {
      id: data.id,
      userId: data.user_id,
      productId: data.product_id,
      productName: data.product_name,
      productBrand: data.product_brand,
      productImageUrl: data.product_image_url,
      productPrice: data.product_price,
      addedAt: data.added_at,
      updatedAt: data.updated_at
    }
  },

  async removeFromWishlist(userId: string, productId: string): Promise<void> {
    const { error } = await supabase
      .from('user_wishlists')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId)

    if (error) {
      throw new AppError(
        `Failed to remove from wishlist: ${error.message}`,
        ErrorType.DATABASE_ERROR,
        ErrorSeverity.MEDIUM,
        undefined,
        'Unable to remove from favorites'
      )
    }
  },

  async syncWishlist(userId: string, localWishlist: string[]): Promise<WishlistSyncData> {
    // Get server wishlist
    const serverWishlist = await this.getWishlist(userId)
    const serverProductIds = serverWishlist.items.map(item => item.productId)

    // Find items to add (in local but not on server)
    const itemsToAdd = localWishlist.filter(productId => !serverProductIds.includes(productId))

    // Find items to remove (on server but not in local)
    const itemsToRemove = serverProductIds.filter(productId => !localWishlist.includes(productId))

    // Perform sync operations
    const addPromises = itemsToAdd.map(productId => this.addToWishlist(userId, productId))
    const removePromises = itemsToRemove.map(productId => this.removeFromWishlist(userId, productId))

    await Promise.all([...addPromises, ...removePromises])

    // Return updated wishlist
    return this.getWishlist(userId)
  }
}

/**
 * Server-synced wishlist query
 */
export function useWishlistQuery() {
  const { user } = useAuth()

  return useQuery({
    queryKey: wishlistKeys.list(user?.id || 'anonymous'),
    queryFn: () => user?.id ? wishlistService.getWishlist(user.id) : Promise.resolve({
      items: [],
      lastSynced: new Date().toISOString(),
      totalItems: 0
    }),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })
}

/**
 * Optimistic add to wishlist mutation
 */
export function useOptimisticAddToWishlist() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { addToWishlist: addToLocalWishlist } = useUserPreferences()
  const { startLoading, stopLoading } = useLoading()
  const [isPending, startTransition] = useTransition()

  return useMutation({
    mutationFn: async ({
      productId,
      productData
    }: {
      productId: string
      productData?: Partial<WishlistItem>
    }) => {
      if (!user?.id) {
        throw new AppError(
          'User not authenticated',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          undefined,
          'Please sign in to add favorites'
        )
      }
      return wishlistService.addToWishlist(user.id, productId, productData)
    },
    onMutate: async ({ productId, productData }) => {
      const loadingKey = `wishlist-add-${productId}`
      startLoading(loadingKey, 'Adding to favorites...')

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: wishlistKeys.list(user?.id || 'anonymous') })

      // Snapshot previous server state
      const previousServerWishlist = queryClient.getQueryData<WishlistSyncData>(
        wishlistKeys.list(user?.id || 'anonymous')
      )

      // Optimistically update local context immediately (visible instantly)
      startTransition(() => {
        addToLocalWishlist(productId)
      })

      // Optimistically update server cache
      if (user?.id && previousServerWishlist) {
        const optimisticItem: WishlistItem = {
          id: `temp-${productId}-${Date.now()}`,
          userId: user.id,
          productId,
          productName: productData?.productName || 'Loading...',
          productBrand: productData?.productBrand,
          productImageUrl: productData?.productImageUrl,
          productPrice: productData?.productPrice,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        const optimisticWishlist: WishlistSyncData = {
          ...previousServerWishlist,
          items: [optimisticItem, ...previousServerWishlist.items],
          totalItems: previousServerWishlist.totalItems + 1,
          lastSynced: new Date().toISOString()
        }

        queryClient.setQueryData(wishlistKeys.list(user.id), optimisticWishlist)
      }

      stopLoading(loadingKey)
      return { previousServerWishlist, productId }
    },
    onError: (error, { productId }, context) => {
      console.error('Failed to add to wishlist:', error)

      // Rollback local context update
      const { removeFromWishlist: removeFromLocalWishlist } = useUserPreferences()
      startTransition(() => {
        removeFromLocalWishlist(productId)
      })

      // Rollback server cache
      if (context?.previousServerWishlist && user?.id) {
        queryClient.setQueryData(
          wishlistKeys.list(user.id),
          context.previousServerWishlist
        )
      }

      stopLoading(`wishlist-add-${productId}`)
    },
    onSuccess: (newItem, { productId }) => {
      // Invalidate and refetch to get accurate server state
      queryClient.invalidateQueries({ queryKey: wishlistKeys.list(user?.id || 'anonymous') })
      stopLoading(`wishlist-add-${productId}`)
    },
    onSettled: ({ productId }) => {
      stopLoading(`wishlist-add-${productId}`)
      queryClient.invalidateQueries({ queryKey: wishlistKeys.list(user?.id || 'anonymous') })
    }
  })
}

/**
 * Optimistic remove from wishlist mutation
 */
export function useOptimisticRemoveFromWishlist() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { removeFromWishlist: removeFromLocalWishlist } = useUserPreferences()
  const { startLoading, stopLoading } = useLoading()
  const [isPending, startTransition] = useTransition()

  return useMutation({
    mutationFn: async (productId: string) => {
      if (!user?.id) {
        throw new AppError(
          'User not authenticated',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          undefined,
          'Please sign in to manage favorites'
        )
      }
      return wishlistService.removeFromWishlist(user.id, productId)
    },
    onMutate: async (productId) => {
      const loadingKey = `wishlist-remove-${productId}`
      startLoading(loadingKey, 'Removing from favorites...')

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: wishlistKeys.list(user?.id || 'anonymous') })

      // Snapshot previous server state
      const previousServerWishlist = queryClient.getQueryData<WishlistSyncData>(
        wishlistKeys.list(user?.id || 'anonymous')
      )

      // Optimistically update local context immediately
      startTransition(() => {
        removeFromLocalWishlist(productId)
      })

      // Optimistically update server cache
      if (user?.id && previousServerWishlist) {
        const optimisticWishlist: WishlistSyncData = {
          ...previousServerWishlist,
          items: previousServerWishlist.items.filter(item => item.productId !== productId),
          totalItems: Math.max(0, previousServerWishlist.totalItems - 1),
          lastSynced: new Date().toISOString()
        }

        queryClient.setQueryData(wishlistKeys.list(user.id), optimisticWishlist)
      }

      stopLoading(loadingKey)
      return { previousServerWishlist, productId }
    },
    onError: (error, productId, context) => {
      console.error('Failed to remove from wishlist:', error)

      // Rollback local context update
      const { addToWishlist: addToLocalWishlist } = useUserPreferences()
      startTransition(() => {
        addToLocalWishlist(productId)
      })

      // Rollback server cache
      if (context?.previousServerWishlist && user?.id) {
        queryClient.setQueryData(
          wishlistKeys.list(user.id),
          context.previousServerWishlist
        )
      }

      stopLoading(`wishlist-remove-${productId}`)
    },
    onSuccess: (_, productId) => {
      // Invalidate and refetch to get accurate server state
      queryClient.invalidateQueries({ queryKey: wishlistKeys.list(user?.id || 'anonymous') })
      stopLoading(`wishlist-remove-${productId}`)
    },
    onSettled: (_, __, productId) => {
      stopLoading(`wishlist-remove-${productId}`)
      queryClient.invalidateQueries({ queryKey: wishlistKeys.list(user?.id || 'anonymous') })
    }
  })
}

/**
 * Wishlist synchronization mutation
 */
export function useWishlistSync() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { preferences } = useUserPreferences()
  const { withLoading } = useLoading()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new AppError(
          'User not authenticated',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          undefined,
          'Please sign in to sync favorites'
        )
      }

      return withLoading(
        'wishlist-sync',
        () => wishlistService.syncWishlist(user.id!, preferences.shopping.wishlist),
        'Syncing favorites...'
      )
    },
    onSuccess: (syncedData) => {
      // Update server cache with synced data
      if (user?.id) {
        queryClient.setQueryData(wishlistKeys.list(user.id), syncedData)
      }
    },
    onError: (error) => {
      console.error('Failed to sync wishlist:', error)
    }
  })
}

/**
 * Combined optimistic wishlist hook
 */
export function useOptimisticWishlist() {
  const { wishlist: localWishlist, isInWishlist } = useUserPreferences().preferences.shopping
  const serverWishlistQuery = useWishlistQuery()
  const addMutation = useOptimisticAddToWishlist()
  const removeMutation = useOptimisticRemoveFromWishlist()
  const syncMutation = useWishlistSync()

  const toggleWishlist = useCallback(async (
    productId: string,
    productData?: Partial<WishlistItem>
  ) => {
    if (isInWishlist(productId)) {
      await removeMutation.mutateAsync(productId)
    } else {
      await addMutation.mutateAsync({ productId, productData })
    }
  }, [isInWishlist, addMutation, removeMutation])

  return {
    // State
    localWishlist,
    serverWishlist: serverWishlistQuery.data?.items || [],
    isLoading: serverWishlistQuery.isLoading || addMutation.isPending || removeMutation.isPending,
    isSyncing: syncMutation.isPending,

    // Utilities
    isInWishlist: (productId: string) => localWishlist.includes(productId),
    getTotalItems: () => localWishlist.length,

    // Actions
    addToWishlist: (productId: string, productData?: Partial<WishlistItem>) =>
      addMutation.mutateAsync({ productId, productData }),
    removeFromWishlist: (productId: string) => removeMutation.mutateAsync(productId),
    toggleWishlist,
    syncWishlist: () => syncMutation.mutateAsync(),

    // Mutation states
    addMutation,
    removeMutation,
    syncMutation,

    // Query state
    serverWishlistQuery
  }
}