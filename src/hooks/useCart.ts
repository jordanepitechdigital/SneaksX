import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ecommerceService } from '@/services/api/ecommerce'
import type {
  CartItem,
  CartSummary,
  AddToCartRequest,
  UpdateCartItemRequest,
  CartValidationResult
} from '@/services/api/ecommerce'
import { useAuth } from './auth/useAuth'

// Query Keys Factory
export const cartKeys = {
  all: ['cart'] as const,
  summary: (sessionId: string, userId?: string) => [...cartKeys.all, 'summary', sessionId, userId] as const,
  validation: (sessionId: string, userId?: string) => [...cartKeys.all, 'validation', sessionId, userId] as const,
  items: (sessionId: string, userId?: string) => [...cartKeys.all, 'items', sessionId, userId] as const,
}

// Generate or retrieve session ID
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr-session'

  let sessionId = localStorage.getItem('cart_session_id')
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('cart_session_id', sessionId)
  }
  return sessionId
}

// Get cart contents with intelligent caching
export function useCart() {
  const { user } = useAuth()
  const sessionId = getSessionId()

  return useQuery({
    queryKey: cartKeys.summary(sessionId, user?.id),
    queryFn: () => ecommerceService.getCart(sessionId, user?.id),
    staleTime: 30 * 1000, // 30 seconds (cart changes frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    // Refetch when user logs in/out
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })
}

// Validate cart contents
export function useCartValidation() {
  const { user } = useAuth()
  const sessionId = getSessionId()

  return useQuery({
    queryKey: cartKeys.validation(sessionId, user?.id),
    queryFn: () => ecommerceService.validateCart(sessionId, user?.id),
    staleTime: 10 * 1000, // 10 seconds (validation should be fresh)
    gcTime: 1 * 60 * 1000, // 1 minute
    retry: 2,
    enabled: true, // Always enabled for validation
  })
}

// Add item to cart mutation
export function useAddToCart() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const sessionId = getSessionId()

  return useMutation({
    mutationFn: (request: Omit<AddToCartRequest, 'sessionId' | 'userId'>) =>
      ecommerceService.addToCart({
        ...request,
        sessionId,
        userId: user?.id,
      }),
    onMutate: async (newItem) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })

      // Snapshot the previous value
      const previousCart = queryClient.getQueryData<CartSummary>(cartKeys.summary(sessionId, user?.id))

      // Optimistically update the cache
      if (previousCart) {
        const optimisticCart: CartSummary = {
          ...previousCart,
          items: [
            ...previousCart.items,
            {
              id: `temp-${Date.now()}`,
              sessionId,
              userId: user?.id,
              productId: newItem.productId,
              productName: 'Loading...',
              productBrand: 'Loading...',
              productImageUrl: '',
              size: newItem.size,
              quantity: newItem.quantity,
              price: 0,
              totalPrice: 0,
              addedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          totalItems: previousCart.totalItems + newItem.quantity,
        }

        queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), optimisticCart)
      }

      return { previousCart }
    },
    onError: (error, newItem, context) => {
      // Rollback optimistic update on error
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), context.previousCart)
      }
      console.error('Failed to add item to cart:', error)
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
      queryClient.invalidateQueries({ queryKey: cartKeys.validation(sessionId, user?.id) })
    },
    onSettled: () => {
      // Always refetch cart after mutation settles
      queryClient.invalidateQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })
    },
  })
}

// Update cart item quantity mutation
export function useUpdateCartItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const sessionId = getSessionId()

  return useMutation({
    mutationFn: (request: UpdateCartItemRequest) => ecommerceService.updateCartItem(request),
    onMutate: async (updatedItem) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })

      // Snapshot previous cart
      const previousCart = queryClient.getQueryData<CartSummary>(cartKeys.summary(sessionId, user?.id))

      // Optimistically update cart
      if (previousCart) {
        const optimisticCart: CartSummary = {
          ...previousCart,
          items: previousCart.items.map(item =>
            item.id === updatedItem.cartItemId
              ? { ...item, quantity: updatedItem.quantity, totalPrice: item.price * updatedItem.quantity }
              : item
          ),
        }

        // Recalculate totals
        optimisticCart.totalItems = optimisticCart.items.reduce((sum, item) => sum + item.quantity, 0)
        optimisticCart.subtotal = optimisticCart.items.reduce((sum, item) => sum + item.totalPrice, 0)
        optimisticCart.estimatedShipping = optimisticCart.subtotal > 100 ? 0 : 10
        optimisticCart.estimatedTax = optimisticCart.subtotal * 0.21
        optimisticCart.estimatedTotal = optimisticCart.subtotal + optimisticCart.estimatedShipping + optimisticCart.estimatedTax

        queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), optimisticCart)
      }

      return { previousCart }
    },
    onError: (error, updatedItem, context) => {
      // Rollback on error
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), context.previousCart)
      }
      console.error('Failed to update cart item:', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
      queryClient.invalidateQueries({ queryKey: cartKeys.validation(sessionId, user?.id) })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })
    },
  })
}

