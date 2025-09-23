import { supabase } from '@/lib/supabase/client'
import type { DBProduct } from '@/types/database'

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiry: number
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>()
  private readonly defaultTTL = 5 * 60 * 1000 // 5 minutes

  set<T>(key: string, data: T, ttl = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + ttl
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  clear(): void {
    this.cache.clear()
  }

  generateKey(parts: (string | number | boolean | undefined)[]): string {
    return parts.filter(p => p !== undefined).join(':')
  }
}

export enum ProductErrorCode {
  FETCH_FAILED = 'FETCH_FAILED',
  SEARCH_FAILED = 'SEARCH_FAILED',
  INVALID_FILTERS = 'INVALID_FILTERS',
  INVALID_PAGINATION = 'INVALID_PAGINATION',
  INVALID_SORT_OPTIONS = 'INVALID_SORT_OPTIONS',
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  DATABASE_ERROR = 'DATABASE_ERROR'
}

export class ProductError extends Error {
  constructor(
    public code: ProductErrorCode,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'ProductError'
  }
}

export type ProductServiceResult<T> = {
  success: true
  data: T
} | {
  success: false
  error: ProductError
}

export interface Product {
  id: string
  name: string
  brand: string
  price: number
  imageUrl: string
  description?: string
  category: string
  sizes: string[]
  stockCount: number
  createdAt: string
}

export interface ProductFilters {
  brand?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  sizes?: string[]
  inStock?: boolean
}

export interface ProductSortOptions {
  field: 'name' | 'price' | 'created_at' | 'brand'
  direction: 'asc' | 'desc'
}

export interface PaginationOptions {
  page: number
  limit: number
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

export class ProductService {
  private static cache = new SimpleCache()

  static clearCache(): void {
    this.cache.clear()
  }
  private static validatePagination(pagination: PaginationOptions): void {
    if (pagination.page < 1) {
      throw new ProductError(
        ProductErrorCode.INVALID_PAGINATION,
        'Page must be greater than 0',
        { page: pagination.page }
      )
    }

    if (pagination.limit < 1 || pagination.limit > 100) {
      throw new ProductError(
        ProductErrorCode.INVALID_PAGINATION,
        'Limit must be between 1 and 100',
        { limit: pagination.limit }
      )
    }
  }

  private static validateFilters(filters: ProductFilters): void {
    if (filters.minPrice !== undefined && filters.minPrice < 0) {
      throw new ProductError(
        ProductErrorCode.INVALID_FILTERS,
        'Minimum price cannot be negative',
        { minPrice: filters.minPrice }
      )
    }

    if (filters.maxPrice !== undefined && filters.maxPrice < 0) {
      throw new ProductError(
        ProductErrorCode.INVALID_FILTERS,
        'Maximum price cannot be negative',
        { maxPrice: filters.maxPrice }
      )
    }

    if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
      throw new ProductError(
        ProductErrorCode.INVALID_FILTERS,
        'Minimum price cannot be greater than maximum price',
        { minPrice: filters.minPrice, maxPrice: filters.maxPrice }
      )
    }
  }

