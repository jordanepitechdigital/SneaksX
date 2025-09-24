/**
 * Product API Adapter
 * Adapts the working ProductService to the enhanced API interface
 * Provides BaseApiService compatibility while using the proven ProductService backend
 */

import { BaseApiService, type ApiResponse, type PaginationParams } from './base'
import { ProductService } from '../products'
import type {
  Product as LegacyProduct,
  ProductFilters as LegacyProductFilters,
  ProductSortOptions as LegacySortOptions,
  ProductsResponse as LegacyProductsResponse
} from '../products'

// Enhanced types that match the API service interface
export interface Product extends LegacyProduct {
  brandId?: string
  retailPrice?: number
  marketplace?: 'stockx' | 'goat'
  releaseDate?: string
  gender?: 'men' | 'women' | 'unisex'
  colorway?: string
  sku?: string
}

export interface ProductFilters extends LegacyProductFilters {
  brandIds?: string[]
  categories?: string[]
  gender?: 'men' | 'women' | 'unisex'
  colors?: string[]
  featured?: boolean
  releasedAfter?: string
  releasedBefore?: string
  search?: string
}

export interface ProductSortOptions {
  field: 'name' | 'price' | 'retail_price' | 'release_date' | 'created_at' | 'popularity'
  direction: 'asc' | 'desc'
}