// Remove item from cart mutation
export function useRemoveFromCart() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const sessionId = getSessionId()

  return useMutation({
    mutationFn: (cartItemId: string) => ecommerceService.removeFromCart(cartItemId),
    onMutate: async (cartItemId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })

      // Snapshot previous cart
      const previousCart = queryClient.getQueryData<CartSummary>(cartKeys.summary(sessionId, user?.id))

      // Optimistically remove item
      if (previousCart) {
        const optimisticCart: CartSummary = {
          ...previousCart,
          items: previousCart.items.filter(item => item.id !== cartItemId),
        }

        // Recalculate totals
        optimisticCart.totalItems = optimisticCart.items.reduce((sum, item) => sum + item.quantity, 0)
        optimisticCart.subtotal = optimisticCart.items.reduce((sum, item) => sum + item.totalPrice, 0)
        optimisticCart.estimatedShipping = optimisticCart.subtotal > 100 ? 0 : 10
        optimisticCart.estimatedTax = optimisticCart.subtotal * 0.21
        optimisticCart.estimatedTotal = optimisticCart.subtotal + optimisticCart.estimatedShipping + optimisticCart.estimatedTax

        queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), optimisticCart)
      }

      return { previousCart }
    },
    onError: (error, cartItemId, context) => {
      // Rollback on error
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), context.previousCart)
      }
      console.error('Failed to remove cart item:', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
      queryClient.invalidateQueries({ queryKey: cartKeys.validation(sessionId, user?.id) })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })
    },
  })
}

// Clear entire cart mutation
export function useClearCart() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const sessionId = getSessionId()

  return useMutation({
    mutationFn: () => ecommerceService.clearCart(sessionId, user?.id),
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })

      // Snapshot previous cart
      const previousCart = queryClient.getQueryData<CartSummary>(cartKeys.summary(sessionId, user?.id))

      // Optimistically clear cart
      const emptyCart: CartSummary = {
        items: [],
        totalItems: 0,
        subtotal: 0,
        estimatedShipping: 10,
        estimatedTax: 0,
        estimatedTotal: 10,
      }

      queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), emptyCart)

      return { previousCart }
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.summary(sessionId, user?.id), context.previousCart)
      }
      console.error('Failed to clear cart:', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
      queryClient.invalidateQueries({ queryKey: cartKeys.validation(sessionId, user?.id) })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.summary(sessionId, user?.id) })
    },
  })
}

// Utility hooks
export function useCartItemCount() {
  const { data: cart } = useCart()
  return cart?.totalItems || 0
}

export function useCartTotal() {
  const { data: cart } = useCart()
  return cart?.estimatedTotal || 0
}

export function useIsInCart(productId: string, size: string) {
  const { data: cart } = useCart()
  return cart?.items.some(item => item.productId === productId && item.size === size) || false
}

export function useCartItem(productId: string, size: string) {
  const { data: cart } = useCart()
  return cart?.items.find(item => item.productId === productId && item.size === size)
}

// Cart invalidation utility
export function useInvalidateCart() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: cartKeys.all })
  }
}

// Transfer cart on login (merge guest cart with user cart)
export function useTransferCart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ fromSessionId, toUserId }: { fromSessionId: string; toUserId: string }) => {
      // This would need to be implemented in the backend
      // For now, just invalidate queries to refetch with new user context
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
      return Promise.resolve()
    },
    onSuccess: () => {
      // Refetch cart with user context
      queryClient.invalidateQueries({ queryKey: cartKeys.all })
    },
  })
}