  private static validateSortOptions(sort: ProductSortOptions): void {
    const validFields = ['name', 'price', 'created_at', 'brand'] as const
    const validDirections = ['asc', 'desc'] as const

    if (!validFields.includes(sort.field)) {
      throw new ProductError(
        ProductErrorCode.INVALID_SORT_OPTIONS,
        `Invalid sort field: ${sort.field}`,
        { field: sort.field, validFields }
      )
    }

    if (!validDirections.includes(sort.direction)) {
      throw new ProductError(
        ProductErrorCode.INVALID_SORT_OPTIONS,
        `Invalid sort direction: ${sort.direction}`,
        { direction: sort.direction, validDirections }
      )
    }
  }
  static async getProducts(
    pagination: PaginationOptions = { page: 1, limit: 20 },
    filters: ProductFilters = {},
    sort: ProductSortOptions = { field: 'created_at', direction: 'desc' }
  ): Promise<ProductServiceResult<ProductsResponse>> {
    try {
      this.validatePagination(pagination)
      this.validateFilters(filters)
      this.validateSortOptions(sort)

      // Generate cache key
      const cacheKey = this.cache.generateKey([
        'products',
        pagination.page,
        pagination.limit,
        filters.brand,
        filters.category,
        filters.minPrice,
        filters.maxPrice,
        filters.inStock,
        filters.sizes?.sort().join(','),
        sort.field,
        sort.direction
      ])

      // Check cache first
      const cachedResult = this.cache.get<ProductsResponse>(cacheKey)
      if (cachedResult) {
        return { success: true, data: cachedResult }
      }

      const { page, limit } = pagination
      const offset = (page - 1) * limit

      let query = supabase
        .from('products')
        .select(`
          *,
          brands (
            name,
            slug
          ),
          product_stock (
            size,
            quantity,
            reserved_quantity
          ),
          product_images (
            image_url,
            is_primary
          )
        `, { count: 'exact' })
        .eq('is_active', true)

      // Apply filters
      if (filters.brand) {
        query = query.eq('brands.name', filters.brand)
      }

      if (filters.category) {
        query = query.eq('category', filters.category)
      }

      if (filters.minPrice !== undefined) {
        query = query.gte('current_price', filters.minPrice)
      }

      if (filters.maxPrice !== undefined) {
        query = query.lte('current_price', filters.maxPrice)
      }

      if (filters.inStock === true) {
        query = query.gt('product_stock.quantity', 0)
      }

      if (filters.sizes && filters.sizes.length > 0) {
        query = query.in('product_stock.size', filters.sizes)
      }

      // Apply sorting
      const sortField = sort.field === 'brand' ? 'brands.name' : sort.field
      query = query.order(sortField, { ascending: sort.direction === 'asc' })

      // Apply pagination
      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) {
        return {
          success: false,
          error: new ProductError(
            ProductErrorCode.DATABASE_ERROR,
            `Failed to fetch products: ${error.message}`,
            { supabaseError: error }
          )
        }
      }

      const products = (data || []).map(this.transformProduct)
      const total = count || 0
      const totalPages = Math.ceil(total / limit)

      const result = {
        products,
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }

      // Cache the result
      this.cache.set(cacheKey, result)

      return {
        success: true,
        data: result
      }
    } catch (error) {
      if (error instanceof ProductError) {
        return { success: false, error }
      }

      return {
        success: false,
        error: new ProductError(
          ProductErrorCode.FETCH_FAILED,
          `Unexpected error while fetching products: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { originalError: error }
        )
      }
    }
  }

  static async getProductsLegacy(limit = 20): Promise<Product[]> {
    const response = await this.getProducts({ page: 1, limit })
    if (response.success) {
      return response.data.products
    }
    throw response.error
  }

  static async getFeaturedProducts(limit = 8): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        brands (
          name,
          slug
        ),
        product_stock (
          size,
          quantity,
          reserved_quantity
        ),
        product_images (
          image_url,
          is_primary
        )
      `)
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch featured products: ${error.message}`)
    }

    return (data || []).map(this.transformProduct)
  }

  static async getProductsByBrand(brandName: string, limit = 20): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        brands!inner (
          name,
          slug
        ),
        product_stock (
          size,
          quantity,
          reserved_quantity
        ),
        product_images (
          image_url,
          is_primary
        )
      `)
      .eq('brands.name', brandName)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch products by brand: ${error.message}`)
    }

    return (data || []).map(this.transformProduct)
  }

  static async searchProducts(
    query: string,
    pagination: PaginationOptions = { page: 1, limit: 20 },
    filters: ProductFilters = {},
    sort: ProductSortOptions = { field: 'created_at', direction: 'desc' }
  ): Promise<ProductsResponse> {
    const { page, limit } = pagination
    const offset = (page - 1) * limit

    let searchQuery = supabase
      .from('products')
      .select(`
        *,
        brands (
          name,
          slug
        ),
        product_stock (
          size,
          quantity,
          reserved_quantity
        ),
        product_images (
          image_url,
          is_primary
        )
      `, { count: 'exact' })
      .or(`name.ilike.%${query}%,description.ilike.%${query}%,brands.name.ilike.%${query}%`)
      .eq('is_active', true)

    // Apply additional filters
    if (filters.brand) {
      searchQuery = searchQuery.eq('brands.name', filters.brand)
    }

    if (filters.category) {
      searchQuery = searchQuery.eq('category', filters.category)
    }

    if (filters.minPrice !== undefined) {
      searchQuery = searchQuery.gte('current_price', filters.minPrice)
    }

    if (filters.maxPrice !== undefined) {
      searchQuery = searchQuery.lte('current_price', filters.maxPrice)
    }

    if (filters.inStock === true) {
      searchQuery = searchQuery.gt('product_stock.quantity', 0)
    }

    if (filters.sizes && filters.sizes.length > 0) {
      searchQuery = searchQuery.in('product_stock.size', filters.sizes)
    }

    // Apply sorting
    const sortField = sort.field === 'brand' ? 'brands.name' : sort.field
    searchQuery = searchQuery.order(sortField, { ascending: sort.direction === 'asc' })

    // Apply pagination
    searchQuery = searchQuery.range(offset, offset + limit - 1)

    const { data, error, count } = await searchQuery

    if (error) {
      throw new Error(`Failed to search products: ${error.message}`)
    }

    const products = (data || []).map(this.transformProduct)
    const total = count || 0
    const totalPages = Math.ceil(total / limit)

    return {
      products,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  }

  static async searchProductsLegacy(query: string, limit = 20): Promise<Product[]> {
    const response = await this.searchProducts(query, { page: 1, limit })
    return response.products
  }

  private static transformProduct(dbProduct: any): Product {
    const stockEntries = dbProduct.product_stock || []
    const totalStock = stockEntries.reduce((sum: number, entry: any) =>
      sum + Math.max(0, (entry.quantity || 0) - (entry.reserved_quantity || 0)), 0
    )

    const availableSizes = stockEntries
      .filter((entry: any) => (entry.quantity - (entry.reserved_quantity || 0)) > 0)
      .map((entry: any) => entry.size)
      .sort()

    // Get primary image or first available image
    const images = dbProduct.product_images || []
    const primaryImage = images.find((img: any) => img.is_primary)
    let imageUrl = primaryImage?.image_url || images[0]?.image_url

    if (!imageUrl) {
      // Create diverse sneaker images based on product characteristics
      const imageVariants = [
        'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=800&fit=crop&crop=center', // Classic sneaker
        'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&h=800&fit=crop&crop=center', // White sneaker
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&h=800&fit=crop&crop=center', // Red sneaker
        'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&h=800&fit=crop&crop=center', // Black sneaker
        'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&h=800&fit=crop&crop=center', // Blue sneaker
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop&crop=center', // Green sneaker
        'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&h=800&fit=crop&crop=center', // Running shoe
        'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=800&h=800&fit=crop&crop=center', // High-top sneaker
        'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=800&fit=crop&crop=center', // Modern sneaker
        'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=800&h=800&fit=crop&crop=center', // Athletic shoe
      ]

      // Create a simple hash from product ID to ensure consistency
      const productHash = dbProduct.id.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0)
        return a & a
      }, 0)

      const imageIndex = Math.abs(productHash) % imageVariants.length
      imageUrl = imageVariants[imageIndex]
    }

    return {
      id: dbProduct.id,
      name: dbProduct.name,
      brand: dbProduct.brands?.name || 'Unknown',
      price: parseFloat(dbProduct.retail_price || dbProduct.current_price || '0'),
      imageUrl,
      description: dbProduct.description,
      category: 'Sneakers', // Could be enhanced with actual category data
      sizes: availableSizes,
      stockCount: totalStock,
      createdAt: dbProduct.created_at
    }
  }
}