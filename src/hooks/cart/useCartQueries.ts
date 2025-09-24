/**
 * Cart & E-commerce React Query Hooks
 * Shopping cart management with optimistic updates and real-time sync
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  QueryClient,
} from '@tanstack/react-query';
import { ecommerceService } from '@/services/api/ecommerce';
import type {
  CartItem,
  CartSummary,
  AddToCartRequest,
  UpdateCartItemRequest,
  CartValidationResult,
} from '@/services/api/ecommerce';
import { STALE_TIME, CACHE_TIME } from '@/lib/react-query/config';
import { toast } from 'sonner';
import { productKeys } from '../products/useProductQueries';

// Query keys for cart
export const cartQueryKeys = {
  all: ['cart'] as const,
  summary: () => ['cart', 'summary'] as const,
  items: () => ['cart', 'items'] as const,
  item: (id: string) => ['cart', 'item', id] as const,
  validation: () => ['cart', 'validation'] as const,
  count: () => ['cart', 'count'] as const,
};

// ===== QUERY HOOKS =====

/**
 * Get cart summary with items and totals
 */
export function useCartSummary(
  sessionId?: string,
  options?: UseQueryOptions<CartSummary, Error>
) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: [...cartQueryKeys.summary(), sessionId],
    queryFn: async () => {
      if (!sessionId) {
        throw new Error('Session ID is required to fetch cart');
      }

      const summary = await ecommerceService.getCart(sessionId);

      // Update item count in a separate query
      queryClient.setQueryData(cartQueryKeys.count(), summary.totalItems);

      return summary;
    },
    enabled: !!sessionId, // Only run if sessionId exists
    staleTime: STALE_TIME.INSTANT, // Always fresh for cart
    gcTime: CACHE_TIME.SHORT,
    refetchOnWindowFocus: true, // Sync cart when user returns
    ...options,
  });
}

/**
 * Get cart items only
 */
export function useCartItems(
  sessionId?: string,
  options?: UseQueryOptions<CartItem[], Error>
) {
  return useQuery({
    queryKey: [...cartQueryKeys.items(), sessionId],
    queryFn: () => ecommerceService.getCartItems(sessionId),
    staleTime: STALE_TIME.INSTANT,
    gcTime: CACHE_TIME.SHORT,
    ...options,
  });
}

/**
 * Get cart item count for header badge
 */
export function useCartCount(
  sessionId?: string,
  options?: UseQueryOptions<number, Error>
) {
  const { data: summary } = useCartSummary(sessionId, {
    select: (data) => data.totalItems,
  });

  return useQuery({
    queryKey: cartQueryKeys.count(),
    queryFn: async () => {
      if (summary !== undefined) return summary;
      const cartSummary = await ecommerceService.getCartSummary(sessionId);
      return cartSummary.totalItems;
    },
    staleTime: STALE_TIME.INSTANT,
    gcTime: CACHE_TIME.SHORT,
    initialData: 0,
    ...options,
  });
}

/**
 * Validate cart before checkout
 */
export function useValidateCart(
  sessionId?: string,
  options?: UseQueryOptions<CartValidationResult, Error>
) {
  return useQuery({
    queryKey: [...cartQueryKeys.validation(), sessionId],
    queryFn: () => ecommerceService.validateCart(sessionId),
    staleTime: STALE_TIME.INSTANT,
    gcTime: CACHE_TIME.SHORT,
    enabled: false, // Only run when explicitly triggered
    ...options,
  });
}

// ===== MUTATION HOOKS =====

/**
 * Add item to cart with optimistic update
 */
