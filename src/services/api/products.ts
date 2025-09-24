/**
 * Enhanced Products API Service
 * Comprehensive product management service extending BaseApiService
 */

import { BaseApiService, type ApiResponse, type PaginationParams, type FilterParams } from './base';
import { supabase } from '@/lib/supabase/client';
import type { DBProduct } from '@/types/database';

// Enhanced Product Types
export interface Product {
  id: string;
  name: string;
  brand: string;
  brandId: string;
  price: number;
  retailPrice: number;
  imageUrl: string;
  images: ProductImage[];
  description?: string;
  category: string;
  colorway: string;
  sku: string;
  gender: 'men' | 'women' | 'unisex';
  releaseDate: string;
  sizes: ProductSize[];
  stockCount: number;
  status: 'active' | 'inactive' | 'discontinued';
  marketplace: 'stockx' | 'goat';
  marketData?: MarketData;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export interface ProductImage {
  id: string;
  imageUrl: string;
  altText?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ProductSize {
  id: string;
  size: string;
  price: number;
  currency: string;
  isAvailable: boolean;
  availableQuantity?: number;
  reservedQuantity?: number;
  lastUpdated: string;
}

export interface MarketData {
  lowestAsk: number;
  highestBid: number;
  lastSale: number;
  changeValue: number;
  changePercentage: number;
  volatility: number;
  deadstockSold: number;
  annualHigh: number;
  annualLow: number;
  recordedAt: string;
}

// Filter and Search Types
export interface ProductFilters extends FilterParams {
  brand?: string;
  brandIds?: string[];
  category?: string;
  categories?: string[];
  gender?: 'men' | 'women' | 'unisex';
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  colors?: string[];
  status?: 'active' | 'inactive' | 'discontinued';
  marketplace?: 'stockx' | 'goat';
  inStock?: boolean;
  featured?: boolean;
  releasedAfter?: string;
  releasedBefore?: string;
  search?: string;
}

export interface ProductSortOptions {
  field: 'name' | 'price' | 'retail_price' | 'release_date' | 'created_at' | 'last_sale' | 'popularity';
  direction: 'asc' | 'desc';
}

// Response Types
export interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ProductRecommendations {
  similar: Product[];
  recentlyViewed: Product[];
  popular: Product[];
  crossSell: Product[];
}

export interface SearchSuggestion {
  id: string;
  text: string;
  type: 'product' | 'brand' | 'category';
  count?: number;
}

// Cache Configuration
interface CacheConfig {
  ttl: number;
  key: string;
}

// Service Implementation
class ProductApiService extends BaseApiService {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private recentlyViewedKey = 'product_recently_viewed';

  constructor() {
    super('products');
  }

  /**
   * Get paginated products with advanced filtering and sorting
   */
  async getProducts(
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: ProductFilters = {},
    sort: ProductSortOptions = { field: 'created_at', direction: 'desc' }
  ): Promise<ApiResponse<ProductsResponse>> {
    const cacheKey = this.generateCacheKey('products', { pagination, filters, sort });
    const cached = this.getCached<ProductsResponse>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      let query = supabase
        .from('products')
        .select(`
          *,
          brands!inner(
            id,
            name,
            slug,
            logo_url
          ),
          product_images(
            id,
            image_url,
            alt_text,
            is_primary,
            sort_order
          ),
          product_stock(
            size,
            quantity,
            reserved_quantity
          ),
          product_market!left(
            lowest_ask,
            highest_bid,
            last_sale,
            change_value,
            change_percentage,
            volatility,
            deadstock_sold,
            annual_high,
            annual_low,
            recorded_at
          )
        `, { count: 'exact' });

      // Apply filters
      query = this.applyFilters(query, filters);

      // Apply sorting
      query = this.applySorting(query, sort);

      // Apply pagination
      query = this.buildPaginationQuery(query, pagination);

      const { data, error, count } = await query;

      if (error) throw error;

      const products = (data || []).map(this.transformProduct);
      const total = count || 0;
      const totalPages = Math.ceil(total / (pagination.limit || 20));

      const result: ProductsResponse = {
        products,
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
        totalPages,
        hasNextPage: (pagination.page || 1) < totalPages,
        hasPrevPage: (pagination.page || 1) > 1
      };

      // Cache the result
      this.setCached(cacheKey, result, 5 * 60 * 1000); // 5 minutes

      return { data: result, error: null };
    });
  }

