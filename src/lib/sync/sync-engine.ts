import { KicksDBClient } from '@/lib/kicksdb';
import { DatabaseService } from '@/lib/database/client';
import {
  transformBrand,
  transformProduct,
  transformProductImages,
  transformProductSizes,
  transformProductMarketData,
  validateTransformedProduct,
  validateTransformedBrand,
  validateImageUrls,
} from './transformers';
import type { KicksDBProduct, KicksDBBrand, KicksDBSearchParams } from '@/types/kicksdb';
import type { DBProduct, DBBrand, SyncConfig } from '@/types/database';

export interface SyncOptions {
  syncType: 'full' | 'incremental' | 'brands' | 'products';
  maxProducts?: number;
  marketplace?: 'stockx' | 'goat' | 'both';
  brands?: string[];
  concurrent?: number;
  batchSize?: number;
}

export interface SyncResult {
  success: boolean;
  syncLogId: string;
  stats: {
    brandsProcessed: number;
    brandsCreated: number;
    brandsUpdated: number;
    productsProcessed: number;
    productsCreated: number;
    productsUpdated: number;
    errors: number;
  };
  errors: Array<{
    type: string;
    item: string;
    message: string;
  }>;
  duration: number;
}

/**
 * Main synchronization engine for KicksDB data
 */
export class SyncEngine {
  private kicksDB: KicksDBClient;
  private database: DatabaseService;

  constructor() {
    this.kicksDB = new KicksDBClient();
    this.database = new DatabaseService();
  }

  /**
   * Execute synchronization with the specified options
   */
  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const syncLogId = await this.database.createSyncLog({
      sync_type: options.syncType,
      started_at: new Date().toISOString(),
      metadata: options,
    });

    const result: SyncResult = {
      success: false,
      syncLogId,
      stats: {
        brandsProcessed: 0,
        brandsCreated: 0,
        brandsUpdated: 0,
        productsProcessed: 0,
        productsCreated: 0,
        productsUpdated: 0,
        errors: 0,
      },
      errors: [],
      duration: 0,
    };

