/**
 * Orders React Query Hooks
 * Order management, checkout, and order history with React Query
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  UseQueryOptions,
  UseMutationOptions,
  UseInfiniteQueryOptions,
  QueryClient,
} from '@tanstack/react-query';
import { OrderService } from '@/services/orders';
import { ecommerceService } from '@/services/api/ecommerce';
import type { Order, OrderItem, CheckoutData, OrderStatus } from '@/types/order';
import type { CheckoutRequest, CheckoutResponse } from '@/services/api/ecommerce';
import { STALE_TIME, CACHE_TIME } from '@/lib/react-query/config';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cartQueryKeys } from '../cart/useCartQueries';

// Query keys for orders
export const orderQueryKeys = {
  all: ['orders'] as const,
  lists: () => ['orders', 'list'] as const,
  list: (filters?: { status?: OrderStatus; userId?: string }) =>
    ['orders', 'list', filters] as const,
  details: () => ['orders', 'detail'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  recent: (userId: string, limit?: number) =>
    ['orders', 'recent', userId, limit] as const,
  stats: (userId: string) => ['orders', 'stats', userId] as const,
  tracking: (orderId: string) => ['orders', 'tracking', orderId] as const,
};

// ===== QUERY HOOKS =====

/**
 * Get single order by ID
 */
export function useOrder(
  orderId: string | undefined,
  options?: UseQueryOptions<Order, Error>
) {
  return useQuery({
    queryKey: orderQueryKeys.detail(orderId!),
    queryFn: () => OrderService.getOrder(orderId!),
    enabled: !!orderId,
    staleTime: STALE_TIME.NORMAL,
    gcTime: CACHE_TIME.LONG,
    ...options,
  });
}

/**
 * Get orders list with filters
 */
export function useOrders(
  filters?: { status?: OrderStatus; userId?: string },
  options?: UseQueryOptions<Order[], Error>
) {
  return useQuery({
    queryKey: orderQueryKeys.list(filters),
    queryFn: () => OrderService.getOrders(filters?.userId, filters?.status),
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Get recent orders for a user
 */
export function useRecentOrders(
  userId: string | undefined,
  limit: number = 5,
  options?: UseQueryOptions<Order[], Error>
) {
  return useQuery({
    queryKey: orderQueryKeys.recent(userId!, limit),
    queryFn: () => OrderService.getRecentOrders(userId!, limit),
    enabled: !!userId,
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Infinite scrolling for order history
 */
export function useInfiniteOrders(
  userId?: string,
  status?: OrderStatus,
  options?: UseInfiniteQueryOptions<
    { orders: Order[]; hasMore: boolean; nextCursor?: string },
    Error
  >
) {
  return useInfiniteQuery({
    queryKey: ['orders', 'infinite', { userId, status }],
    queryFn: async ({ pageParam }) => {
      const orders = await OrderService.getOrdersPaginated(
        userId,
        status,
        20,
        pageParam
      );

      return {
        orders,
        hasMore: orders.length === 20,
        nextCursor: orders[orders.length - 1]?.id,
      };
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Get order statistics for user
 */
export function useOrderStats(
  userId: string | undefined,
  options?: UseQueryOptions<{
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate?: string;
  }, Error>
) {
  return useQuery({
    queryKey: orderQueryKeys.stats(userId!),
    queryFn: () => OrderService.getOrderStats(userId!),
    enabled: !!userId,
    staleTime: STALE_TIME.MODERATE,
    gcTime: CACHE_TIME.LONG,
    ...options,
  });
}

/**
 * Track order in real-time
 */
export function useOrderTracking(
  orderId: string | undefined,
  options?: UseQueryOptions<{
    status: OrderStatus;
    trackingNumber?: string;
    estimatedDelivery?: string;
    updates: Array<{
      status: string;
      timestamp: string;
      location?: string;
      description: string;
    }>;
  }, Error>
) {
  return useQuery({
    queryKey: orderQueryKeys.tracking(orderId!),
    queryFn: () => OrderService.trackOrder(orderId!),
    enabled: !!orderId,
    staleTime: STALE_TIME.INSTANT, // Always fresh for tracking
    gcTime: CACHE_TIME.SHORT,
    refetchInterval: 30000, // Poll every 30 seconds
    ...options,
  });
}

// ===== MUTATION HOOKS =====

/**
 * Create order (checkout)
 */
export function useCreateOrder(
  options?: UseMutationOptions<Order, Error, CheckoutData>
) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (checkoutData) => {
      // First, validate the cart
      const validation = await ecommerceService.validateCart(
        checkoutData.sessionId
      );

      if (!validation.isValid) {
        throw new Error(validation.errors[0] || 'Cart validation failed');
      }

      // Process checkout
      const checkoutRequest: CheckoutRequest = {
        sessionId: checkoutData.sessionId,
        userId: checkoutData.userId,
        shippingAddress: checkoutData.shippingAddress,
        billingAddress: checkoutData.billingAddress,
        paymentMethodId: checkoutData.paymentMethodId,
        discountCode: checkoutData.discountCode,
      };

      const response = await ecommerceService.checkout(checkoutRequest);

      // Create order record
      const order = await OrderService.createOrder({
        ...checkoutData,
        paymentIntentId: response.paymentIntentId,
      });

      return order;
    },
    onMutate: async () => {
      // Show loading state
      toast.loading('Processing your order...');
    },
    onSuccess: (order) => {
      // Dismiss loading toast
      toast.dismiss();

      // Clear the cart
      queryClient.invalidateQueries({ queryKey: cartQueryKeys.all });
      queryClient.setQueryData(cartQueryKeys.count(), 0);

      // Invalidate order lists to include new order
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() });

      // Add the new order to cache
      queryClient.setQueryData(orderQueryKeys.detail(order.id), order);

      toast.success('Order placed successfully!');

      // Redirect to order confirmation
      router.push(`/orders/${order.id}/confirmation`);
    },
    onError: (error) => {
      toast.dismiss();
      toast.error(error.message || 'Failed to place order');
    },
    ...options,
  });
}

/**
 * Update order status (admin)
 */
export function useUpdateOrderStatus(
  options?: UseMutationOptions<Order, Error, { orderId: string; status: OrderStatus }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }) =>
      OrderService.updateOrderStatus(orderId, status),
    onMutate: async ({ orderId, status }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: orderQueryKeys.detail(orderId) });

      // Snapshot previous value
      const previousOrder = queryClient.getQueryData<Order>(
        orderQueryKeys.detail(orderId)
      );

      // Optimistically update
      if (previousOrder) {
        queryClient.setQueryData<Order>(orderQueryKeys.detail(orderId), {
          ...previousOrder,
          status,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousOrder };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousOrder) {
        queryClient.setQueryData(
          orderQueryKeys.detail(variables.orderId),
          context.previousOrder
        );
      }
      toast.error('Failed to update order status');
    },
    onSuccess: (data, variables) => {
      // Invalidate order queries
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.detail(variables.orderId) });
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() });

      toast.success(`Order status updated to ${variables.status}`);
    },
    ...options,
  });
}

