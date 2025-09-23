import { supabase } from '@/lib/supabase/client'

const KICKS_API_KEY = process.env.KICKS_API_KEY || 'KICKS-97EF-725F-A605-58232DC70EED'
const KICKS_API_BASE = process.env.KICKS_API_BASE || 'https://kicks.dev/api'

interface KicksProduct {
  id: string
  name: string
  brand: string
  model: string
  colorway?: string
  releaseDate?: string
  retailPrice?: number
  images: string[]
  description?: string
  sku?: string
  gender?: string
  category?: string
  sizes?: KicksSize[]
  market?: {
    lowestAsk?: number
    highestBid?: number
    lastSale?: number
    changeValue?: number
    changePercentage?: number
  }
}

interface KicksSize {
  size: string
  available: boolean
  price?: number
  lowestAsk?: number
  highestBid?: number
}

interface KicksBrand {
  id: string
  name: string
  slug: string
  logo?: string
  description?: string
  productCount?: number
}

interface KicksCategory {
  id: string
  name: string
  slug: string
  description?: string
  parentId?: string
}

interface FetchOptions {
  timeout?: number
  retries?: number
  rateLimit?: number
}

interface SyncOptions {
  batchSize?: number
  delayBetweenBatches?: number
  updateExisting?: boolean
  syncImages?: boolean
  syncMarketData?: boolean
}

interface SyncResult {
  success: boolean
  processed: number
  created: number
  updated: number
  failed: number
  errors: Array<{
    item: any
    error: string
  }>
  duration: number
}

export class KicksService {
  private static requestQueue: Array<() => Promise<any>> = []
  private static processing = false
  private static lastRequestTime = 0
  private static readonly RATE_LIMIT_MS = 100 // 10 requests per second max

  private static async withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const now = Date.now()
          const timeSinceLastRequest = now - this.lastRequestTime

