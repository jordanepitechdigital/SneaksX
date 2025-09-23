import { useQuery } from '@tanstack/react-query'
import { ProductService, type Product } from '@/services/products'

export function useProducts(limit = 20) {
  return useQuery({
    queryKey: ['products', limit],
    queryFn: () => ProductService.getProducts(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: ['products', 'featured', limit],
    queryFn: () => ProductService.getFeaturedProducts(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useProductsByBrand(brandName: string, limit = 20) {
  return useQuery({
    queryKey: ['products', 'brand', brandName, limit],
    queryFn: () => ProductService.getProductsByBrand(brandName, limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!brandName,
  })
}

export function useSearchProducts(query: string, limit = 20) {
  return useQuery({
    queryKey: ['products', 'search', query, limit],
    queryFn: () => ProductService.searchProducts(query, limit),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!query && query.length > 2,
  })
}