/**
 * Cancel order
 */
export function useCancelOrder(
  options?: UseMutationOptions<Order, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId) => OrderService.cancelOrder(orderId),
    onMutate: async (orderId) => {
      // Optimistically update status to cancelled
      const previousOrder = queryClient.getQueryData<Order>(
        orderQueryKeys.detail(orderId)
      );

      if (previousOrder) {
        queryClient.setQueryData<Order>(orderQueryKeys.detail(orderId), {
          ...previousOrder,
          status: 'cancelled',
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousOrder };
    },
    onError: (error, orderId, context) => {
      // Rollback on error
      if (context?.previousOrder) {
        queryClient.setQueryData(
          orderQueryKeys.detail(orderId),
          context.previousOrder
        );
      }
      toast.error('Failed to cancel order');
    },
    onSuccess: (data, orderId) => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() });

      toast.success('Order cancelled successfully');
    },
    ...options,
  });
}

/**
 * Request refund for order
 */
export function useRequestRefund(
  options?: UseMutationOptions<Order, Error, { orderId: string; reason: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, reason }) =>
      OrderService.requestRefund(orderId, reason),
    onSuccess: (data, variables) => {
      // Update order in cache
      queryClient.setQueryData(orderQueryKeys.detail(variables.orderId), data);
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() });

      toast.success('Refund request submitted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to request refund');
    },
    ...options,
  });
}

// ===== UTILITY HOOKS =====

/**
 * Check if user can cancel an order
 */
export function useCanCancelOrder(order?: Order) {
  if (!order) return false;

  const cancellableStatuses: OrderStatus[] = ['pending', 'processing', 'confirmed'];
  const hoursSinceOrder =
    (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);

  return cancellableStatuses.includes(order.status) && hoursSinceOrder < 24;
}

/**
 * Check if user can request refund
 */
export function useCanRequestRefund(order?: Order) {
  if (!order) return false;

  const refundableStatuses: OrderStatus[] = ['delivered'];
  const daysSinceDelivery = order.deliveredAt
    ? (Date.now() - new Date(order.deliveredAt).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  return refundableStatuses.includes(order.status) && daysSinceDelivery <= 30;
}

// ===== PREFETCH UTILITIES =====

/**
 * Prefetch order data
 */
export async function prefetchOrder(
  queryClient: QueryClient,
  orderId: string
) {
  await queryClient.prefetchQuery({
    queryKey: orderQueryKeys.detail(orderId),
    queryFn: () => OrderService.getOrder(orderId),
    staleTime: STALE_TIME.NORMAL,
  });
}

/**
 * Prefetch user's recent orders
 */
export async function prefetchUserOrders(
  queryClient: QueryClient,
  userId: string
) {
  await queryClient.prefetchQuery({
    queryKey: orderQueryKeys.recent(userId, 5),
    queryFn: () => OrderService.getRecentOrders(userId, 5),
    staleTime: STALE_TIME.FREQUENT,
  });
}

/**
 * Invalidate all order queries
 */
export function invalidateOrderQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
}

/**
 * Clear order cache on logout
 */
export function clearOrderCache(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: orderQueryKeys.all });
}