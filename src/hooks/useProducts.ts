import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ProductService, type Product } from '@/services/products'
import {
  productApiService,
  type Product as EnhancedProduct,
  type ProductFilters as EnhancedProductFilters,
  type ProductSortOptions
} from '@/services/api/products'

export interface ProductsFilters {
  search?: string
  brandName?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  sortBy?: 'name' | 'price' | 'releaseDate' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// Query Keys Factory
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: ProductsFilters) => [...productKeys.lists(), filters] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  featured: (limit: number) => [...productKeys.all, 'featured', limit] as const,
  brands: () => [...productKeys.all, 'brands'] as const,
  categories: () => [...productKeys.all, 'categories'] as const,
  search: (query: string, limit: number) => [...productKeys.all, 'search', query, limit] as const,
  byBrand: (brandName: string, limit: number) => [...productKeys.all, 'brand', brandName, limit] as const,
}

// Enhanced products list with comprehensive filtering
export function useProducts(filters: ProductsFilters = {}) {
  const { limit = 20, search, brandName, category, minPrice, maxPrice, sortBy = 'createdAt', sortOrder = 'desc', ...otherFilters } = filters

  // Transform legacy filters to new format
  const enhancedFilters: EnhancedProductFilters = {
    brand: brandName,
    category,
    minPrice,
    maxPrice,
    search,
    ...otherFilters
  }

  // Transform legacy sort options to new format
  const sortOptions: ProductSortOptions = {
    field: sortBy === 'releaseDate' ? 'release_date' : sortBy === 'createdAt' ? 'created_at' : sortBy,
    direction: sortOrder
  }

  return useQuery({
    queryKey: productKeys.list({ limit, ...filters }),
    queryFn: async () => {
      if (search) {
        // Use search API if search query provided
        const response = await productApiService.searchProducts(
          search,
          { page: 1, limit },
          enhancedFilters,
          sortOptions
        )
        if (response.error) throw response.error
        return response.data!.products
      } else {
        // Use regular products API
        const response = await productApiService.getProducts(
          { page: 1, limit },
          enhancedFilters,
          sortOptions
        )
        if (response.error) throw response.error
        return response.data!.products
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

// Get single product with detailed caching
export function useProduct(productId?: string) {
  return useQuery({
    queryKey: productKeys.detail(productId!),
    queryFn: async () => {
      const response = await productApiService.getProduct(productId!)
      if (response.error) throw response.error
      return response.data!
    },
    enabled: !!productId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
  })
}

// Featured products with optimized caching
export function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: productKeys.featured(limit),
    queryFn: async () => {
      const response = await productApiService.getFeaturedProducts(limit)
      if (response.error) throw response.error
      return response.data!
    },
    staleTime: 15 * 60 * 1000, // 15 minutes (featured products change less frequently)
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
  })
}

// Products by brand with enhanced error handling
export function useProductsByBrand(brandName: string, limit = 20) {
  return useQuery({
    queryKey: productKeys.byBrand(brandName, limit),
    queryFn: () => ProductService.getProductsByBrand(brandName, limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!brandName && brandName.length > 0,
    retry: 3,
  })
}

// Enhanced search with debouncing-like behavior through React Query
export function useSearchProducts(query: string, limit = 20) {
  return useQuery({
    queryKey: productKeys.search(query, limit),
    queryFn: async () => {
      const response = await productApiService.searchProducts(
        query,
        { page: 1, limit },
        {},
        { field: 'name', direction: 'asc' }
      )
      if (response.error) throw response.error
      return response.data!.products
    },
    staleTime: 2 * 60 * 1000, // 2 minutes (search results become stale faster)
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!query && query.length > 2,
    retry: 2, // Fewer retries for search
  })
}

// Get available brands
export function useBrands() {
  return useQuery({
    queryKey: productKeys.brands(),
    queryFn: async () => {
      const response = await productApiService.getBrands()
      if (response.error) throw response.error
      return response.data!
    },
    staleTime: 60 * 60 * 1000, // 1 hour (brands don't change often)
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 3,
  })
}

// Get available categories
export function useCategories() {
  return useQuery({
    queryKey: productKeys.categories(),
    queryFn: async () => {
      const response = await productApiService.getCategories()
      if (response.error) throw response.error
      return response.data!
    },
    staleTime: 60 * 60 * 1000, // 1 hour (categories don't change often)
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 3,
  })
}

// Utility hooks for cache management
export function usePrefetchProduct() {
  const queryClient = useQueryClient()

  return (productId: string) => {
    queryClient.prefetchQuery({
      queryKey: productKeys.detail(productId),
      queryFn: async () => {
        const response = await productApiService.getProduct(productId)
        if (response.error) throw response.error
        return response.data!
      },
      staleTime: 10 * 60 * 1000,
    })
  }
}

export function useInvalidateProducts() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: productKeys.all })
  }
}

// Mutations for product operations (admin/vendor use)
export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (productData: Partial<Product>) =>
      ProductService.createProduct?.(productData) || Promise.reject('Method not available'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.all })
    },
    onError: (error) => {
      console.error('Failed to create product:', error)
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      ProductService.updateProduct?.(id, data) || Promise.reject('Method not available'),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.all })
    },
    onError: (error) => {
      console.error('Failed to update product:', error)
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      ProductService.deleteProduct?.(id) || Promise.reject('Method not available'),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: productKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.all })
    },
    onError: (error) => {
      console.error('Failed to delete product:', error)
    },
  })
}