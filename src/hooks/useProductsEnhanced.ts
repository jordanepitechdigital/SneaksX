/**
 * Enhanced Product Hooks
 * React Query hooks for the enhanced ProductApiService
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import {
  productApiService,
  type Product,
  type ProductFilters,
  type ProductSortOptions,
  type ProductsResponse,
  type ProductRecommendations,
  type SearchSuggestion
} from '@/services/api/products-adapter';
import type { PaginationParams } from '@/services/api/base';

// Query Keys Factory
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (pagination: PaginationParams, filters: ProductFilters, sort: ProductSortOptions) =>
    [...productKeys.lists(), { pagination, filters, sort }] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  featured: (limit: number) => [...productKeys.all, 'featured', limit] as const,
  search: (query: string, pagination: PaginationParams, filters: ProductFilters, sort: ProductSortOptions) =>
    [...productKeys.all, 'search', { query, pagination, filters, sort }] as const,
  suggestions: (query: string) => [...productKeys.all, 'suggestions', query] as const,
  recommendations: (productId?: string, userId?: string) =>
    [...productKeys.all, 'recommendations', { productId, userId }] as const,
  brands: () => [...productKeys.all, 'brands'] as const,
  categories: () => [...productKeys.all, 'categories'] as const,
  infinite: (filters: ProductFilters, sort: ProductSortOptions) =>
    [...productKeys.all, 'infinite', { filters, sort }] as const,
} as const;

// Enhanced products list with comprehensive filtering and pagination
export function useProducts(
  pagination: PaginationParams = { page: 1, limit: 20 },
  filters: ProductFilters = {},
  sort: ProductSortOptions = { field: 'created_at', direction: 'desc' }
) {
  return useQuery({
    queryKey: productKeys.list(pagination, filters, sort),
    queryFn: async () => {
      const response = await productApiService.getProducts(pagination, filters, sort);
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

// Infinite scroll products query
export function useInfiniteProducts(
  filters: ProductFilters = {},
  sort: ProductSortOptions = { field: 'created_at', direction: 'desc' },
  limit = 20
) {
  return useInfiniteQuery({
    queryKey: productKeys.infinite(filters, sort),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await productApiService.getProducts(
        { page: pageParam, limit },
        filters,
        sort
      );
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// Get single product with detailed caching
export function useProduct(productId?: string) {
  return useQuery({
    queryKey: productKeys.detail(productId!),
    queryFn: async () => {
      const response = await productApiService.getProduct(productId!);
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    enabled: !!productId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
  });
}

// Featured products with optimized caching
export function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: productKeys.featured(limit),
    queryFn: async () => {
      const response = await productApiService.getFeaturedProducts(limit);
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes (featured products change less frequently)
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
  });
}

// Enhanced search with proper pagination and filtering
export function useProductSearch(
  query: string,
  pagination: PaginationParams = { page: 1, limit: 20 },
  filters: ProductFilters = {},
  sort: ProductSortOptions = { field: 'name', direction: 'asc' }
) {
  return useQuery({
    queryKey: productKeys.search(query, pagination, filters, sort),
    queryFn: async () => {
      const response = await productApiService.searchProducts(query, pagination, filters, sort);
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes (search results become stale faster)
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!query && query.length > 2,
    retry: 2, // Fewer retries for search
  });
}

// Search suggestions hook with debouncing
export function useSearchSuggestions(query: string, limit = 10) {
  return useQuery({
    queryKey: productKeys.suggestions(query),
    queryFn: async () => {
      const response = await productApiService.getSearchSuggestions(query, limit);
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!query && query.length >= 2,
    retry: 1,
  });
}

// Product recommendations hook
export function useProductRecommendations(
  productId?: string,
  userId?: string,
  limit = 20
) {
  return useQuery({
    queryKey: productKeys.recommendations(productId, userId),
    queryFn: async () => {
      const response = await productApiService.getRecommendations(productId, userId, limit);
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
  });
}

// Get available brands
export function useBrands() {
  return useQuery({
    queryKey: productKeys.brands(),
    queryFn: async () => {
      const response = await productApiService.getBrands();
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    staleTime: 60 * 60 * 1000, // 1 hour (brands don't change often)
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 3,
  });
}

// Get available categories
export function useCategories() {
  return useQuery({
    queryKey: productKeys.categories(),
    queryFn: async () => {
      const response = await productApiService.getCategories();
      if (response.error) {
        throw response.error;
      }
      return response.data!;
    },
    staleTime: 60 * 60 * 1000, // 1 hour (categories don't change often)
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 3,
  });
}

// Advanced filtering hook with state management
export function useProductFilters(
  initialFilters: ProductFilters = {},
  initialSort: ProductSortOptions = { field: 'created_at', direction: 'desc' }
) {
  const [filters, setFilters] = useState<ProductFilters>(initialFilters);
  const [sort, setSort] = useState<ProductSortOptions>(initialSort);
  const [pagination, setPagination] = useState<PaginationParams>({ page: 1, limit: 20 });

  // Update filter and reset pagination
  const updateFilter = useCallback((key: keyof ProductFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  // Remove filter and reset pagination
  const removeFilter = useCallback((key: keyof ProductFilters) => {
    setFilters(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({});
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Update sort and reset pagination
  const updateSort = useCallback((newSort: ProductSortOptions) => {
    setSort(newSort);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Update pagination
  const updatePagination = useCallback((newPagination: Partial<PaginationParams>) => {
    setPagination(prev => ({ ...prev, ...newPagination }));
  }, []);

  // Get products with current filters
  const productsQuery = useProducts(pagination, filters, sort);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value =>
      value !== undefined && value !== null && value !== '' &&
      (!Array.isArray(value) || value.length > 0)
    ).length;
  }, [filters]);

  return {
    filters,
    sort,
    pagination,
    updateFilter,
    removeFilter,
    clearFilters,
    updateSort,
    updatePagination,
    productsQuery,
    activeFiltersCount,
  };
}

// Search with filters hook
export function useProductSearchWithFilters(
  initialQuery = '',
  initialFilters: ProductFilters = {},
  initialSort: ProductSortOptions = { field: 'name', direction: 'asc' }
) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ProductFilters>(initialFilters);
  const [sort, setSort] = useState<ProductSortOptions>(initialSort);
  const [pagination, setPagination] = useState<PaginationParams>({ page: 1, limit: 20 });

  // Update query and reset pagination
  const updateQuery = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Update filter and reset pagination
  const updateFilter = useCallback((key: keyof ProductFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({});
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Update sort and reset pagination
  const updateSort = useCallback((newSort: ProductSortOptions) => {
    setSort(newSort);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Get search results
  const searchQuery = useProductSearch(query, pagination, filters, sort);

  // Get search suggestions
  const suggestionsQuery = useSearchSuggestions(query);

  return {
    query,
    filters,
    sort,
    pagination,
    updateQuery,
    updateFilter,
    clearFilters,
    updateSort,
    setPagination,
    searchQuery,
    suggestionsQuery,
  };
}

// Utility hooks for cache management
export function usePrefetchProduct() {
  const queryClient = useQueryClient();

  return useCallback((productId: string) => {
    queryClient.prefetchQuery({
      queryKey: productKeys.detail(productId),
      queryFn: async () => {
        const response = await productApiService.getProduct(productId);
        if (response.error) {
          throw response.error;
        }
        return response.data!;
      },
      staleTime: 10 * 60 * 1000,
    });
  }, [queryClient]);
}

export function useInvalidateProducts() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: productKeys.all });
  }, [queryClient]);
}

// Clear cache hook
export function useClearProductCache() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    productApiService.clearCache();
    queryClient.invalidateQueries({ queryKey: productKeys.all });
  }, [queryClient]);
}

// Custom hook for price range filtering
export function usePriceRange(products: Product[] = []) {
  return useMemo(() => {
    if (products.length === 0) {
      return { min: 0, max: 1000 };
    }

    const prices = products.map(p => p.price).filter(price => price > 0);
    if (prices.length === 0) {
      return { min: 0, max: 1000 };
    }

    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices))
    };
  }, [products]);
}

// Export all types for convenience
export type {
  Product,
  ProductFilters,
  ProductSortOptions,
  ProductsResponse,
  ProductRecommendations,
  SearchSuggestion,
} from '@/services/api/products-adapter';