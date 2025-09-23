import { supabase } from '@/lib/supabase/client'
import { KicksService } from './kicks'
import { DataTransformer } from './data-transformer'

interface SyncJob {
  id: string
  type: 'full' | 'incremental' | 'brands' | 'products' | 'images' | 'market_data'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: number
  config: SyncConfig
  scheduledAt: Date
  startedAt?: Date
  completedAt?: Date
  progress: {
    total: number
    processed: number
    created: number
    updated: number
    failed: number
    skipped: number
  }
  errors: SyncError[]
  metadata?: Record<string, any>
}

interface SyncConfig {
  batchSize: number
  delayBetweenBatches: number
  maxRetries: number
  updateExisting: boolean
  syncImages: boolean
  syncMarketData: boolean
  syncStockData: boolean
  filters?: {
    brands?: string[]
    categories?: string[]
    updatedSince?: string
    minPrice?: number
    maxPrice?: number
  }
  validation?: {
    strictMode: boolean
    skipInvalid: boolean
    requireImages: boolean
  }
}

interface SyncError {
  timestamp: Date
  type: 'validation' | 'network' | 'database' | 'transformation' | 'unknown'
  message: string
  data?: any
  retryable: boolean
}

interface SyncStats {
  totalJobs: number
  runningJobs: number
  completedJobs: number
  failedJobs: number
  totalItemsProcessed: number
  totalItemsCreated: number
  totalItemsUpdated: number
  totalItemsFailed: number
  averageProcessingTime: number
  lastSyncTime?: Date
  nextScheduledSync?: Date
}

export class SyncService {
  private static jobs: Map<string, SyncJob> = new Map()
  private static isProcessing = false
  private static processingInterval: NodeJS.Timeout | null = null

  static readonly DEFAULT_CONFIG: SyncConfig = {
    batchSize: 50,
    delayBetweenBatches: 1000,
    maxRetries: 3,
    updateExisting: true,
    syncImages: true,
    syncMarketData: true,
    syncStockData: true,
    validation: {
      strictMode: false,
      skipInvalid: true,
      requireImages: false
    }
  }

  static initialize() {
    // Start the job processor
    this.startJobProcessor()

    // Load any pending jobs from database
    this.loadPendingJobs()
  }