          if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
            await new Promise(r => setTimeout(r, this.RATE_LIMIT_MS - timeSinceLastRequest))
          }

          this.lastRequestTime = Date.now()
          const result = await fn()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      this.processQueue()
    })
  }

  private static async processQueue() {
    if (this.processing || this.requestQueue.length === 0) return

    this.processing = true
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()
      if (request) {
        await request()
      }
    }
    this.processing = false
  }

  static async fetchProduct(productId: string, options: FetchOptions = {}): Promise<KicksProduct | null> {
    const { timeout = 10000, retries = 3 } = options

    return this.withRateLimit(async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          const response = await fetch(`${KICKS_API_BASE}/products/${productId}`, {
            headers: {
              'X-API-Key': KICKS_API_KEY,
              'Accept': 'application/json',
              'User-Agent': 'SneaksX/1.0'
            },
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            if (response.status === 404) {
              return null
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const product = await response.json()
          return this.transformProduct(product)

        } catch (error) {
          if (attempt === retries) {
            console.error(`Failed to fetch product ${productId} after ${retries} attempts:`, error)
            throw error
          }

          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
      return null
    })
  }

  static async fetchProducts(options: {
    page?: number
    limit?: number
    brand?: string
    category?: string
    updatedSince?: string
  } = {}): Promise<{ products: KicksProduct[], totalCount: number, hasMore: boolean }> {
    const { page = 1, limit = 50, brand, category, updatedSince } = options

    return this.withRateLimit(async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: Math.min(limit, 100).toString() // Max 100 per page
      })

      if (brand) params.append('brand', brand)
      if (category) params.append('category', category)
      if (updatedSince) params.append('updated_since', updatedSince)

      const response = await fetch(`${KICKS_API_BASE}/products?${params}`, {
        headers: {
          'X-API-Key': KICKS_API_KEY,
          'Accept': 'application/json',
          'User-Agent': 'SneaksX/1.0'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      return {
        products: data.products?.map(this.transformProduct) || [],
        totalCount: data.totalCount || 0,
        hasMore: data.hasMore || false
      }
    })
  }

  static async fetchBrands(): Promise<KicksBrand[]> {
    return this.withRateLimit(async () => {
      const response = await fetch(`${KICKS_API_BASE}/brands`, {
        headers: {
          'X-API-Key': KICKS_API_KEY,
          'Accept': 'application/json',
          'User-Agent': 'SneaksX/1.0'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.brands || []
    })
  }

  static async fetchCategories(): Promise<KicksCategory[]> {
    return this.withRateLimit(async () => {
      const response = await fetch(`${KICKS_API_BASE}/categories`, {
        headers: {
          'X-API-Key': KICKS_API_KEY,
          'Accept': 'application/json',
          'User-Agent': 'SneaksX/1.0'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.categories || []
    })
  }

  static async syncBrands(): Promise<SyncResult> {
    const startTime = Date.now()
    const result: SyncResult = {
      success: false,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      duration: 0
    }

    try {
      console.log('Starting brands synchronization...')

      const kicksBrands = await this.fetchBrands()
      result.processed = kicksBrands.length

      for (const kicksBrand of kicksBrands) {
        try {
          // Check if brand exists
          const { data: existingBrand } = await supabase
            .from('brands')
            .select('id, kicksdb_name')
            .eq('kicksdb_name', kicksBrand.name)
            .maybeSingle()

          const brandData = {
            name: kicksBrand.name,
            slug: kicksBrand.slug || kicksBrand.name.toLowerCase().replace(/\s+/g, '-'),
            description: kicksBrand.description,
            logo_url: kicksBrand.logo,
            kicksdb_name: kicksBrand.name,
            kicksdb_product_count: kicksBrand.productCount || 0,
            kicksdb_last_sync: new Date().toISOString(),
            is_active: true,
            updated_at: new Date().toISOString()
          }

          if (existingBrand) {
            // Update existing brand
            const { error } = await supabase
              .from('brands')
              .update(brandData)
              .eq('id', existingBrand.id)

            if (error) throw error
            result.updated++
          } else {
            // Create new brand
            const { error } = await supabase
              .from('brands')
              .insert(brandData)

            if (error) throw error
            result.created++
          }

        } catch (error) {
          result.failed++
          result.errors.push({
            item: kicksBrand,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      result.success = result.failed === 0
      console.log(`Brands sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`)

    } catch (error) {
      result.errors.push({
        item: null,
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('Brands sync failed:', error)
    }

    result.duration = Date.now() - startTime
    return result
  }

  static async syncProducts(options: SyncOptions = {}): Promise<SyncResult> {
    const {
      batchSize = 50,
      delayBetweenBatches = 1000,
      updateExisting = true,
      syncImages = true,
      syncMarketData = true
    } = options

    const startTime = Date.now()
    const result: SyncResult = {
      success: false,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      duration: 0
    }

    try {
      console.log('Starting products synchronization...')

      let page = 1
      let hasMore = true

      while (hasMore) {
        const { products, hasMore: morePages } = await this.fetchProducts({
          page,
          limit: batchSize
        })

        hasMore = morePages
        result.processed += products.length

        for (const kicksProduct of products) {
          try {
            await this.syncSingleProduct(kicksProduct, {
              updateExisting,
              syncImages,
              syncMarketData
            })
            result.created++ // Will be adjusted based on actual operation
          } catch (error) {
            result.failed++
            result.errors.push({
              item: kicksProduct,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }

        if (hasMore && delayBetweenBatches > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
        }

        page++
      }

      result.success = result.failed === 0
      console.log(`Products sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`)

    } catch (error) {
      result.errors.push({
        item: null,
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('Products sync failed:', error)
    }

    result.duration = Date.now() - startTime
    return result
  }

  private static async syncSingleProduct(
    kicksProduct: KicksProduct,
    options: { updateExisting: boolean; syncImages: boolean; syncMarketData: boolean }
  ): Promise<void> {
    // Check if product exists
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('kicksdb_id', kicksProduct.id)
      .maybeSingle()

    // Get brand and category IDs
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('kicksdb_name', kicksProduct.brand)
      .maybeSingle()

    if (!brand) {
      throw new Error(`Brand not found: ${kicksProduct.brand}`)
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('name', kicksProduct.category || 'Sneakers')
      .maybeSingle()

    const productData = {
      name: kicksProduct.name,
      slug: this.generateSlug(kicksProduct.name),
      description: kicksProduct.description,
      brand_id: brand.id,
      category_id: category?.id,
      model: kicksProduct.model,
      colorway: kicksProduct.colorway,
      release_date: kicksProduct.releaseDate,
      retail_price: kicksProduct.retailPrice,
      current_price: kicksProduct.market?.lastSale,
      sku: kicksProduct.sku,
      gender: kicksProduct.gender,
      kicksdb_id: kicksProduct.id,
      external_url: `https://kicks.dev/products/${kicksProduct.id}`,
      market_data: kicksProduct.market ? JSON.stringify(kicksProduct.market) : null,
      last_sync_at: new Date().toISOString(),
      sync_status: 'completed',
      is_active: true,
      updated_at: new Date().toISOString()
    }

    let productId: string

    if (existingProduct && options.updateExisting) {
      // Update existing product
      const { error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', existingProduct.id)

      if (error) throw error
      productId = existingProduct.id
    } else if (!existingProduct) {
      // Create new product
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productData)
        .select('id')
        .single()

      if (error) throw error
      productId = newProduct.id
    } else {
      return // Skip if exists and not updating
    }

    // Sync images if requested
    if (options.syncImages && kicksProduct.images.length > 0) {
      await this.syncProductImages(productId, kicksProduct.images, kicksProduct.name)
    }

    // Sync sizes and stock if available
    if (kicksProduct.sizes && kicksProduct.sizes.length > 0) {
      await this.syncProductStock(productId, kicksProduct.sizes)
    }
  }

  private static async syncProductImages(productId: string, imageUrls: string[], productName: string): Promise<void> {
    // Remove existing images
    await supabase
      .from('product_images')
      .delete()
      .eq('product_id', productId)

    // Add new images (limit to first 5)
    const imageRecords = imageUrls.slice(0, 5).map((url, index) => ({
      product_id: productId,
      image_url: url,
      alt_text: `${productName} - Image ${index + 1}`,
      sort_order: index,
      is_primary: index === 0
    }))

    const { error } = await supabase
      .from('product_images')
      .insert(imageRecords)

    if (error) throw error
  }

  private static async syncProductStock(productId: string, sizes: KicksSize[]): Promise<void> {
    for (const size of sizes) {
      const stockData = {
        product_id: productId,
        size: size.size,
        quantity: size.available ? 1 : 0,
        size_price: size.price,
        external_available: size.available,
        external_lowest_ask: size.lowestAsk,
        external_highest_bid: size.highestBid,
        external_last_updated: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // Upsert stock record
      const { error } = await supabase
        .from('product_stock')
        .upsert(stockData, {
          onConflict: 'product_id,size'
        })

      if (error) throw error
    }
  }

  private static transformProduct(rawProduct: any): KicksProduct {
    return {
      id: rawProduct.id || rawProduct._id,
      name: rawProduct.name || rawProduct.title,
      brand: rawProduct.brand || rawProduct.brandName,
      model: rawProduct.model || rawProduct.modelName,
      colorway: rawProduct.colorway || rawProduct.color,
      releaseDate: rawProduct.releaseDate || rawProduct.release_date,
      retailPrice: rawProduct.retailPrice || rawProduct.retail_price,
      images: Array.isArray(rawProduct.images) ? rawProduct.images : [],
      description: rawProduct.description,
      sku: rawProduct.sku || rawProduct.styleId,
      gender: rawProduct.gender,
      category: rawProduct.category,
      sizes: rawProduct.sizes || [],
      market: rawProduct.market || {
        lowestAsk: rawProduct.lowestAsk,
        highestBid: rawProduct.highestBid,
        lastSale: rawProduct.lastSale,
        changeValue: rawProduct.changeValue,
        changePercentage: rawProduct.changePercentage
      }
    }
  }

  private static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim()
  }

  static async getApiStatus(): Promise<{
    available: boolean
    responseTime?: number
    error?: string
  }> {
    const startTime = Date.now()

    try {
      const response = await fetch(`${KICKS_API_BASE}/health`, {
        headers: {
          'X-API-Key': KICKS_API_KEY,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      })

      const responseTime = Date.now() - startTime

      return {
        available: response.ok,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        available: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}