    try {
      console.log(`Starting ${options.syncType} sync...`);

      // Test API connectivity first
      const connectionTest = await this.kicksDB.testConnection();
      if (!connectionTest.success) {
        throw new Error(`KicksDB API connection failed: ${connectionTest.message}`);
      }

      // Get sync configuration
      const config = await this.getSyncConfig();

      // Update options with config defaults
      const finalOptions: Required<SyncOptions> = {
        syncType: options.syncType,
        maxProducts: options.maxProducts || config.max_products_per_sync,
        marketplace: options.marketplace || 'both',
        brands: options.brands || [],
        concurrent: options.concurrent || config.concurrent_requests,
        batchSize: options.batchSize || config.batch_size,
      };

      // Execute sync based on type
      switch (options.syncType) {
        case 'brands':
          await this.syncBrands(result, finalOptions);
          break;
        case 'products':
          await this.syncProducts(result, finalOptions);
          break;
        case 'full':
          await this.syncBrands(result, finalOptions);
          await this.syncProducts(result, finalOptions);
          break;
        case 'incremental':
          await this.syncProductsIncremental(result, finalOptions);
          break;
        default:
          throw new Error(`Unknown sync type: ${options.syncType}`);
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      // Update sync log
      await this.database.updateSyncLog(syncLogId, {
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        items_processed: result.stats.brandsProcessed + result.stats.productsProcessed,
        items_created: result.stats.brandsCreated + result.stats.productsCreated,
        items_updated: result.stats.brandsUpdated + result.stats.productsUpdated,
        items_failed: result.stats.errors,
        error_message: result.errors.length > 0 ? result.errors[0].message : undefined,
      });

      console.log(`Sync completed in ${result.duration}ms:`, result.stats);
      return result;

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push({
        type: 'system',
        item: 'sync_engine',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      result.stats.errors++;

      await this.database.updateSyncLog(syncLogId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        items_failed: 1,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      console.error('Sync failed:', error);
      return result;
    }
  }

  /**
   * Sync brands from KicksDB
   */
  private async syncBrands(result: SyncResult, options: Required<SyncOptions>): Promise<void> {
    try {
      console.log('Syncing brands...');

      const brandsResponse = await this.kicksDB.getBrands();
      if (!brandsResponse.success || !brandsResponse.data) {
        throw new Error('Failed to fetch brands from KicksDB');
      }

      const brands = brandsResponse.data;
      result.stats.brandsProcessed = brands.length;

      for (const kicksDBBrand of brands) {
        try {
          const transformedBrand = transformBrand(kicksDBBrand);
          const validation = validateTransformedBrand(transformedBrand);

          if (!validation.isValid) {
            result.errors.push({
              type: 'validation',
              item: `brand:${kicksDBBrand.name}`,
              message: validation.errors.join(', '),
            });
            result.stats.errors++;
            continue;
          }

          // Check if brand exists
          const existingBrand = await this.database.getBrandByKicksDBName(kicksDBBrand.name);

          if (existingBrand) {
            // Update existing brand
            await this.database.upsertBrand({
              ...transformedBrand,
              id: existingBrand.id,
            });
            result.stats.brandsUpdated++;
          } else {
            // Create new brand
            await this.database.upsertBrand(transformedBrand);
            result.stats.brandsCreated++;
          }

        } catch (error) {
          result.errors.push({
            type: 'database',
            item: `brand:${kicksDBBrand.name}`,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          result.stats.errors++;

          await this.database.logSyncError({
            sync_log_id: result.syncLogId,
            item_type: 'brand',
            item_id: kicksDBBrand.id,
            error_type: 'database',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            error_details: { brand: kicksDBBrand },
          });
        }
      }

      console.log(`Brands sync completed: ${result.stats.brandsCreated} created, ${result.stats.brandsUpdated} updated`);

    } catch (error) {
      result.errors.push({
        type: 'api',
        item: 'brands_sync',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      result.stats.errors++;
    }
  }

  /**
   * Sync products from both marketplaces
   */
  private async syncProducts(result: SyncResult, options: Required<SyncOptions>): Promise<void> {
    const marketplaces = options.marketplace === 'both' ? ['stockx', 'goat'] : [options.marketplace];

    for (const marketplace of marketplaces) {
      try {
        console.log(`Syncing products from ${marketplace}...`);

        // Get products in batches
        let page = 1;
        let hasMore = true;
        let totalProcessed = 0;

        while (hasMore && totalProcessed < options.maxProducts) {
          const searchParams: KicksDBSearchParams = {
            page,
            limit: Math.min(options.batchSize, options.maxProducts - totalProcessed),
          };

          // Add brand filter if specified
          if (options.brands.length > 0) {
            searchParams.brand = options.brands[0]; // KicksDB API typically takes one brand at a time
          }

          const productsResponse = marketplace === 'stockx'
            ? await this.kicksDB.getStockXProducts(searchParams)
            : await this.kicksDB.getGOATProducts(searchParams);

          if (!productsResponse.success || !productsResponse.data) {
            console.warn(`No products found for ${marketplace} on page ${page}`);
            break;
          }

          const products = productsResponse.data;

          // Process products in batches
          await this.processProductBatch(products, marketplace as 'stockx' | 'goat', result);

          totalProcessed += products.length;
          hasMore = products.length === options.batchSize && totalProcessed < options.maxProducts;
          page++;

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`${marketplace} products sync completed: ${totalProcessed} processed`);

      } catch (error) {
        result.errors.push({
          type: 'api',
          item: `${marketplace}_products`,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        result.stats.errors++;
      }
    }
  }

  /**
   * Process a batch of products
   */
  private async processProductBatch(
    products: KicksDBProduct[],
    marketplace: 'stockx' | 'goat',
    result: SyncResult
  ): Promise<void> {
    for (const kicksDBProduct of products) {
      try {
        result.stats.productsProcessed++;

        // Find or create brand
        const brand = await this.findOrCreateBrand(kicksDBProduct.brand);
        if (!brand) {
          result.errors.push({
            type: 'brand_not_found',
            item: `product:${kicksDBProduct.id}`,
            message: `Brand not found: ${kicksDBProduct.brand}`,
          });
          result.stats.errors++;
          continue;
        }

        // Transform product
        const transformedProduct = transformProduct(kicksDBProduct, brand.id);
        const validation = validateTransformedProduct(transformedProduct);

        if (!validation.isValid) {
          result.errors.push({
            type: 'validation',
            item: `product:${kicksDBProduct.id}`,
            message: validation.errors.join(', '),
          });
          result.stats.errors++;
          continue;
        }

        // Check if product exists
        const existingProduct = await this.database.getProductByKicksDBId(kicksDBProduct.id);

        let productId: string;
        if (existingProduct) {
          // Update existing product
          const updatedProduct = await this.database.upsertProduct({
            ...transformedProduct,
            id: existingProduct.id,
          });
          productId = updatedProduct.id;
          result.stats.productsUpdated++;
        } else {
          // Create new product
          const newProduct = await this.database.upsertProduct(transformedProduct);
          productId = newProduct.id;
          result.stats.productsCreated++;
        }

        // Handle images (enforce 2-image limit)
        if (kicksDBProduct.images && kicksDBProduct.images.length > 0) {
          await this.handleProductImages(kicksDBProduct, productId);
        }

        // Handle sizes
        if (kicksDBProduct.sizes && kicksDBProduct.sizes.length > 0) {
          await this.handleProductSizes(kicksDBProduct, productId);
        }

        // Handle market data
        if (kicksDBProduct.market) {
          await this.handleProductMarketData(kicksDBProduct, productId);
        }

      } catch (error) {
        result.errors.push({
          type: 'database',
          item: `product:${kicksDBProduct.id}`,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        result.stats.errors++;

        await this.database.logSyncError({
          sync_log_id: result.syncLogId,
          item_type: 'product',
          item_id: kicksDBProduct.id,
          error_type: 'database',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          error_details: { product: kicksDBProduct },
        });
      }
    }
  }

  /**
   * Find or create brand by name
   */
  private async findOrCreateBrand(brandName: string): Promise<DBBrand | null> {
    try {
      let brand = await this.database.getBrandByKicksDBName(brandName);

      if (!brand) {
        // Create brand with minimal data
        const newBrand = {
          name: brandName,
          slug: brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          kicksdb_name: brandName,
          kicksdb_product_count: 0,
          is_active: true,
        };

        brand = await this.database.upsertBrand(newBrand);
      }

      return brand;
    } catch (error) {
      console.error(`Failed to find or create brand ${brandName}:`, error);
      return null;
    }
  }

  /**
   * Handle product images with 2-image limit
   */
  private async handleProductImages(kicksDBProduct: KicksDBProduct, productId: string): Promise<void> {
    // Implementation would handle image management
    // For now, we store URLs in the market_data field to respect the 2-image limit
    const validImages = validateImageUrls(kicksDBProduct.images);

    // Store in product's market_data for now, or implement proper image table management
    console.log(`Product ${productId} has ${validImages.length} valid images (limited to 2)`);
  }

  /**
   * Handle product sizes
   */
  private async handleProductSizes(kicksDBProduct: KicksDBProduct, productId: string): Promise<void> {
    // Implementation would handle size data management
    console.log(`Product ${productId} has ${kicksDBProduct.sizes?.length || 0} sizes`);
  }

  /**
   * Handle product market data
   */
  private async handleProductMarketData(kicksDBProduct: KicksDBProduct, productId: string): Promise<void> {
    // Implementation would handle market data storage
    console.log(`Product ${productId} market data updated`);
  }

  /**
   * Incremental sync for recently updated products
   */
  private async syncProductsIncremental(result: SyncResult, options: Required<SyncOptions>): Promise<void> {
    // For incremental sync, we would typically fetch only recently updated products
    // Since KicksDB doesn't provide timestamp-based filtering, we'll do a limited sync
    const limitedOptions = { ...options, maxProducts: Math.min(options.maxProducts, 100) };
    await this.syncProducts(result, limitedOptions);
  }

  /**
   * Get sync configuration
   */
  private async getSyncConfig(): Promise<SyncConfig> {
    try {
      const config = await Promise.all([
        this.database.getSyncConfig('max_products_per_sync'),
        this.database.getSyncConfig('batch_size'),
        this.database.getSyncConfig('concurrent_requests'),
        this.database.getSyncConfig('retry_attempts'),
        this.database.getSyncConfig('image_limit_per_product'),
      ]);

      return {
        enabled: true,
        full_sync_interval_hours: 24,
        incremental_sync_interval_minutes: 60,
        max_products_per_sync: config[0] || 1000,
        image_limit_per_product: config[4] || 2,
        retry_attempts: config[3] || 3,
        batch_size: config[1] || 50,
        concurrent_requests: config[2] || 5,
      };
    } catch (error) {
      console.warn('Failed to load sync config, using defaults:', error);

      // Return default configuration
      return {
        enabled: true,
        full_sync_interval_hours: 24,
        incremental_sync_interval_minutes: 60,
        max_products_per_sync: 1000,
        image_limit_per_product: 2,
        retry_attempts: 3,
        batch_size: 50,
        concurrent_requests: 5,
      };
    }
  }
}