export function useAddToCart(
  options?: UseMutationOptions<CartItem, Error, AddToCartRequest>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request) => ecommerceService.addToCart(request),
    onMutate: async (request) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartQueryKeys.summary() });
      await queryClient.cancelQueries({ queryKey: cartQueryKeys.items() });

      // Snapshot previous values
      const previousSummary = queryClient.getQueryData<CartSummary>(
        [...cartQueryKeys.summary(), request.sessionId]
      );
      const previousCount = queryClient.getQueryData<number>(cartQueryKeys.count());

      // Optimistically update cart count
      if (previousCount !== undefined) {
        queryClient.setQueryData<number>(
          cartQueryKeys.count(),
          previousCount + request.quantity
        );
      }

      // Create optimistic cart item
      const optimisticItem: Partial<CartItem> = {
        id: `temp-${Date.now()}`,
        productId: request.productId,
        size: request.size,
        quantity: request.quantity,
        addedAt: new Date().toISOString(),
      };

      // Optimistically update cart summary
      if (previousSummary) {
        queryClient.setQueryData<CartSummary>(
          [...cartQueryKeys.summary(), request.sessionId],
          {
            ...previousSummary,
            items: [...previousSummary.items, optimisticItem as CartItem],
            totalItems: previousSummary.totalItems + request.quantity,
          }
        );
      }

      return { previousSummary, previousCount };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousSummary) {
        queryClient.setQueryData(
          [...cartQueryKeys.summary(), variables.sessionId],
          context.previousSummary
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(cartQueryKeys.count(), context.previousCount);
      }

      toast.error('Failed to add item to cart');
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: cartQueryKeys.summary() });
      queryClient.invalidateQueries({ queryKey: cartQueryKeys.items() });

      // Show success message with product name if available
      toast.success('Added to cart successfully');
    },
    ...options,
  });
}

/**
 * Update cart item quantity with optimistic update
 */
export function useUpdateCartItem(
  options?: UseMutationOptions<CartItem, Error, UpdateCartItemRequest>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request) => ecommerceService.updateCartItem(request),
    onMutate: async (request) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartQueryKeys.summary() });

      // Get current cart data
      const previousSummary = queryClient.getQueryData<CartSummary>(
        cartQueryKeys.summary()
      );

      // Optimistically update quantity
      if (previousSummary) {
        const updatedItems = previousSummary.items.map(item =>
          item.id === request.cartItemId
            ? { ...item, quantity: request.quantity }
            : item
        );

        const totalItems = updatedItems.reduce(
          (sum, item) => sum + item.quantity,
          0
        );

        queryClient.setQueryData<CartSummary>(cartQueryKeys.summary(), {
          ...previousSummary,
          items: updatedItems,
          totalItems,
        });

        queryClient.setQueryData<number>(cartQueryKeys.count(), totalItems);
      }

      return { previousSummary };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousSummary) {
        queryClient.setQueryData(cartQueryKeys.summary(), context.previousSummary);
        queryClient.setQueryData(
          cartQueryKeys.count(),
          context.previousSummary.totalItems
        );
      }

      toast.error('Failed to update quantity');
    },
    onSuccess: () => {
      // Invalidate to sync with server
      queryClient.invalidateQueries({ queryKey: cartQueryKeys.summary() });
      toast.success('Quantity updated');
    },
    ...options,
  });
}

/**
 * Remove item from cart with optimistic update
 */
export function useRemoveFromCart(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cartItemId) => ecommerceService.removeFromCart(cartItemId),
    onMutate: async (cartItemId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartQueryKeys.summary() });

      // Get current cart data
      const previousSummary = queryClient.getQueryData<CartSummary>(
        cartQueryKeys.summary()
      );

      // Optimistically remove item
      if (previousSummary) {
        const itemToRemove = previousSummary.items.find(
          item => item.id === cartItemId
        );
        const updatedItems = previousSummary.items.filter(
          item => item.id !== cartItemId
        );

        const totalItems = previousSummary.totalItems - (itemToRemove?.quantity || 0);

        queryClient.setQueryData<CartSummary>(cartQueryKeys.summary(), {
          ...previousSummary,
          items: updatedItems,
          totalItems,
        });

        queryClient.setQueryData<number>(cartQueryKeys.count(), totalItems);
      }

      return { previousSummary };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousSummary) {
        queryClient.setQueryData(cartQueryKeys.summary(), context.previousSummary);
        queryClient.setQueryData(
          cartQueryKeys.count(),
          context.previousSummary.totalItems
        );
      }

      toast.error('Failed to remove item');
    },
    onSuccess: () => {
      // Invalidate to sync with server
      queryClient.invalidateQueries({ queryKey: cartQueryKeys.summary() });
      toast.success('Item removed from cart');
    },
    ...options,
  });
}

