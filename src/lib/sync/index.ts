/**
 * Main sync module exports
 */
export { SyncEngine } from './sync-engine';
export { SyncMonitor } from './monitor';
export { SyncRecovery } from './recovery';
export * from './transformers';

// Re-export types
export type { SyncOptions, SyncResult } from './sync-engine';

import { SyncEngine } from './sync-engine';
import { SyncMonitor } from './monitor';
import { SyncRecovery } from './recovery';

/**
 * Main sync orchestrator class
 */
export class SyncOrchestrator {
  private engine: SyncEngine;
  private monitor: SyncMonitor;
  private recovery: SyncRecovery;

  constructor() {
    this.engine = new SyncEngine();
    this.monitor = new SyncMonitor();
    this.recovery = new SyncRecovery();
  }

  /**
   * Perform initial data synchronization (100+ products)
   */
  async performInitialSync(): Promise<{
    success: boolean;
    message: string;
    stats: any;
    recommendations: string[];
  }> {
    try {
      console.log('Starting initial data synchronization...');

      // 1. First sync brands
      console.log('Step 1: Syncing brands...');
      const brandSync = await this.engine.sync({
        syncType: 'brands',
      });

      if (!brandSync.success) {
        return {
          success: false,
          message: 'Brand synchronization failed',
          stats: brandSync.stats,
          recommendations: ['Check API connectivity', 'Review error logs'],
        };
      }

      // 2. Sync products to meet 100+ requirement
      console.log('Step 2: Syncing products (targeting 100+ products)...');
      const productSync = await this.engine.sync({
        syncType: 'products',
        maxProducts: 150, // Target 150 to ensure we get 100+ after any failures
        marketplace: 'both', // StockX and GOAT
      });

      const totalProducts = productSync.stats.productsCreated + productSync.stats.productsUpdated;

      if (totalProducts < 100) {
        console.log(`Only ${totalProducts} products synced, attempting additional sync...`);

        // Try additional sync to reach target
        const additionalSync = await this.engine.sync({
          syncType: 'products',
          maxProducts: 100 - totalProducts + 20, // Extra buffer
          marketplace: 'both',
        });

        // Combine results
        productSync.stats.productsProcessed += additionalSync.stats.productsProcessed;
        productSync.stats.productsCreated += additionalSync.stats.productsCreated;
        productSync.stats.productsUpdated += additionalSync.stats.productsUpdated;
        productSync.stats.errors += additionalSync.stats.errors;
        productSync.errors.push(...additionalSync.errors);
      }

      const finalProductCount = productSync.stats.productsCreated + productSync.stats.productsUpdated;
      const success = finalProductCount >= 100;

      const recommendations: string[] = [];
      if (!success) {
        recommendations.push('Could not reach 100+ products target');
        recommendations.push('Check API rate limits and data availability');
        recommendations.push('Consider running additional syncs');
      } else {
        recommendations.push('Initial sync completed successfully');
        recommendations.push('Set up regular incremental syncs');
        recommendations.push('Monitor sync health dashboard');
      }

      if (productSync.errors.length > 0) {
        recommendations.push('Review and address sync errors');
      }

      return {
        success,
        message: success
          ? `Initial sync completed successfully with ${finalProductCount} products`
          : `Initial sync completed but only ${finalProductCount} products were synced (target: 100+)`,
        stats: {
          brands: brandSync.stats,
          products: productSync.stats,
          totalProducts: finalProductCount,
        },
        recommendations,
      };

    } catch (error) {
      console.error('Initial sync failed:', error);
      return {
        success: false,
        message: `Initial sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: {},
        recommendations: [
          'Check API key and connectivity',
          'Verify database connection',
          'Review system logs',
        ],
      };
    }
  }

  /**
   * Run scheduled sync (can be called by cron jobs)
   */
  async runScheduledSync(): Promise<{
    success: boolean;
    message: string;
    syncType: string;
    stats: any;
  }> {
    try {
      // Determine sync type based on last sync
      const stats = await this.monitor.getStats('day');
      const health = await this.monitor.getHealthStatus();

      // If no recent syncs or health is critical, do full sync
      const shouldDoFullSync = !stats.lastSyncAt ||
                              health.status === 'critical' ||
                              (stats.lastSyncAt &&
                               (Date.now() - new Date(stats.lastSyncAt).getTime()) > 24 * 60 * 60 * 1000);

      const syncType = shouldDoFullSync ? 'full' : 'incremental';

      console.log(`Running scheduled ${syncType} sync...`);

      const result = await this.engine.sync({
        syncType,
        maxProducts: syncType === 'incremental' ? 100 : 500,
      });

      // If sync had errors, attempt recovery
      if (result.errors.length > 0) {
        console.log('Sync completed with errors, attempting recovery...');
        await this.recovery.retryFailedItems(result.syncLogId);
      }

      return {
        success: result.success,
        message: `${syncType} sync completed`,
        syncType,
        stats: result.stats,
      };

    } catch (error) {
      console.error('Scheduled sync failed:', error);
      return {
        success: false,
        message: `Scheduled sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        syncType: 'unknown',
        stats: {},
      };
    }
  }

  /**
   * Get comprehensive sync dashboard data
   */
  async getDashboardData(): Promise<{
    health: any;
    stats: any;
    errors: any;
    quota: any;
    performance: any;
    recommendations: any;
  }> {
    try {
      const [health, stats, errors, quota, performance, recommendations] = await Promise.all([
        this.monitor.getHealthStatus(),
        this.monitor.getStats(),
        this.monitor.getErrorAnalysis(),
        this.monitor.getQuotaStatus(),
        this.monitor.getPerformanceMetrics(),
        this.recovery.generateRecoveryRecommendations(),
      ]);

      return {
        health,
        stats,
        errors,
        quota,
        performance,
        recommendations,
      };

    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      throw error;
    }
  }

  /**
   * Health check with auto-remediation
   */
  async performHealthCheck(): Promise<any> {
    return this.recovery.performHealthCheck();
  }

  /**
   * Generate full system report
   */
  async generateReport(): Promise<any> {
    return this.monitor.generateReport();
  }
}

// Create default orchestrator instance
export const syncOrchestrator = new SyncOrchestrator();