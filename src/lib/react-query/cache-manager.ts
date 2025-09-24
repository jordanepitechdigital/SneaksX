/**
 * React Query Cache Manager
 * Centralized cache invalidation and synchronization strategies
 */

import { QueryClient } from '@tanstack/react-query';
import { productQueryKeys } from '@/hooks/products/useProductQueries';
import { authQueryKeys } from '@/hooks/auth/useAuthQueries';
import { cartQueryKeys } from '@/hooks/cart/useCartQueries';
import { orderQueryKeys } from '@/hooks/orders/useOrderQueries';

/**
 * Cache invalidation strategies for different scenarios
 */
export class CacheManager {
  constructor(private queryClient: QueryClient) {}

  // ===== AUTHENTICATION EVENTS =====

  /**
   * Handle user login - sync user-specific data
   */
  async onUserLogin(userId: string, sessionId?: string) {
    // Prefetch user data
    await Promise.all([
      this.queryClient.prefetchQuery({
        queryKey: authQueryKeys.user(),
        queryFn: async () => {
          const { authService } = await import('@/services/api/auth');
          return authService.getCurrentUser();
        },
      }),
      this.queryClient.prefetchQuery({
        queryKey: authQueryKeys.session(),
        queryFn: async () => {
          const { authService } = await import('@/services/api/auth');
          return authService.getSession();
        },
      }),
    ]);

    // Merge session cart with user cart
    if (sessionId) {
      const { ecommerceService } = await import('@/services/api/ecommerce');
      await ecommerceService.mergeSessionCart(sessionId, userId);
    }

    // Invalidate user-specific queries to fetch fresh data
    await Promise.all([
      this.queryClient.invalidateQueries({ queryKey: cartQueryKeys.all }),
      this.queryClient.invalidateQueries({ queryKey: orderQueryKeys.all }),
      this.queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
    ]);
  }

  /**
   * Handle user logout - clear sensitive data
   */
  onUserLogout() {
    // Remove auth data
    this.queryClient.removeQueries({ queryKey: authQueryKeys.all });

    // Remove user-specific data
    this.queryClient.removeQueries({ queryKey: cartQueryKeys.all });
    this.queryClient.removeQueries({ queryKey: orderQueryKeys.all });
    this.queryClient.removeQueries({ queryKey: ['wishlist'] });
    this.queryClient.removeQueries({ queryKey: ['addresses'] });
    this.queryClient.removeQueries({ queryKey: ['payment-methods'] });

    // Invalidate products to refresh pricing (might have user-specific discounts)
    this.queryClient.invalidateQueries({ queryKey: productQueryKeys.all });
  }

  // ===== PRODUCT EVENTS =====

  /**
   * Handle product update - invalidate related caches
   */
  async onProductUpdate(productId: string) {
    await Promise.all([
      // Invalidate specific product
      this.queryClient.invalidateQueries({
        queryKey: productQueryKeys.detail(productId),
      }),
      // Invalidate product lists that might contain this product
      this.queryClient.invalidateQueries({
        queryKey: productQueryKeys.lists(),
      }),
      // Invalidate similar products
      this.queryClient.invalidateQueries({
        queryKey: productQueryKeys.similar(productId, 8),
      }),
    ]);
  }

  /**
   * Handle product deletion
   */
  onProductDelete(productId: string) {
    // Remove specific product from cache
    this.queryClient.removeQueries({
      queryKey: productQueryKeys.detail(productId),
    });

    // Remove from lists
    this.queryClient.setQueriesData(
      { queryKey: productQueryKeys.lists() },
      (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          products: oldData.products?.filter((p: any) => p.id !== productId),
        };
      }
    );