/**
 * Clear entire cart
 */
export function useClearCart(
  options?: UseMutationOptions<void, Error, string | undefined>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId) => ecommerceService.clearCart(sessionId),
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartQueryKeys.summary() });

      // Get current cart data for rollback
      const previousSummary = queryClient.getQueryData<CartSummary>(
        cartQueryKeys.summary()
      );

      // Optimistically clear cart
      queryClient.setQueryData<CartSummary>(cartQueryKeys.summary(), {
        items: [],
        totalItems: 0,
        subtotal: 0,
        estimatedShipping: 0,
        estimatedTax: 0,
        estimatedTotal: 0,
      });

      queryClient.setQueryData<number>(cartQueryKeys.count(), 0);

      return { previousSummary };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousSummary) {
        queryClient.setQueryData(cartQueryKeys.summary(), context.previousSummary);
        queryClient.setQueryData(
          cartQueryKeys.count(),
          context.previousSummary.totalItems
        );
      }

      toast.error('Failed to clear cart');
    },
    onSuccess: () => {
      // Invalidate all cart queries
      queryClient.invalidateQueries({ queryKey: cartQueryKeys.all });
      toast.success('Cart cleared');
    },
    ...options,
  });
}

/**
 * Apply discount code to cart
 */
export function useApplyDiscount(
  options?: UseMutationOptions<CartSummary, Error, { code: string; sessionId?: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, sessionId }) =>
      ecommerceService.applyDiscountCode(code, sessionId),
    onSuccess: (data) => {
      // Update cart summary with discount applied
      queryClient.setQueryData(cartQueryKeys.summary(), data);
      toast.success('Discount applied successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Invalid discount code');
    },
    ...options,
  });
}

// ===== UTILITY HOOKS =====

/**
 * Check if a product is in the cart
 */
export function useIsInCart(productId: string, size?: string) {
  const { data: summary } = useCartSummary();

  return summary?.items.some(
    item => item.productId === productId && (!size || item.size === size)
  ) || false;
}

/**
 * Get quantity of a specific product in cart
 */
export function useCartItemQuantity(productId: string, size?: string) {
  const { data: summary } = useCartSummary();

  const item = summary?.items.find(
    item => item.productId === productId && (!size || item.size === size)
  );

  return item?.quantity || 0;
}

// ===== PREFETCH UTILITIES =====

/**
 * Prefetch cart data
 */
export async function prefetchCartData(
  queryClient: QueryClient,
  sessionId?: string
) {
  await queryClient.prefetchQuery({
    queryKey: [...cartQueryKeys.summary(), sessionId],
    queryFn: () => ecommerceService.getCartSummary(sessionId),
    staleTime: STALE_TIME.INSTANT,
  });
}

/**
 * Sync cart after login
 */
export async function syncCartAfterLogin(
  queryClient: QueryClient,
  userId: string,
  sessionId?: string
) {
  try {
    // Merge session cart with user cart
    await ecommerceService.mergeSessionCart(sessionId, userId);

    // Invalidate all cart queries to fetch fresh data
    await queryClient.invalidateQueries({ queryKey: cartQueryKeys.all });

    toast.success('Cart synced with your account');
  } catch (error) {
    console.error('Failed to sync cart:', error);
  }
}

/**
 * Clear cart cache on logout
 */
export function clearCartCache(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: cartQueryKeys.all });
}