  /**
   * Get single product by ID
   */
  async getProduct(id: string): Promise<ApiResponse<Product>> {
    const cacheKey = this.generateCacheKey('product', { id });
    const cached = this.getCached<Product>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          brands(
            id,
            name,
            slug,
            logo_url
          ),
          product_images(
            id,
            image_url,
            alt_text,
            is_primary,
            sort_order
          ),
          product_stock(
            size,
            quantity,
            reserved_quantity
          ),
          product_market(
            lowest_ask,
            highest_bid,
            last_sale,
            change_value,
            change_percentage,
            volatility,
            deadstock_sold,
            annual_high,
            annual_low,
            recorded_at
          )
        `)
        .eq('id', id)
        .eq('status', 'active')
        .single();

      if (error) throw error;
      if (!data) throw new Error('Product not found');

      const product = this.transformProduct(data);

      // Cache the result
      this.setCached(cacheKey, product, 10 * 60 * 1000); // 10 minutes

      // Track recently viewed
      this.addToRecentlyViewed(id);

      return { data: product, error: null };
    });
  }

  /**
   * Search products with full-text search
   */
  async searchProducts(
    query: string,
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: ProductFilters = {},
    sort: ProductSortOptions = { field: 'name', direction: 'asc' }
  ): Promise<ApiResponse<ProductsResponse>> {
    if (!query.trim()) {
      return this.getProducts(pagination, filters, sort);
    }

    const cacheKey = this.generateCacheKey('search', { query, pagination, filters, sort });
    const cached = this.getCached<ProductsResponse>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      let searchQuery = supabase
        .from('products')
        .select(`
          *,
          brands!inner(
            id,
            name,
            slug,
            logo_url
          ),
          product_images(
            id,
            image_url,
            alt_text,
            is_primary,
            sort_order
          ),
          product_stock(
            size,
            quantity,
            reserved_quantity
          ),
          product_market!left(
            lowest_ask,
            highest_bid,
            last_sale,
            change_value,
            change_percentage,
            volatility,
            deadstock_sold,
            annual_high,
            annual_low,
            recorded_at
          )
        `, { count: 'exact' })
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,colorway.ilike.%${query}%,sku.ilike.%${query}%,brands.name.ilike.%${query}%`)
        .eq('status', 'active');

      // Apply additional filters
      searchQuery = this.applyFilters(searchQuery, filters);

      // Apply sorting with search relevance
      if (sort.field === 'name') {
        // Sort by relevance first, then by name
        searchQuery = searchQuery.order('name', { ascending: sort.direction === 'asc' });
      } else {
        searchQuery = this.applySorting(searchQuery, sort);
      }

      // Apply pagination
      searchQuery = this.buildPaginationQuery(searchQuery, pagination);

      const { data, error, count } = await searchQuery;

      if (error) throw error;

      const products = (data || []).map(this.transformProduct);
      const total = count || 0;
      const totalPages = Math.ceil(total / (pagination.limit || 20));

      const result: ProductsResponse = {
        products,
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
        totalPages,
        hasNextPage: (pagination.page || 1) < totalPages,
        hasPrevPage: (pagination.page || 1) > 1
      };

      // Cache the result for shorter duration (search results change more frequently)
      this.setCached(cacheKey, result, 2 * 60 * 1000); // 2 minutes

