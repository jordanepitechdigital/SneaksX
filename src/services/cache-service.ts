interface CacheEntry<T = any> {
  key: string
  value: T
  createdAt: Date
  expiresAt?: Date
  accessCount: number
  lastAccessed: Date
  tags: string[]
  size: number
  compressed?: boolean
}

interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  tags?: string[] // For cache invalidation
  compress?: boolean // Whether to compress the data
  priority?: number // Cache priority (higher = more important)
}

interface CacheStats {
  hitRate: number
  missRate: number
  totalHits: number
  totalMisses: number
  totalKeys: number
  totalSize: number
  memoryUsage: number
  oldestEntry?: Date
  newestEntry?: Date
}

export class CacheService {
  private static cache: Map<string, CacheEntry> = new Map()
  private static stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  }

  private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB
  private static readonly MAX_ENTRIES = 10000
  private static readonly DEFAULT_TTL = 30 * 60 * 1000 // 30 minutes
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

  private static cleanupInterval: NodeJS.Timeout | null = null

  static initialize() {
    // Start periodic cleanup
    this.startCleanup()

    // Set up memory monitoring
    this.setupMemoryMonitoring()
  }

  static async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if expired
    if (entry.expiresAt && entry.expiresAt <= new Date()) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    // Update access info
    entry.accessCount++
    entry.lastAccessed = new Date()

    this.stats.hits++

    // Decompress if needed
    if (entry.compressed && typeof entry.value === 'string') {
      try {
        return JSON.parse(entry.value) as T
      } catch {
        return entry.value as T
      }
    }

    return entry.value as T
  }

  static async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const {
      ttl = this.DEFAULT_TTL,
      tags = [],
      compress = false,
      priority = 1
    } = options

    let processedValue: any = value
    let size = this.calculateSize(value)
    let isCompressed = false

    // Compress large objects if requested
    if (compress && size > 1024) {
      try {
        processedValue = JSON.stringify(value)
        isCompressed = true
        size = this.calculateSize(processedValue)
      } catch {
        // Compression failed, use original value
        processedValue = value
      }
    }

    const entry: CacheEntry<T> = {
      key,
      value: processedValue,
      createdAt: new Date(),
      expiresAt: ttl > 0 ? new Date(Date.now() + ttl) : undefined,
      accessCount: 0,
      lastAccessed: new Date(),
      tags: [...tags],
      size,
      compressed: isCompressed
    }

    // Check if we need to evict entries
    await this.ensureCapacity(size)

    this.cache.set(key, entry)
  }

  static async delete(key: string): Promise<boolean> {
    return this.cache.delete(key)
  }

  static async clear(): Promise<void> {
    this.cache.clear()
    this.resetStats()
  }

  static async invalidateByTag(tag: string): Promise<number> {
    let deletedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    return deletedCount
  }

  static async invalidateByPattern(pattern: RegExp): Promise<number> {
    let deletedCount = 0

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    return deletedCount
  }

  static async getStats(): Promise<CacheStats> {
    const entries = Array.from(this.cache.values())
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0)

    const hitRate = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0

    const missRate = 1 - hitRate

    const dates = entries
      .map(e => e.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())

    return {
      hitRate,
      missRate,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      totalKeys: this.cache.size,
      totalSize,
      memoryUsage: process.memoryUsage().heapUsed,
      oldestEntry: dates[0],
      newestEntry: dates[dates.length - 1]
    }
  }

  // Specialized cache methods for different data types

  static async cacheProduct(productId: string, product: any, ttl: number = 60 * 60 * 1000) {
    return this.set(`product:${productId}`, product, {
      ttl,
      tags: ['products', `brand:${product.brand}`, `category:${product.category}`],
      compress: true
    })
  }

  static async getProductFromCache(productId: string) {
    return this.get(`product:${productId}`)
  }

  static async cacheProductList(
    filters: Record<string, any>,
    products: any[],
    ttl: number = 10 * 60 * 1000
  ) {
    const key = `products:${this.hashFilters(filters)}`
    return this.set(key, products, {
      ttl,
      tags: ['product-lists'],
      compress: true
    })
  }

  static async getProductListFromCache(filters: Record<string, any>) {
    const key = `products:${this.hashFilters(filters)}`
    return this.get(key)
  }

  static async cacheApiResponse(
    endpoint: string,
    params: Record<string, any>,
    response: any,
    ttl: number = 30 * 60 * 1000
  ) {
    const key = `api:${endpoint}:${this.hashFilters(params)}`
    return this.set(key, response, {
      ttl,
      tags: ['api-responses', `endpoint:${endpoint}`],
      compress: true
    })
  }

  static async getApiResponseFromCache(endpoint: string, params: Record<string, any>) {
    const key = `api:${endpoint}:${this.hashFilters(params)}`
    return this.get(key)
  }

  static async cacheSearchResults(
    query: string,
    filters: Record<string, any>,
    results: any[],
    ttl: number = 15 * 60 * 1000
  ) {
    const key = `search:${query}:${this.hashFilters(filters)}`
    return this.set(key, results, {
      ttl,
      tags: ['search-results'],
      compress: true
    })
  }

  static async getSearchResultsFromCache(query: string, filters: Record<string, any>) {
    const key = `search:${query}:${this.hashFilters(filters)}`
    return this.get(key)
  }

  static async cacheMarketData(productId: string, data: any, ttl: number = 5 * 60 * 1000) {
    return this.set(`market:${productId}`, data, {
      ttl,
      tags: ['market-data', `product:${productId}`]
    })
  }

  static async getMarketDataFromCache(productId: string) {
    return this.get(`market:${productId}`)
  }

  // Cache warming methods
  static async warmPopularProducts() {
    console.log('Warming cache with popular products...')

    try {
      // This would fetch popular products and cache them
      // Implementation depends on your analytics/tracking
      const popularProductIds = await this.getPopularProductIds()

      for (const productId of popularProductIds) {
        // Fetch and cache each product
        // await this.cacheProduct(productId, product)
      }

      console.log(`Warmed cache with ${popularProductIds.length} popular products`)
    } catch (error) {
      console.error('Failed to warm cache with popular products:', error)
    }
  }

  static async warmBrandData() {
    console.log('Warming cache with brand data...')

    try {
      // Cache all brands for quick access
      // Implementation would fetch all brands from database
    } catch (error) {
      console.error('Failed to warm cache with brand data:', error)
    }
  }

  // Cache optimization methods
  static async optimizeCache() {
    // Remove least recently used items if cache is getting full
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, entry }))
      .sort((a, b) => a.entry.lastAccessed.getTime() - b.entry.lastAccessed.getTime())

    const currentSize = entries.reduce((sum, { entry }) => sum + entry.size, 0)

    if (currentSize > this.MAX_CACHE_SIZE * 0.8) {
      // Remove 20% of least recently used items
      const itemsToRemove = Math.floor(entries.length * 0.2)

      for (let i = 0; i < itemsToRemove; i++) {
        this.cache.delete(entries[i].key)
        this.stats.evictions++
      }

      console.log(`Evicted ${itemsToRemove} items from cache during optimization`)
    }
  }

  // Private methods

  private static async ensureCapacity(newEntrySize: number) {
    const currentSize = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.size, 0)

    // Check size limits
    if (currentSize + newEntrySize > this.MAX_CACHE_SIZE || this.cache.size >= this.MAX_ENTRIES) {
      await this.evictEntries(newEntrySize)
    }
  }

  private static async evictEntries(requiredSpace: number) {
    // LRU eviction strategy
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, entry }))
      .sort((a, b) => a.entry.lastAccessed.getTime() - b.entry.lastAccessed.getTime())

    let freedSpace = 0
    let evictedCount = 0

    for (const { key, entry } of entries) {
      this.cache.delete(key)
      freedSpace += entry.size
      evictedCount++
      this.stats.evictions++

      if (freedSpace >= requiredSpace) {
        break
      }
    }

    if (evictedCount > 0) {
      console.log(`Evicted ${evictedCount} cache entries to free ${freedSpace} bytes`)
    }
  }

  private static startCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, this.CLEANUP_INTERVAL)
  }

  private static cleanup() {
    const now = new Date()
    let cleanedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.cache.delete(key)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired cache entries`)
    }

    // Run optimization if needed
    if (this.cache.size > this.MAX_ENTRIES * 0.8) {
      this.optimizeCache()
    }
  }

  private static setupMemoryMonitoring() {
    setInterval(() => {
      const memUsage = process.memoryUsage()

      // If memory usage is high, be more aggressive with cache cleanup
      if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        console.log('High memory usage detected, optimizing cache...')
        this.optimizeCache()
      }
    }, 60000) // Check every minute
  }

  private static calculateSize(value: any): number {
    if (typeof value === 'string') {
      return value.length * 2 // Approximate UTF-16 size
    }

    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value).length * 2
    }

    return 100 // Default estimate for primitives
  }

  private static hashFilters(filters: Record<string, any>): string {
    const sortedKeys = Object.keys(filters).sort()
    const normalized = sortedKeys.map(key => `${key}=${filters[key]}`).join('&')

    // Simple hash function
    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }

    return hash.toString(36)
  }

  private static async getPopularProductIds(): Promise<string[]> {
    // This would implement logic to determine popular products
    // Could be based on view counts, sales, etc.
    return []
  }

  private static resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    }
  }

  static stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  // Decorator for automatic caching
  static cached<T extends (...args: any[]) => any>(
    ttl: number = this.DEFAULT_TTL,
    keyGenerator?: (...args: Parameters<T>) => string
  ) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value

      descriptor.value = async function (...args: Parameters<T>) {
        const cacheKey = keyGenerator
          ? keyGenerator(...args)
          : `${target.constructor.name}.${propertyKey}:${CacheService.hashFilters(args)}`

        // Try to get from cache first
        const cached = await CacheService.get<ReturnType<T>>(cacheKey)
        if (cached !== null) {
          return cached
        }

        // Execute original method
        const result = await originalMethod.apply(this, args)

        // Cache the result
        await CacheService.set(cacheKey, result, { ttl })

        return result
      }

      return descriptor
    }
  }
}

// Initialize cache service
CacheService.initialize()

// Export a singleton instance
export { CacheService }