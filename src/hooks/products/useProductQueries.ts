/**
 * Product React Query Hooks
 * Comprehensive product data fetching with caching, prefetching, and optimistic updates
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
import { productApiService, type Product, type ProductFilters, type ProductSortOptions, type ProductsResponse } from '@/services/api/products';
import { STALE_TIME, CACHE_TIME, createQueryKeys, queryCache } from '@/lib/react-query/config';
import { toast } from 'sonner';

// Query keys factory for products
export const productQueryKeys = createQueryKeys<ProductFilters>('products');

// Additional specialized query keys
export const productKeys = {
  ...productQueryKeys,
  featured: (limit: number = 12) => ['products', 'featured', limit] as const,
  trending: (period: 'day' | 'week' | 'month' = 'week') => ['products', 'trending', period] as const,
  byBrand: (brandId: string, filters?: ProductFilters) => ['products', 'brand', brandId, filters] as const,
  byCategory: (category: string, filters?: ProductFilters) => ['products', 'category', category, filters] as const,
  similar: (productId: string, limit: number = 8) => ['products', 'similar', productId, limit] as const,
  recommendations: (userId?: string) => ['products', 'recommendations', userId] as const,
};

// ===== QUERY HOOKS =====

/**
 * Fetch a single product by ID
 */
export function useProduct(
  productId: string | undefined,
  options?: UseQueryOptions<Product, Error>
) {
  return useQuery({
    queryKey: productKeys.detail(productId!),
    queryFn: () => productApiService.getById(productId!),
    enabled: !!productId,
    staleTime: STALE_TIME.NORMAL,
    gcTime: CACHE_TIME.LONG,
    ...options,
  });
}

/**
 * Fetch products list with filters and pagination
 */
export function useProducts(
  filters?: ProductFilters,
  sort?: ProductSortOptions,
  options?: UseQueryOptions<ProductsResponse, Error>
) {
  return useQuery({
    queryKey: productKeys.list({ ...filters, sort } as any),
    queryFn: () => productApiService.getProducts(
      {
        page: filters?.page || 1,
        limit: filters?.limit || 20,
      },
      filters,
      sort
    ),
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Infinite scrolling for products
 */
export function useInfiniteProducts(
  filters?: ProductFilters,
  sort?: ProductSortOptions,
  options?: UseInfiniteQueryOptions<ProductsResponse, Error>
) {
  return useInfiniteQuery({
    queryKey: productKeys.infinite({ ...filters, sort } as any),
    queryFn: ({ pageParam = 1 }) =>
      productApiService.getProducts(
        {
          page: pageParam,
          limit: filters?.limit || 20,
        },
        filters,
        sort
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Fetch featured products
 */
export function useFeaturedProducts(
  limit: number = 12,
  options?: UseQueryOptions<Product[], Error>
) {
  return useQuery({
    queryKey: productKeys.featured(limit),
    queryFn: async () => {
      const response = await productApiService.getProducts(
        { page: 1, limit },
        { featured: true }
      );
      return response.products;
    },
    staleTime: STALE_TIME.MODERATE,
    gcTime: CACHE_TIME.LONG,
    ...options,
  });
}

/**
 * Fetch trending products
 */
export function useTrendingProducts(
  period: 'day' | 'week' | 'month' = 'week',
  limit: number = 12,
  options?: UseQueryOptions<Product[], Error>
) {
  return useQuery({
    queryKey: productKeys.trending(period),
    queryFn: async () => {
      const response = await productApiService.getTrendingProducts(period, limit);
      return response.products;
    },
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Fetch products by brand
 */
export function useProductsByBrand(
  brandId: string | undefined,
  filters?: ProductFilters,
  options?: UseQueryOptions<ProductsResponse, Error>
) {
  return useQuery({
    queryKey: productKeys.byBrand(brandId!, filters),
    queryFn: () => productApiService.getProducts(
      { page: 1, limit: 20 },
      { ...filters, brandIds: [brandId!] }
    ),
    enabled: !!brandId,
    staleTime: STALE_TIME.NORMAL,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Fetch products by category
 */
export function useProductsByCategory(
  category: string | undefined,
  filters?: ProductFilters,
  options?: UseQueryOptions<ProductsResponse, Error>
) {
  return useQuery({
    queryKey: productKeys.byCategory(category!, filters),
    queryFn: () => productApiService.getProducts(
      { page: 1, limit: 20 },
      { ...filters, category }
    ),
    enabled: !!category,
    staleTime: STALE_TIME.NORMAL,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Fetch similar products
 */
export function useSimilarProducts(
  productId: string | undefined,
  limit: number = 8,
  options?: UseQueryOptions<Product[], Error>
) {
  return useQuery({
    queryKey: productKeys.similar(productId!, limit),
    queryFn: () => productApiService.getSimilarProducts(productId!, limit),
    enabled: !!productId,
    staleTime: STALE_TIME.MODERATE,
    gcTime: CACHE_TIME.LONG,
    ...options,
  });
}

/**
 * Search products with debounced query
 */
export function useProductSearch(
  searchQuery: string,
  options?: UseQueryOptions<ProductsResponse, Error>
) {
  return useQuery({
    queryKey: productKeys.search(searchQuery),
    queryFn: () => productApiService.searchProducts(searchQuery, 20),
    enabled: searchQuery.length >= 2,
    staleTime: STALE_TIME.INSTANT,
    gcTime: CACHE_TIME.SHORT,
    ...options,
  });
}

// ===== MUTATION HOOKS =====

/**
 * Update product mutation with optimistic update
 */
export function useUpdateProduct(
  options?: UseMutationOptions<Product, Error, { id: string; updates: Partial<Product> }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }) => productApiService.updateProduct(id, updates),
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: productKeys.detail(id) });

      // Snapshot previous value
      const previousProduct = queryClient.getQueryData<Product>(productKeys.detail(id));

      // Optimistically update
      if (previousProduct) {
        queryClient.setQueryData<Product>(
          productKeys.detail(id),
          { ...previousProduct, ...updates }
        );
      }

      return { previousProduct };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousProduct) {
        queryClient.setQueryData(
          productKeys.detail(variables.id),
          context.previousProduct
        );
      }
      toast.error('Failed to update product');
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: productKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      toast.success('Product updated successfully');
    },
    ...options,
  });
}

/**
 * Create product mutation
 */
export function useCreateProduct(
  options?: UseMutationOptions<Product, Error, Partial<Product>>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productData) => productApiService.createProduct(productData),
    onSuccess: (data) => {
      // Invalidate lists to include new product
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });

      // Set the new product in cache
      queryClient.setQueryData(productKeys.detail(data.id), data);

      toast.success('Product created successfully');
    },
    onError: () => {
      toast.error('Failed to create product');
    },
    ...options,
  });
}

/**
 * Delete product mutation
 */
export function useDeleteProduct(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId) => productApiService.deleteProduct(productId),
    onSuccess: (_, productId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: productKeys.detail(productId) });

      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });

      toast.success('Product deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete product');
    },
    ...options,
  });
}