      return { data: result, error: null };
    });
  }

  /**
   * Get search suggestions
   */
  async getSearchSuggestions(query: string, limit = 10): Promise<ApiResponse<SearchSuggestion[]>> {
    if (!query.trim() || query.length < 2) {
      return { data: [], error: null };
    }

    const cacheKey = this.generateCacheKey('suggestions', { query, limit });
    const cached = this.getCached<SearchSuggestion[]>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      // Get product suggestions
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .ilike('name', `%${query}%`)
        .eq('status', 'active')
        .limit(Math.ceil(limit * 0.6));

      // Get brand suggestions
      const { data: brands } = await supabase
        .from('brands')
        .select('id, name, product_count')
        .ilike('name', `%${query}%`)
        .gt('product_count', 0)
        .limit(Math.ceil(limit * 0.4));

      const suggestions: SearchSuggestion[] = [
        ...(products || []).map(p => ({
          id: p.id,
          text: p.name,
          type: 'product' as const
        })),
        ...(brands || []).map(b => ({
          id: b.id,
          text: b.name,
          type: 'brand' as const,
          count: b.product_count
        }))
      ].slice(0, limit);

      // Cache suggestions
      this.setCached(cacheKey, suggestions, 10 * 60 * 1000); // 10 minutes

      return { data: suggestions, error: null };
    });
  }

  /**
   * Get featured products
   */
  async getFeaturedProducts(limit = 8): Promise<ApiResponse<Product[]>> {
    const cacheKey = this.generateCacheKey('featured', { limit });
    const cached = this.getCached<Product[]>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          brands(
            id,
            name,
            slug,
            logo_url
          ),
          product_images(
            id,
            image_url,
            alt_text,
            is_primary,
            sort_order
          ),
          product_stock(
            size,
            quantity,
            reserved_quantity
          ),
          product_market(
            lowest_ask,
            highest_bid,
            last_sale,
            change_value,
            change_percentage,
            volatility,
            deadstock_sold,
            annual_high,
            annual_low,
            recorded_at
          )
        `)
        .eq('status', 'active')
        // Use market data and recent activity to determine featured products
        .not('product_market', 'is', null)
        .order('deadstock_sold', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const products = (data || []).map(this.transformProduct);

      // Cache for longer duration as featured products change less frequently
      this.setCached(cacheKey, products, 15 * 60 * 1000); // 15 minutes

      return { data: products, error: null };
    });
  }

  /**
   * Get product recommendations
   */
  async getRecommendations(
    productId?: string,
    userId?: string,
    limit = 20
  ): Promise<ApiResponse<ProductRecommendations>> {
    const cacheKey = this.generateCacheKey('recommendations', { productId, userId, limit });
    const cached = this.getCached<ProductRecommendations>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      const recommendations: ProductRecommendations = {
        similar: [],
        recentlyViewed: [],
        popular: [],
        crossSell: []
      };

      // Get similar products (based on category and brand if productId provided)
      if (productId) {
        const { data: similarData } = await this.getSimilarProducts(productId, Math.ceil(limit * 0.3));
        recommendations.similar = similarData || [];
      }

      // Get recently viewed products
      const recentlyViewed = this.getRecentlyViewed();
      if (recentlyViewed.length > 0) {
        const { data: recentData } = await this.getProductsByIds(
          recentlyViewed.slice(0, Math.ceil(limit * 0.2))
        );
        recommendations.recentlyViewed = recentData || [];
      }

      // Get popular products (based on sales volume)
      const { data: popularData } = await this.getPopularProducts(Math.ceil(limit * 0.3));
      recommendations.popular = popularData || [];

      // Get cross-sell recommendations (different categories but similar price range)
      if (productId) {
        const { data: crossSellData } = await this.getCrossSellProducts(productId, Math.ceil(limit * 0.2));
        recommendations.crossSell = crossSellData || [];
      }

      // Cache recommendations
      this.setCached(cacheKey, recommendations, 10 * 60 * 1000); // 10 minutes

      return { data: recommendations, error: null };
    });
  }

  /**
   * Get available brands
   */
  async getBrands(): Promise<ApiResponse<Array<{ id: string; name: string; productCount: number }>>> {
    const cacheKey = this.generateCacheKey('brands');
    const cached = this.getCached<Array<{ id: string; name: string; productCount: number }>>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, product_count')
        .gt('product_count', 0)
        .order('name');

      if (error) throw error;

      const brands = (data || []).map(brand => ({
        id: brand.id,
        name: brand.name,
        productCount: brand.product_count
      }));

      // Cache for longer duration
      this.setCached(cacheKey, brands, 60 * 60 * 1000); // 1 hour

      return { data: brands, error: null };
    });
  }

  /**
   * Get available categories
   */
  async getCategories(): Promise<ApiResponse<Array<{ name: string; count: number }>>> {
    const cacheKey = this.generateCacheKey('categories');
    const cached = this.getCached<Array<{ name: string; count: number }>>(cacheKey);

    if (cached) {
      return { data: cached, error: null };
    }

    return this.handleApiCall(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .eq('status', 'active')
        .not('category', 'is', null);

      if (error) throw error;

      // Count categories
      const categoryMap = new Map<string, number>();
      (data || []).forEach(item => {
        const count = categoryMap.get(item.category) || 0;
        categoryMap.set(item.category, count + 1);
      });

      const categories = Array.from(categoryMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Cache for longer duration
      this.setCached(cacheKey, categories, 60 * 60 * 1000); // 1 hour

      return { data: categories, error: null };
    });
  }

  // Private helper methods

  private applyFilters(query: any, filters: ProductFilters) {
    let filteredQuery = query.eq('status', filters.status || 'active');

    if (filters.brand) {
      filteredQuery = filteredQuery.eq('brands.name', filters.brand);
    }

    if (filters.brandIds && filters.brandIds.length > 0) {
      filteredQuery = filteredQuery.in('brand_id', filters.brandIds);
    }

    if (filters.category) {
      filteredQuery = filteredQuery.eq('category', filters.category);
    }

    if (filters.categories && filters.categories.length > 0) {
      filteredQuery = filteredQuery.in('category', filters.categories);
    }

    if (filters.gender) {
      filteredQuery = filteredQuery.eq('gender', filters.gender);
    }

    if (filters.minPrice !== undefined) {
      filteredQuery = filteredQuery.gte('retail_price', filters.minPrice);
    }

    if (filters.maxPrice !== undefined) {
      filteredQuery = filteredQuery.lte('retail_price', filters.maxPrice);
    }

    if (filters.marketplace) {
      filteredQuery = filteredQuery.eq('marketplace', filters.marketplace);
    }

    if (filters.releasedAfter) {
      filteredQuery = filteredQuery.gte('release_date', filters.releasedAfter);
    }

    if (filters.releasedBefore) {
      filteredQuery = filteredQuery.lte('release_date', filters.releasedBefore);
    }

    if (filters.inStock === true) {
      filteredQuery = filteredQuery.gt('product_stock.quantity', 'product_stock.reserved_quantity');
    }

    return filteredQuery;
  }

  private applySorting(query: any, sort: ProductSortOptions) {
    // Map sort fields to database columns and handle foreign table sorting
    switch (sort.field) {
      case 'price':
        return query.order('retail_price', { ascending: sort.direction === 'asc' });
      case 'last_sale':
        return query.order('last_sale', { ascending: sort.direction === 'asc', foreignTable: 'product_market' });
      case 'popularity':
        return query.order('deadstock_sold', { ascending: sort.direction === 'asc', foreignTable: 'product_market' });
      default:
        return query.order(sort.field, { ascending: sort.direction === 'asc' });
    }
  }

  private async getSimilarProducts(productId: string, limit: number): Promise<ApiResponse<Product[]>> {
    return this.handleApiCall(async () => {
      // Get the original product to find similar ones
      const { data: originalProduct } = await supabase
        .from('products')
        .select('brand_id, category, retail_price')
        .eq('id', productId)
        .single();

      if (!originalProduct) {
        return { data: [], error: null };
      }

      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          brands(id, name, slug, logo_url),
          product_images(id, image_url, alt_text, is_primary, sort_order),
          product_stock(size, quantity, reserved_quantity)
        `)
        .eq('status', 'active')
        .neq('id', productId)
        .or(`brand_id.eq.${originalProduct.brand_id},category.eq.${originalProduct.category}`)
        .gte('retail_price', originalProduct.retail_price * 0.7)
        .lte('retail_price', originalProduct.retail_price * 1.3)
        .limit(limit);

      if (error) throw error;

      const products = (data || []).map(this.transformProduct);
      return { data: products, error: null };
    });
  }

  private async getPopularProducts(limit: number): Promise<ApiResponse<Product[]>> {
    return this.handleApiCall(async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          brands(id, name, slug, logo_url),
          product_images(id, image_url, alt_text, is_primary, sort_order),
          product_stock(size, quantity, reserved_quantity),
          product_market!inner(deadstock_sold)
        `)
        .eq('status', 'active')
        .gt('product_market.deadstock_sold', 100)
        .order('deadstock_sold', { ascending: false, foreignTable: 'product_market' })
        .limit(limit);

      if (error) throw error;

      const products = (data || []).map(this.transformProduct);
      return { data: products, error: null };
    });
  }

  private async getCrossSellProducts(productId: string, limit: number): Promise<ApiResponse<Product[]>> {
    return this.handleApiCall(async () => {
      const { data: originalProduct } = await supabase
        .from('products')
        .select('category, retail_price')
        .eq('id', productId)
        .single();

      if (!originalProduct) {
        return { data: [], error: null };
      }

      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          brands(id, name, slug, logo_url),
          product_images(id, image_url, alt_text, is_primary, sort_order),
          product_stock(size, quantity, reserved_quantity)
        `)
        .eq('status', 'active')
        .neq('id', productId)
        .neq('category', originalProduct.category)
        .gte('retail_price', originalProduct.retail_price * 0.8)
        .lte('retail_price', originalProduct.retail_price * 1.2)
        .limit(limit);

      if (error) throw error;

      const products = (data || []).map(this.transformProduct);
      return { data: products, error: null };
    });
  }

  private async getProductsByIds(ids: string[]): Promise<ApiResponse<Product[]>> {
    return this.handleApiCall(async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          brands(id, name, slug, logo_url),
          product_images(id, image_url, alt_text, is_primary, sort_order),
          product_stock(size, quantity, reserved_quantity),
          product_market(lowest_ask, highest_bid, last_sale, change_value, change_percentage)
        `)
        .in('id', ids)
        .eq('status', 'active');

      if (error) throw error;

      const products = (data || []).map(this.transformProduct);
      return { data: products, error: null };
    });
  }

  private transformProduct(dbProduct: any): Product {
    const images = (dbProduct.product_images || []).map((img: any) => ({
      id: img.id,
      imageUrl: img.image_url,
      altText: img.alt_text,
      isPrimary: img.is_primary,
      sortOrder: img.sort_order
    })).sort((a: ProductImage, b: ProductImage) => a.sortOrder - b.sortOrder);

    const primaryImage = images.find(img => img.isPrimary) || images[0];
    const imageUrl = primaryImage?.imageUrl || this.getPlaceholderImage(dbProduct.id);

    const stockEntries = dbProduct.product_stock || [];
    const sizes: ProductSize[] = stockEntries.map((entry: any) => ({
      id: `${dbProduct.id}-${entry.size}`,
      size: entry.size,
      price: dbProduct.retail_price,
      currency: 'EUR',
      isAvailable: (entry.quantity - (entry.reserved_quantity || 0)) > 0,
      availableQuantity: entry.quantity,
      reservedQuantity: entry.reserved_quantity || 0,
      lastUpdated: new Date().toISOString()
    }));

    const totalStock = stockEntries.reduce((sum: number, entry: any) =>
      sum + Math.max(0, (entry.quantity || 0) - (entry.reserved_quantity || 0)), 0
    );

    let marketData: MarketData | undefined;
    if (dbProduct.product_market && Array.isArray(dbProduct.product_market) && dbProduct.product_market[0]) {
      const market = dbProduct.product_market[0];
      marketData = {
        lowestAsk: market.lowest_ask,
        highestBid: market.highest_bid,
        lastSale: market.last_sale,
        changeValue: market.change_value,
        changePercentage: market.change_percentage,
        volatility: market.volatility,
        deadstockSold: market.deadstock_sold,
        annualHigh: market.annual_high,
        annualLow: market.annual_low,
        recordedAt: market.recorded_at
      };
    }

    return {
      id: dbProduct.id,
      name: dbProduct.name,
      brand: dbProduct.brands?.name || 'Unknown',
      brandId: dbProduct.brand_id,
      price: marketData?.lastSale || dbProduct.retail_price,
      retailPrice: dbProduct.retail_price,
      imageUrl,
      images,
      description: dbProduct.description,
      category: dbProduct.category,
      colorway: dbProduct.colorway,
      sku: dbProduct.sku,
      gender: dbProduct.gender,
      releaseDate: dbProduct.release_date,
      sizes,
      stockCount: totalStock,
      status: dbProduct.status,
      marketplace: dbProduct.marketplace,
      marketData,
      createdAt: dbProduct.created_at,
      updatedAt: dbProduct.updated_at,
      lastSyncedAt: dbProduct.last_synced_at
    };
  }

  private getPlaceholderImage(productId: string): string {
    const imageVariants = [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=800&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=800&h=800&fit=crop&crop=center',
    ];

    const productHash = productId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    const imageIndex = Math.abs(productHash) % imageVariants.length;
    return imageVariants[imageIndex];
  }

  // Cache management methods
  private generateCacheKey(prefix: string, params?: any): string {
    const paramsString = params ? JSON.stringify(params) : '';
    return `${prefix}_${Buffer.from(paramsString).toString('base64')}`;
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.timestamp + cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCached<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  // Recently viewed functionality
  private addToRecentlyViewed(productId: string): void {
    if (typeof window === 'undefined') return;

    try {
      const existing = JSON.parse(localStorage.getItem(this.recentlyViewedKey) || '[]');
      const filtered = existing.filter((id: string) => id !== productId);
      const updated = [productId, ...filtered].slice(0, 20); // Keep last 20
      localStorage.setItem(this.recentlyViewedKey, JSON.stringify(updated));
    } catch (error) {
      console.warn('Failed to update recently viewed products:', error);
    }
  }

  private getRecentlyViewed(): string[] {
    if (typeof window === 'undefined') return [];

    try {
      return JSON.parse(localStorage.getItem(this.recentlyViewedKey) || '[]');
    } catch (error) {
      console.warn('Failed to get recently viewed products:', error);
      return [];
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const productApiService = new ProductApiService();

// Export service class for dependency injection
export { ProductApiService };

// Note: Types are already exported inline above