  static async scheduleSync(
    type: SyncJob['type'],
    config: Partial<SyncConfig> = {},
    scheduledAt: Date = new Date(),
    priority: number = 0
  ): Promise<string> {
    const jobId = `sync_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const job: SyncJob = {
      id: jobId,
      type,
      status: 'pending',
      priority,
      config: { ...this.DEFAULT_CONFIG, ...config },
      scheduledAt,
      progress: {
        total: 0,
        processed: 0,
        created: 0,
        updated: 0,
        failed: 0,
        skipped: 0
      },
      errors: []
    }

    this.jobs.set(jobId, job)

    // Save to database
    await this.saveSyncJob(job)

    console.log(`Scheduled ${type} sync job: ${jobId} for ${scheduledAt.toISOString()}`)

    return jobId
  }

  static async cancelSync(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)

    if (!job) {
      return false
    }

    if (job.status === 'running') {
      job.status = 'cancelled'
      await this.saveSyncJob(job)
      console.log(`Cancelled running sync job: ${jobId}`)
    } else if (job.status === 'pending') {
      job.status = 'cancelled'
      await this.saveSyncJob(job)
      console.log(`Cancelled pending sync job: ${jobId}`)
    }

    return true
  }

  static getSyncJob(jobId: string): SyncJob | undefined {
    return this.jobs.get(jobId)
  }

  static async getSyncStats(): Promise<SyncStats> {
    const jobs = Array.from(this.jobs.values())

    const stats: SyncStats = {
      totalJobs: jobs.length,
      runningJobs: jobs.filter(j => j.status === 'running').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      totalItemsProcessed: jobs.reduce((sum, j) => sum + j.progress.processed, 0),
      totalItemsCreated: jobs.reduce((sum, j) => sum + j.progress.created, 0),
      totalItemsUpdated: jobs.reduce((sum, j) => sum + j.progress.updated, 0),
      totalItemsFailed: jobs.reduce((sum, j) => sum + j.progress.failed, 0),
      averageProcessingTime: 0
    }

    const completedJobs = jobs.filter(j => j.status === 'completed' && j.startedAt && j.completedAt)

    if (completedJobs.length > 0) {
      const totalTime = completedJobs.reduce((sum, j) => {
        return sum + (j.completedAt!.getTime() - j.startedAt!.getTime())
      }, 0)
      stats.averageProcessingTime = totalTime / completedJobs.length
    }

    const lastCompleted = completedJobs
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))[0]

    if (lastCompleted?.completedAt) {
      stats.lastSyncTime = lastCompleted.completedAt
    }

    const nextPending = jobs
      .filter(j => j.status === 'pending')
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0]

    if (nextPending) {
      stats.nextScheduledSync = nextPending.scheduledAt
    }

    return stats
  }

  private static startJobProcessor() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
    }

    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processNextJob()
      }
    }, 5000) // Check every 5 seconds
  }

  private static async processNextJob() {
    if (this.isProcessing) return

    const now = new Date()
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'pending' && job.scheduledAt <= now)
      .sort((a, b) => {
        // Sort by priority (higher first), then by scheduled time
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }
        return a.scheduledAt.getTime() - b.scheduledAt.getTime()
      })

    if (pendingJobs.length === 0) return

    const job = pendingJobs[0]
    this.isProcessing = true

    try {
      await this.executeJob(job)
    } catch (error) {
      console.error(`Failed to execute job ${job.id}:`, error)
      await this.handleJobError(job, error)
    } finally {
      this.isProcessing = false
    }
  }

  private static async executeJob(job: SyncJob) {
    console.log(`Starting sync job: ${job.id} (${job.type})`)

    job.status = 'running'
    job.startedAt = new Date()
    await this.saveSyncJob(job)

    try {
      switch (job.type) {
        case 'full':
          await this.executeFullSync(job)
          break
        case 'incremental':
          await this.executeIncrementalSync(job)
          break
        case 'brands':
          await this.executeBrandsSync(job)
          break
        case 'products':
          await this.executeProductsSync(job)
          break
        case 'images':
          await this.executeImagesSync(job)
          break
        case 'market_data':
          await this.executeMarketDataSync(job)
          break
        default:
          throw new Error(`Unknown sync type: ${job.type}`)
      }

      job.status = 'completed'
      job.completedAt = new Date()

      console.log(`Completed sync job: ${job.id}`, {
        processed: job.progress.processed,
        created: job.progress.created,
        updated: job.progress.updated,
        failed: job.progress.failed,
        duration: job.completedAt.getTime() - job.startedAt!.getTime()
      })

    } catch (error) {
      await this.handleJobError(job, error)
    }

    await this.saveSyncJob(job)
  }

  private static async executeFullSync(job: SyncJob) {
    // First sync brands
    await this.syncBrands(job)

    // Then sync products
    await this.syncProducts(job)

    // Finally sync additional data
    if (job.config.syncImages) {
      await this.syncImages(job)
    }

    if (job.config.syncMarketData) {
      await this.syncMarketData(job)
    }
  }

  private static async executeIncrementalSync(job: SyncJob) {
    // Get last sync time from database
    const { data: lastSync } = await supabase
      .from('sync_logs')
      .select('completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    const updatedSince = lastSync?.completed_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Update config to only sync updated items
    job.config.filters = {
      ...job.config.filters,
      updatedSince
    }

    await this.syncProducts(job)
  }

  private static async executeBrandsSync(job: SyncJob) {
    await this.syncBrands(job)
  }

  private static async executeProductsSync(job: SyncJob) {
    await this.syncProducts(job)
  }

  private static async executeImagesSync(job: SyncJob) {
    await this.syncImages(job)
  }

  private static async executeMarketDataSync(job: SyncJob) {
    await this.syncMarketData(job)
  }

  private static async syncBrands(job: SyncJob) {
    try {
      console.log('Syncing brands...')

      const result = await KicksService.syncBrands()

      job.progress.processed += result.processed
      job.progress.created += result.created
      job.progress.updated += result.updated
      job.progress.failed += result.failed

      // Add any errors to job
      if (result.errors.length > 0) {
        job.errors.push(...result.errors.map(e => ({
          timestamp: new Date(),
          type: 'unknown' as const,
          message: e.error,
          data: e.item,
          retryable: true
        })))
      }

    } catch (error) {
      job.errors.push({
        timestamp: new Date(),
        type: 'unknown',
        message: error instanceof Error ? error.message : String(error),
        retryable: true
      })
    }
  }

  private static async syncProducts(job: SyncJob) {
    try {
      console.log('Syncing products...')

      let page = 1
      let hasMore = true

      while (hasMore) {
        const { products, hasMore: morePages } = await KicksService.fetchProducts({
          page,
          limit: job.config.batchSize,
          brand: job.config.filters?.brands?.[0],
          category: job.config.filters?.categories?.[0],
          updatedSince: job.config.filters?.updatedSince
        })

        hasMore = morePages
        job.progress.total += products.length

        for (const product of products) {
          try {
            // Transform and validate product
            const transformResult = DataTransformer.transformProduct(product)

            if (!transformResult.isValid) {
              if (job.config.validation?.skipInvalid) {
                job.progress.skipped++
                continue
              } else {
                throw new Error(`Validation failed: ${transformResult.errors.join(', ')}`)
              }
            }

            // Check for duplicates
            const { data: existingProducts } = await supabase
              .from('products')
              .select('*')
              .or(`kicksdb_id.eq.${product.id},name.eq.${product.name}`)

            const duplicateResult = await DataTransformer.checkDuplicateProduct(
              product,
              existingProducts || []
            )

            if (duplicateResult.isDuplicate && !job.config.updateExisting) {
              job.progress.skipped++
              continue
            }

            // Process the product
            await this.processSingleProduct(product, job, duplicateResult.existingId)

            job.progress.processed++

            if (duplicateResult.isDuplicate) {
              job.progress.updated++
            } else {
              job.progress.created++
            }

          } catch (error) {
            job.progress.failed++
            job.errors.push({
              timestamp: new Date(),
              type: 'transformation',
              message: error instanceof Error ? error.message : String(error),
              data: product,
              retryable: true
            })
          }
        }

        // Delay between batches
        if (hasMore && job.config.delayBetweenBatches > 0) {
          await new Promise(resolve => setTimeout(resolve, job.config.delayBetweenBatches))
        }

        // Update job progress
        await this.saveSyncJob(job)

        page++
      }

    } catch (error) {
      job.errors.push({
        timestamp: new Date(),
        type: 'network',
        message: error instanceof Error ? error.message : String(error),
        retryable: true
      })
    }
  }

  private static async processSingleProduct(product: any, job: SyncJob, existingId?: string) {
    // Get brand and category IDs
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('kicksdb_name', product.brand)
      .single()

    if (!brand) {
      throw new Error(`Brand not found: ${product.brand}`)
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('name', product.category || 'Sneakers')
      .single()

    const productData = {
      name: product.name,
      slug: this.generateSlug(product.name),
      description: product.description,
      brand_id: brand.id,
      category_id: category?.id,
      model: product.model,
      colorway: product.colorway,
      release_date: product.releaseDate,
      retail_price: product.retailPrice,
      current_price: product.market?.lastSale,
      sku: product.sku,
      gender: product.gender,
      kicksdb_id: product.id,
      external_url: `https://kicks.dev/products/${product.id}`,
      market_data: product.market ? JSON.stringify(product.market) : null,
      last_sync_at: new Date().toISOString(),
      sync_status: 'completed',
      is_active: true,
      updated_at: new Date().toISOString()
    }

