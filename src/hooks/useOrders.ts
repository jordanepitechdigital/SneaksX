import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ecommerceService } from '@/services/api/ecommerce'
import type { Order, CheckoutData } from '@/types/order'
import type { CreatePaymentIntentRequest, ProcessPaymentRequest } from '@/services/payments'
import { useAuth } from './auth/useAuth'

// Query Keys Factory
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (userId: string) => [...orderKeys.lists(), userId] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (orderId: string, userId: string) => [...orderKeys.details(), orderId, userId] as const,
  stats: (userId: string) => [...orderKeys.all, 'stats', userId] as const,
  payments: () => [...orderKeys.all, 'payments'] as const,
  paymentIntent: (intentId: string) => [...orderKeys.payments(), 'intent', intentId] as const,
}

// Get user orders with intelligent caching
export function useOrders() {
  const { user } = useAuth()

  return useQuery({
    queryKey: orderKeys.list(user?.id!),
    queryFn: () => ecommerceService.getUserOrders(user!.id),
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

// Get single order details
export function useOrder(orderId?: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: orderKeys.detail(orderId!, user?.id!),
    queryFn: () => ecommerceService.getOrderById(user!.id, orderId!),
    enabled: !!user?.id && !!orderId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
  })
}

// Get order statistics
export function useOrderStats() {
  const { user } = useAuth()

  return useQuery({
    queryKey: orderKeys.stats(user?.id!),
    queryFn: () => ecommerceService.getOrderStats(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 3,
  })
}

// Create order mutation
export function useCreateOrder() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ checkoutData, sessionId }: { checkoutData: CheckoutData; sessionId?: string }) =>
      ecommerceService.createOrder(user!.id, checkoutData, sessionId),
    onSuccess: (result) => {
      // Invalidate orders list and stats
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: orderKeys.list(user.id) })
        queryClient.invalidateQueries({ queryKey: orderKeys.stats(user.id) })

        // Add the new order to cache if successful
        if (result.success && result.order) {
          queryClient.setQueryData(
            orderKeys.detail(result.order.id, user.id),
            result.order
          )
        }
      }

      // Clear cart after successful order creation
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
    onError: (error) => {
      console.error('Failed to create order:', error)
    },
  })
}

// Update order status mutation (admin/vendor use)
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: Order['status'] }) =>
      ecommerceService.updateOrderStatus(user!.id, orderId, status),
    onSuccess: (_, { orderId, status }) => {
      if (user?.id) {
        // Update the specific order in cache
        queryClient.setQueryData(
          orderKeys.detail(orderId, user.id),
          (old: Order | undefined) => old ? { ...old, status } : undefined
        )

        // Invalidate orders list and stats
        queryClient.invalidateQueries({ queryKey: orderKeys.list(user.id) })
        queryClient.invalidateQueries({ queryKey: orderKeys.stats(user.id) })
      }
    },
    onError: (error) => {
      console.error('Failed to update order status:', error)
    },
  })
}

// Cancel order mutation
export function useCancelOrder() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (orderId: string) => ecommerceService.cancelOrder(user!.id, orderId),
    onSuccess: (_, orderId) => {
      if (user?.id) {
        // Update the specific order in cache
        queryClient.setQueryData(
          orderKeys.detail(orderId, user.id),
          (old: Order | undefined) => old ? { ...old, status: 'cancelled' as const } : undefined
        )

        // Invalidate orders list and stats
        queryClient.invalidateQueries({ queryKey: orderKeys.list(user.id) })
        queryClient.invalidateQueries({ queryKey: orderKeys.stats(user.id) })
      }
    },
    onError: (error) => {
      console.error('Failed to cancel order:', error)
    },
  })
}

// PAYMENT-RELATED HOOKS

// Create payment intent
export function useCreatePaymentIntent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreatePaymentIntentRequest) =>
      ecommerceService.createPaymentIntent(request),
    onSuccess: (result, request) => {
      // Cache the payment intent
      if (result.success && result.paymentIntent) {
        queryClient.setQueryData(
          orderKeys.paymentIntent(result.paymentIntent.id),
          result.paymentIntent
        )
      }
    },
    onError: (error) => {
      console.error('Failed to create payment intent:', error)
    },
  })
}

// Process payment
export function useProcessPayment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (request: ProcessPaymentRequest) =>
      ecommerceService.processPayment(request),
    onSuccess: (result) => {
      if (result.success && result.orderId && user?.id) {
        // Invalidate order data to refetch with updated payment status
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(result.orderId, user.id) })
        queryClient.invalidateQueries({ queryKey: orderKeys.list(user.id) })
        queryClient.invalidateQueries({ queryKey: orderKeys.stats(user.id) })
      }
    },
    onError: (error) => {
      console.error('Failed to process payment:', error)
    },
  })
}

// Get payment intent
export function usePaymentIntent(paymentIntentId?: string) {
  return useQuery({
    queryKey: orderKeys.paymentIntent(paymentIntentId!),
    queryFn: () => ecommerceService.retrievePaymentIntent(paymentIntentId!),
    enabled: !!paymentIntentId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
  })
}

// CHECKOUT FLOW HOOK

// Process complete checkout
export function useProcessCheckout() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (params: {
      sessionId: string
      checkoutData: CheckoutData
      paymentMethod: { type: 'card' | 'bank_transfer' | 'crypto'; details?: Record<string, any> }
      returnUrl: string
    }) =>
      ecommerceService.processCheckout({
        ...params,
        userId: user!.id,
      }),
    onMutate: async () => {
      // Optimistically clear cart
      queryClient.setQueryData(['cart'], {
        items: [],
        totalItems: 0,
        subtotal: 0,
        estimatedShipping: 10,
        estimatedTax: 0,
        estimatedTotal: 10,
      })
    },
    onSuccess: (result) => {
      if (result.success && result.order && user?.id) {
        // Add new order to cache
        queryClient.setQueryData(
          orderKeys.detail(result.order.id, user.id),
          result.order
        )

        // Invalidate orders list and stats
        queryClient.invalidateQueries({ queryKey: orderKeys.list(user.id) })
        queryClient.invalidateQueries({ queryKey: orderKeys.stats(user.id) })

        // Ensure cart is cleared
        queryClient.invalidateQueries({ queryKey: ['cart'] })
      }
    },
    onError: (error) => {
      console.error('Failed to process checkout:', error)
      // Refetch cart on error to restore state
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })
}

// UTILITY HOOKS

// Get orders by status
export function useOrdersByStatus(status: Order['status']) {
  const { data: orders } = useOrders()
  return orders?.filter(order => order.status === status) || []
}

// Get recent orders
export function useRecentOrders(limit = 5) {
  const { data: orders } = useOrders()
  return orders?.slice(0, limit) || []
}

// Check if user has any orders
export function useHasOrders() {
  const { data: orders, isLoading } = useOrders()
  return {
    hasOrders: !isLoading && (orders?.length || 0) > 0,
    isLoading,
  }
}

// Get order by number
export function useOrderByNumber(orderNumber: string) {
  const { data: orders } = useOrders()
  return orders?.find(order => order.id === orderNumber) // Note: Adjust based on actual order number field
}

// Prefetch order utility
export function usePrefetchOrder() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return (orderId: string) => {
    if (!user?.id) return

    queryClient.prefetchQuery({
      queryKey: orderKeys.detail(orderId, user.id),
      queryFn: () => ecommerceService.getOrderById(user.id, orderId),
      staleTime: 5 * 60 * 1000,
    })
  }
}

// Invalidate all orders utility
export function useInvalidateOrders() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: orderKeys.all })
  }
}