    // Invalidate lists to ensure consistency
    this.queryClient.invalidateQueries({
      queryKey: productQueryKeys.lists(),
    });
  }

  /**
   * Handle bulk product import/update
   */
  async onBulkProductChange() {
    // Clear all product caches when bulk changes occur
    await this.queryClient.invalidateQueries({
      queryKey: productQueryKeys.all,
    });
  }

  // ===== CART EVENTS =====

  /**
   * Handle cart item addition
   */
  async onCartItemAdded(productId: string) {
    await Promise.all([
      // Invalidate cart summary
      this.queryClient.invalidateQueries({
        queryKey: cartQueryKeys.summary(),
      }),
      // Invalidate cart items
      this.queryClient.invalidateQueries({
        queryKey: cartQueryKeys.items(),
      }),
      // Update product stock if needed
      this.queryClient.invalidateQueries({
        queryKey: productQueryKeys.detail(productId),
      }),
    ]);
  }

  /**
   * Handle cart checkout completion
   */
  onCartCheckoutComplete() {
    // Clear cart
    this.queryClient.removeQueries({ queryKey: cartQueryKeys.all });
    this.queryClient.setQueryData(cartQueryKeys.count(), 0);

    // Invalidate orders to include new order
    this.queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() });
  }

  // ===== ORDER EVENTS =====

  /**
   * Handle order status update
   */
  async onOrderStatusUpdate(orderId: string, newStatus: string) {
    await Promise.all([
      // Invalidate specific order
      this.queryClient.invalidateQueries({
        queryKey: orderQueryKeys.detail(orderId),
      }),
      // Invalidate order lists
      this.queryClient.invalidateQueries({
        queryKey: orderQueryKeys.lists(),
      }),
      // Invalidate tracking if order is being shipped
      newStatus === 'shipped' &&
        this.queryClient.invalidateQueries({
          queryKey: orderQueryKeys.tracking(orderId),
        }),
    ]);
  }

  /**
   * Handle order cancellation
   */
  async onOrderCancelled(orderId: string, orderItems: any[]) {
    // Update order status in cache
    await this.onOrderStatusUpdate(orderId, 'cancelled');

    // Restore product stock for cancelled items
    const productIds = orderItems.map(item => item.productId);
    await Promise.all(
      productIds.map(id =>
        this.queryClient.invalidateQueries({
          queryKey: productQueryKeys.detail(id),
        })
      )
    );
  }

  // ===== REAL-TIME EVENTS =====

  /**
   * Handle real-time stock update
   */
  onStockUpdate(productId: string, newStock: number) {
    // Update product in cache without refetching
    this.queryClient.setQueryData(
      productQueryKeys.detail(productId),
      (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          stockCount: newStock,
        };
      }
    );

    // Invalidate lists that might show stock status
    this.queryClient.invalidateQueries({
      queryKey: productQueryKeys.lists(),
      exact: false,
    });
  }

  /**
   * Handle real-time price update
   */
  onPriceUpdate(productId: string, newPrice: number) {
    // Update product in cache
    this.queryClient.setQueryData(
      productQueryKeys.detail(productId),
      (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          price: newPrice,
          updatedAt: new Date().toISOString(),
        };
      }
    );

    // Invalidate cart if product is in cart
    const cartData = this.queryClient.getQueryData<any>(cartQueryKeys.summary());
    const isInCart = cartData?.items?.some((item: any) => item.productId === productId);

    if (isInCart) {
      this.queryClient.invalidateQueries({ queryKey: cartQueryKeys.summary() });
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.queryClient.clear();
  }

  /**
   * Reset specific domain caches
   */
  resetDomainCache(domain: 'products' | 'auth' | 'cart' | 'orders') {
    const keyMap = {
      products: productQueryKeys.all,
      auth: authQueryKeys.all,
      cart: cartQueryKeys.all,
      orders: orderQueryKeys.all,
    };

    this.queryClient.removeQueries({ queryKey: keyMap[domain] });
  }

  /**
   * Garbage collect stale queries
   */
  garbageCollect() {
    this.queryClient.getQueryCache().getAll().forEach(query => {
      const state = query.state;
      const lastFetch = state.dataUpdatedAt;
      const now = Date.now();
      const staleTime = 1000 * 60 * 60 * 24; // 24 hours

      // Remove queries that haven't been accessed in 24 hours
      if (lastFetch && now - lastFetch > staleTime) {
        this.queryClient.removeQueries({ queryKey: query.queryKey });
      }
    });
  }

  /**
   * Prefetch commonly accessed data
   */
  async prefetchCommonData() {
    const { productApiService } = await import('@/services/api/products');

    await Promise.all([
      // Prefetch featured products
      this.queryClient.prefetchQuery({
        queryKey: productQueryKeys.featured(12),
        queryFn: async () => {
          const response = await productApiService.getProducts(
            { page: 1, limit: 12 },
            { featured: true }
          );
          return response.products;
        },
      }),
      // Prefetch trending products
      this.queryClient.prefetchQuery({
        queryKey: productQueryKeys.trending('week'),
        queryFn: async () => {
          const response = await productApiService.getTrendingProducts('week', 12);
          return response.products;
        },
      }),
    ]);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const cache = this.queryClient.getQueryCache();
    const queries = cache.getAll();

    return {
      totalQueries: queries.length,
      activeQueries: queries.filter(q => q.state.fetchStatus === 'fetching').length,
      staleQueries: queries.filter(q => q.isStale()).length,
      cacheSize: JSON.stringify(
        queries.map(q => q.state.data)
      ).length,
    };
  }
}

// Export singleton instance
let cacheManager: CacheManager | null = null;

export function getCacheManager(queryClient: QueryClient) {
  if (!cacheManager) {
    cacheManager = new CacheManager(queryClient);
  }
  return cacheManager;
}

// Export utility functions for direct use

/**
 * Invalidate and refetch all product-related queries
 */
export function invalidateProductQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: productQueryKeys.all });
}

/**
 * Invalidate and refetch all auth-related queries
 */
export function invalidateAuthQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
}

/**
 * Invalidate and refetch all cart-related queries
 */
export function invalidateCartQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: cartQueryKeys.all });
}

/**
 * Invalidate and refetch all order-related queries
 */
export function invalidateOrderQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
}

/**
 * Smart invalidation based on data relationships
 */
export async function smartInvalidate(
  queryClient: QueryClient,
  type: 'product' | 'user' | 'order' | 'cart',
  id?: string
) {
  const manager = getCacheManager(queryClient);

  switch (type) {
    case 'product':
      if (id) {
        await manager.onProductUpdate(id);
      } else {
        await manager.onBulkProductChange();
      }
      break;

    case 'user':
      await invalidateAuthQueries(queryClient);
      await invalidateCartQueries(queryClient);
      await invalidateOrderQueries(queryClient);
      break;

    case 'order':
      if (id) {
        await manager.onOrderStatusUpdate(id, 'updated');
      } else {
        await invalidateOrderQueries(queryClient);
      }
      break;

    case 'cart':
      await invalidateCartQueries(queryClient);
      break;
  }
}