// ===== PREFETCH UTILITIES =====

/**
 * Prefetch a single product
 */
export async function prefetchProduct(
  queryClient: QueryClient,
  productId: string
) {
  await queryCache.prefetch(
    queryClient,
    productKeys.detail(productId),
    () => productApiService.getById(productId),
    STALE_TIME.NORMAL
  );
}

/**
 * Prefetch multiple products
 */
export async function prefetchProducts(
  queryClient: QueryClient,
  productIds: string[]
) {
  await Promise.all(
    productIds.map(id => prefetchProduct(queryClient, id))
  );
}

/**
 * Prefetch next page of products
 */
export async function prefetchNextProductPage(
  queryClient: QueryClient,
  currentPage: number,
  filters?: ProductFilters,
  sort?: ProductSortOptions
) {
  const nextPage = currentPage + 1;
  await queryCache.prefetch(
    queryClient,
    productKeys.list({ ...filters, page: nextPage, sort } as any),
    () => productApiService.getProducts(
      { page: nextPage, limit: 20 },
      filters,
      sort
    ),
    STALE_TIME.FREQUENT
  );
}

// ===== CACHE UTILITIES =====

/**
 * Invalidate all product queries
 */
export function invalidateAllProducts(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: productKeys.all });
}

/**
 * Update a product in cache without refetching
 */
export function updateProductInCache(
  queryClient: QueryClient,
  productId: string,
  updates: Partial<Product>
) {
  queryClient.setQueryData<Product>(
    productKeys.detail(productId),
    (old) => old ? { ...old, ...updates } : old
  );
}

/**
 * Remove a product from all list caches
 */
export function removeProductFromLists(
  queryClient: QueryClient,
  productId: string
) {
  queryClient.setQueriesData<ProductsResponse>(
    { queryKey: productKeys.lists() },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        products: old.products.filter(p => p.id !== productId),
        total: old.total - 1,
      };
    }
  );
}