    let productId: string

    if (existingId) {
      // Update existing product
      const { error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', existingId)

      if (error) throw error
      productId = existingId
    } else {
      // Create new product
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productData)
        .select('id')
        .single()

      if (error) throw error
      productId = newProduct.id
    }

    // Sync related data
    if (job.config.syncImages && product.images?.length > 0) {
      await this.syncProductImages(productId, product.images, product.name)
    }

    if (job.config.syncStockData && product.sizes?.length > 0) {
      await this.syncProductStock(productId, product.sizes)
    }
  }

  private static async syncImages(job: SyncJob) {
    // Implementation for syncing images specifically
    console.log('Syncing product images...')
    // This would be similar to the existing sync-images route
  }

  private static async syncMarketData(job: SyncJob) {
    // Implementation for syncing market data specifically
    console.log('Syncing market data...')
    // This would fetch and update pricing information
  }

  private static async syncProductImages(productId: string, imageUrls: string[], productName: string) {
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

  private static async syncProductStock(productId: string, sizes: any[]) {
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

  private static async handleJobError(job: SyncJob, error: any) {
    job.status = 'failed'
    job.completedAt = new Date()

    job.errors.push({
      timestamp: new Date(),
      type: 'unknown',
      message: error instanceof Error ? error.message : String(error),
      retryable: true
    })

    console.error(`Sync job ${job.id} failed:`, error)
  }

  private static async saveSyncJob(job: SyncJob) {
    try {
      const { error } = await supabase
        .from('sync_logs')
        .upsert({
          id: job.id,
          sync_type: job.type,
          platform: 'internal',
          started_at: job.startedAt?.toISOString(),
          completed_at: job.completedAt?.toISOString(),
          status: job.status === 'running' ? 'syncing' :
                  job.status === 'completed' ? 'completed' : 'failed',
          items_processed: job.progress.processed,
          items_created: job.progress.created,
          items_updated: job.progress.updated,
          items_failed: job.progress.failed,
          error_details: job.errors.length > 0 ? { errors: job.errors } : null
        })

      if (error) {
        console.error('Failed to save sync job:', error)
      }
    } catch (error) {
      console.error('Error saving sync job:', error)
    }
  }

  private static async loadPendingJobs() {
    try {
      const { data: logs, error } = await supabase
        .from('sync_logs')
        .select('*')
        .in('status', ['pending', 'syncing'])
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load pending jobs:', error)
        return
      }

      // Convert logs back to jobs (simplified)
      for (const log of logs || []) {
        const job: SyncJob = {
          id: log.id,
          type: log.sync_type as SyncJob['type'],
          status: log.status === 'syncing' ? 'running' : 'pending',
          priority: 0,
          config: this.DEFAULT_CONFIG,
          scheduledAt: new Date(log.created_at),
          startedAt: log.started_at ? new Date(log.started_at) : undefined,
          completedAt: log.completed_at ? new Date(log.completed_at) : undefined,
          progress: {
            total: 0,
            processed: log.items_processed || 0,
            created: log.items_created || 0,
            updated: log.items_updated || 0,
            failed: log.items_failed || 0,
            skipped: 0
          },
          errors: []
        }

        this.jobs.set(job.id, job)
      }

      console.log(`Loaded ${logs?.length || 0} pending sync jobs`)

    } catch (error) {
      console.error('Error loading pending jobs:', error)
    }
  }

  private static generateSlug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  static stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
  }

  // Scheduler methods for recurring syncs
  static async scheduleRecurringSync(
    type: SyncJob['type'],
    config: Partial<SyncConfig>,
    cronExpression: string
  ) {
    // Implementation for scheduling recurring syncs
    // This would integrate with a cron-like scheduler
    console.log(`Scheduled recurring ${type} sync with pattern: ${cronExpression}`)
  }

  static async getActiveSyncs(): Promise<SyncJob[]> {
    return Array.from(this.jobs.values()).filter(job =>
      job.status === 'running' || job.status === 'pending'
    )
  }

  static async clearCompletedJobs(olderThanDays: number = 7) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt < cutoff
      ) {
        this.jobs.delete(jobId)
      }
    }
  }
}

// Initialize the sync service
SyncService.initialize()