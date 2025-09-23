import { useQuery } from '@tanstack/react-query'
import { BrandService, type Brand } from '@/services/brands'

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: () => BrandService.getBrands(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

export function useFeaturedBrands(limit = 6) {
  return useQuery({
    queryKey: ['brands', 'featured', limit],
    queryFn: () => BrandService.getFeaturedBrands(limit),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}