export interface ProductsResponse {
  products: Product[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface ProductRecommendations {
  similar: Product[]
  recentlyViewed: Product[]
  popular: Product[]
  crossSell: Product[]
}

export interface SearchSuggestion {
  id: string
  text: string
  type: 'product' | 'brand' | 'category'
  count?: number
}

class ProductApiAdapter extends BaseApiService {
  constructor() {
    super('products')
  }

  async getProducts(
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: ProductFilters = {},
    sort: ProductSortOptions = { field: 'created_at', direction: 'desc' }
  ): Promise<ApiResponse<ProductsResponse>> {
    return this.handleApiCall(async () => {
      // Convert to legacy format
      const legacyFilters: LegacyProductFilters = {
        brand: filters.brand,
        category: filters.category,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sizes: filters.sizes,
        inStock: filters.inStock
      }

      const legacySort: LegacySortOptions = {
        field: sort.field === 'retail_price' ? 'price' :
               sort.field === 'release_date' ? 'createdAt' :
               sort.field === 'popularity' ? 'createdAt' :
               sort.field,
        direction: sort.direction
      }

      // Use the working ProductService
      const response = await ProductService.getProducts(
        { page: pagination.page || 1, limit: pagination.limit || 20 },
        legacyFilters,
        legacySort
      )

      if (!response.success) {
        throw response.error
      }

      // Transform to enhanced format
      const enhancedProducts: Product[] = response.data.products.map(this.transformToEnhanced)

      const result: ProductsResponse = {
        products: enhancedProducts,
        total: response.data.total,
        page: response.data.page,
        limit: response.data.limit,
        totalPages: response.data.totalPages,
        hasNextPage: response.data.hasNextPage,
        hasPrevPage: response.data.hasPrevPage
      }

      return { data: result, error: null }
    })
  }

  async getProduct(id: string): Promise<ApiResponse<Product>> {
    return this.handleApiCall(async () => {
      // Get from the legacy service (would need to be implemented)
      const response = await ProductService.getProducts({ page: 1, limit: 50 })

      if (!response.success) {
        throw response.error
      }

      const product = response.data.products.find(p => p.id === id)

      if (!product) {
        throw new Error('Product not found')
      }

      return { data: this.transformToEnhanced(product), error: null }
    })
  }

  async searchProducts(
    query: string,
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: ProductFilters = {},
    sort: ProductSortOptions = { field: 'name', direction: 'asc' }
  ): Promise<ApiResponse<ProductsResponse>> {
    return this.handleApiCall(async () => {
      const response = await ProductService.searchProducts(
        query,
        { page: pagination.page || 1, limit: pagination.limit || 20 },
        {
          brand: filters.brand,
          category: filters.category,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          sizes: filters.sizes,
          inStock: filters.inStock
        },
        {
          field: sort.field === 'retail_price' ? 'price' : sort.field,
          direction: sort.direction
        }
      )

      const enhancedProducts: Product[] = response.products.map(this.transformToEnhanced)

      const result: ProductsResponse = {
        products: enhancedProducts,
        total: response.total,
        page: response.page,
        limit: response.limit,
        totalPages: response.totalPages,
        hasNextPage: response.hasNextPage,
        hasPrevPage: response.hasPrevPage
      }

      return { data: result, error: null }
    })
  }

  async getSearchSuggestions(query: string, limit = 10): Promise<ApiResponse<SearchSuggestion[]>> {
    return this.handleApiCall(async () => {
      if (!query || query.length < 2) {
        return { data: [], error: null }
      }

      // Get search results as suggestions
      const searchResponse = await ProductService.searchProducts(query, { page: 1, limit: Math.ceil(limit * 0.8) })

      const suggestions: SearchSuggestion[] = searchResponse.products.map(product => ({
        id: product.id,
        text: product.name,
        type: 'product' as const
      }))

      // Add brand suggestions
      const uniqueBrands = [...new Set(searchResponse.products.map(p => p.brand))]
        .slice(0, Math.ceil(limit * 0.2))
        .map(brand => ({
          id: brand,
          text: brand,
          type: 'brand' as const
        }))

      const allSuggestions = [...suggestions, ...uniqueBrands].slice(0, limit)

      return { data: allSuggestions, error: null }
    })
  }

  async getFeaturedProducts(limit = 8): Promise<ApiResponse<Product[]>> {
    return this.handleApiCall(async () => {
      const response = await ProductService.getFeaturedProducts(limit)
      const enhancedProducts = response.map(this.transformToEnhanced)
      return { data: enhancedProducts, error: null }
    })
  }

  async getRecommendations(
    productId?: string,
    userId?: string,
    limit = 20
  ): Promise<ApiResponse<ProductRecommendations>> {
    return this.handleApiCall(async () => {
      const recommendations: ProductRecommendations = {
        similar: [],
        recentlyViewed: [],
        popular: [],
        crossSell: []
      }

      // Get similar products by brand
      if (productId) {
        try {
          const allProducts = await ProductService.getProducts({ page: 1, limit: 1000 })
          if (allProducts.success) {
            const targetProduct = allProducts.data.products.find(p => p.id === productId)
            if (targetProduct) {
              const similarProducts = allProducts.data.products
                .filter(p => p.id !== productId && p.brand === targetProduct.brand)
                .slice(0, Math.ceil(limit * 0.4))
                .map(this.transformToEnhanced)

              recommendations.similar = similarProducts
            }
          }
        } catch (error) {
          console.warn('Failed to get similar products:', error)
        }
      }

      // Get popular products (use featured as fallback)
      try {
        const featuredProducts = await ProductService.getFeaturedProducts(Math.ceil(limit * 0.6))
        recommendations.popular = featuredProducts.map(this.transformToEnhanced)
      } catch (error) {
        console.warn('Failed to get popular products:', error)
      }

      return { data: recommendations, error: null }
    })
  }

  async getBrands(): Promise<ApiResponse<Array<{ id: string; name: string; productCount: number }>>> {
    return this.handleApiCall(async () => {
      // Get all products to extract brands
      const response = await ProductService.getProducts({ page: 1, limit: 50 })

      if (!response.success) {
        throw response.error
      }

      // Count products per brand
      const brandCounts = new Map<string, number>()
      response.data.products.forEach(product => {
        const count = brandCounts.get(product.brand) || 0
        brandCounts.set(product.brand, count + 1)
      })

      const brands = Array.from(brandCounts.entries())
        .map(([name, count]) => ({
          id: name.toLowerCase().replace(/\s+/g, '-'),
          name,
          productCount: count
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return { data: brands, error: null }
    })
  }

  async getCategories(): Promise<ApiResponse<Array<{ name: string; count: number }>>> {
    return this.handleApiCall(async () => {
      // Get all products to extract categories
      const response = await ProductService.getProducts({ page: 1, limit: 50 })

      if (!response.success) {
        throw response.error
      }

      // Count products per category
      const categoryCounts = new Map<string, number>()
      response.data.products.forEach(product => {
        const count = categoryCounts.get(product.category) || 0
        categoryCounts.set(product.category, count + 1)
      })

      const categories = Array.from(categoryCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return { data: categories, error: null }
    })
  }

  // Clear cache (adapter doesn't have its own cache, clears ProductService cache)
  clearCache(): void {
    ProductService.clearCache()
  }

  private transformToEnhanced(legacyProduct: LegacyProduct): Product {
    return {
      ...legacyProduct,
      brandId: legacyProduct.brand.toLowerCase().replace(/\s+/g, '-'),
      retailPrice: legacyProduct.price,
      marketplace: 'stockx' as const,
      releaseDate: legacyProduct.createdAt,
      gender: 'unisex' as const,
      colorway: 'Default',
      sku: `SKU-${legacyProduct.id.slice(-8)}`
    }
  }
}

// Export singleton instance
export const productApiService = new ProductApiAdapter()
export default productApiService