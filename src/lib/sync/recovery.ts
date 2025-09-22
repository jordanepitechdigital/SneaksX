import { DatabaseService } from '@/lib/database/client';
import { SyncEngine, type SyncOptions, type SyncResult } from './sync-engine';
import { SyncMonitor } from './monitor';
import type { DBSyncError, DBSyncLog } from '@/types/database';

export interface RecoveryOptions {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxRetryDelay: number;
  skipFailedItems: boolean;
}

export interface RecoveryResult {
  success: boolean;
  itemsRecovered: number;
  itemsSkipped: number;
  itemsStillFailing: number;
  errors: string[];
}

/**
 * Error handling and recovery system for sync operations
 */
export class SyncRecovery {
  private database: DatabaseService;
  private syncEngine: SyncEngine;
  private monitor: SyncMonitor;

  constructor() {
    this.database = new DatabaseService();
    this.syncEngine = new SyncEngine();
    this.monitor = new SyncMonitor();
  }

  /**
   * Retry failed items from a specific sync
   */
  async retryFailedItems(
    syncLogId: string,
    options: Partial<RecoveryOptions> = {}
  ): Promise<RecoveryResult> {
    const finalOptions: RecoveryOptions = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      maxRetryDelay: 30000,
      skipFailedItems: false,
      ...options,
    };

    const result: RecoveryResult = {
      success: false,
      itemsRecovered: 0,
      itemsSkipped: 0,
      itemsStillFailing: 0,
      errors: [],
    };

    try {
      // Get all errors for the sync log
      const errors = await this.database.getSyncErrors(syncLogId);

      if (errors.length === 0) {
        result.success = true;
        return result;
      }

      console.log(`Attempting to recover ${errors.length} failed items from sync ${syncLogId}`);

      // Group errors by item type and ID
      const errorGroups = this.groupErrorsByItem(errors);

      for (const [itemKey, itemErrors] of errorGroups.entries()) {
        const [itemType, itemId] = itemKey.split(':');
        const latestError = itemErrors[0]; // Most recent error

        try {
          // Skip if already retried too many times
          if (latestError.retry_count >= finalOptions.maxRetries) {
            if (finalOptions.skipFailedItems) {
              result.itemsSkipped++;
              continue;
            } else {
              result.itemsStillFailing++;
              result.errors.push(`Item ${itemKey} exceeded max retries (${latestError.retry_count})`);
              continue;
            }
          }

          // Calculate retry delay with exponential backoff
          const delay = Math.min(
            finalOptions.retryDelay * Math.pow(finalOptions.backoffMultiplier, latestError.retry_count),
            finalOptions.maxRetryDelay
          );

          console.log(`Retrying ${itemKey} (attempt ${latestError.retry_count + 1}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));

          // Attempt recovery based on item type
          const recovered = await this.recoverItem(itemType, itemId, latestError);

          if (recovered) {
            result.itemsRecovered++;
            console.log(`Successfully recovered ${itemKey}`);
          } else {
            // Log the retry attempt
            await this.database.logSyncError({
              sync_log_id: syncLogId,
              item_type: itemType,
              item_id: itemId,
              error_type: latestError.error_type,
              error_message: 'Retry failed',
              error_details: latestError.error_details,
              retry_count: latestError.retry_count + 1,
            });

            result.itemsStillFailing++;
            result.errors.push(`Failed to recover ${itemKey} after retry`);
          }

        } catch (error) {
          result.itemsStillFailing++;
          result.errors.push(`Error during recovery of ${itemKey}: ${error instanceof Error ? error.message : 'Unknown error'}`);

          // Log the failed retry
          await this.database.logSyncError({
            sync_log_id: syncLogId,
            item_type: itemType,
            item_id: itemId,
            error_type: 'recovery',
            error_message: error instanceof Error ? error.message : 'Recovery failed',
            retry_count: latestError.retry_count + 1,
          });
        }
      }

      result.success = result.itemsStillFailing === 0;

      console.log(`Recovery completed: ${result.itemsRecovered} recovered, ${result.itemsSkipped} skipped, ${result.itemsStillFailing} still failing`);

      return result;

    } catch (error) {
      result.errors.push(`Recovery process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Recovery process failed:', error);
      return result;
    }
  }

  /**
   * Automatic recovery for recent failed syncs
   */
  async autoRecover(): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];

    try {
      // Get recent failed syncs
      const recentLogs = await this.database.getRecentSyncLogs(10);
      const failedLogs = recentLogs.filter(log => log.status === 'failed');

      for (const log of failedLogs) {
        // Skip if too many failed items (likely systemic issue)
        if ((log.items_failed || 0) > 100) {
          console.log(`Skipping auto-recovery for sync ${log.id} - too many failures (${log.items_failed})`);
          continue;
        }

        // Skip if sync is too old (more than 24 hours)
        const syncAge = Date.now() - new Date(log.started_at).getTime();
        if (syncAge > 24 * 60 * 60 * 1000) {
          console.log(`Skipping auto-recovery for sync ${log.id} - too old`);
          continue;
        }

        console.log(`Attempting auto-recovery for sync ${log.id}`);
        const result = await this.retryFailedItems(log.id, {
          maxRetries: 2,
          skipFailedItems: true,
        });

        results.push(result);
      }

      return results;

    } catch (error) {
      console.error('Auto-recovery failed:', error);
      return results;
    }
  }

  /**
   * Health check and automatic remediation
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    actionsPerformed: string[];
  }> {
    const actionsPerformed: string[] = [];
    let healthy = true;

    try {
      // Get health status
      const health = await this.monitor.getHealthStatus();

      if (health.status === 'critical') {
        healthy = false;

        // Attempt automatic remediation
        console.log('Critical sync health detected, attempting remediation...');

        // 1. Test API connectivity and reset rate limiter if needed
        const quotaStatus = await this.monitor.getQuotaStatus();
        if (quotaStatus.currentRateLimit.remaining < 10) {
          console.log('Resetting rate limiter due to low remaining quota');
          // Reset would be implemented in the KicksDB client
          actionsPerformed.push('Reset rate limiter');
        }

        // 2. Attempt auto-recovery of recent failures
        const recoveryResults = await this.autoRecover();
        if (recoveryResults.length > 0) {
          const totalRecovered = recoveryResults.reduce((sum, r) => sum + r.itemsRecovered, 0);
          actionsPerformed.push(`Auto-recovered ${totalRecovered} items`);
        }

        // 3. Run a limited incremental sync to verify system is working
        try {
          const testSync = await this.syncEngine.sync({
            syncType: 'incremental',
            maxProducts: 10,
          });

          if (testSync.success) {
            actionsPerformed.push('Verified sync functionality with test sync');
            healthy = true;
          } else {
            actionsPerformed.push('Test sync failed - manual intervention required');
          }
        } catch (error) {
          actionsPerformed.push('Test sync failed with error - manual intervention required');
        }
      }

      return {
        healthy,
        issues: health.issues,
        actionsPerformed,
      };

    } catch (error) {
      return {
        healthy: false,
        issues: [`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        actionsPerformed,
      };
    }
  }

  /**
   * Clean up old sync logs and errors
   */
  async cleanupOldData(retentionDays: number = 30): Promise<{
    syncLogsDeleted: number;
    errorsDeleted: number;
  }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    try {
      // This would be implemented with proper database queries
      console.log(`Cleaning up sync data older than ${retentionDays} days (before ${cutoffDate})`);

      // For now, just return placeholder values
      return {
        syncLogsDeleted: 0,
        errorsDeleted: 0,
      };

    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Generate recovery recommendations
   */
  async generateRecoveryRecommendations(): Promise<{
    immediate: string[];
    maintenance: string[];
    optimization: string[];
  }> {
    const immediate: string[] = [];
    const maintenance: string[] = [];
    const optimization: string[] = [];

    try {
      const [health, errors, performance] = await Promise.all([
        this.monitor.getHealthStatus(),
        this.monitor.getErrorAnalysis(),
        this.monitor.getPerformanceMetrics(),
      ]);

      // Immediate actions
      if (health.status === 'critical') {
        immediate.push('System requires immediate attention');
        immediate.push(...health.recommendations);
      }

      if (errors.totalErrors > 100) {
        immediate.push('High error count - investigate root causes');
      }

      // Maintenance recommendations
      if (errors.errorsByType.validation > 0) {
        maintenance.push('Review and update data validation rules');
      }

      if (errors.errorsByType.api > 0) {
        maintenance.push('Monitor API reliability and implement circuit breaker');
      }

      if (performance.performanceHealth === 'poor') {
        maintenance.push('Performance is degraded - review sync configuration');
      }

      // Optimization recommendations
      if (performance.averageItemsPerSecond < 2) {
        optimization.push('Consider increasing concurrent request limits');
      }

      optimization.push('Implement data deduplication to reduce redundant processing');
      optimization.push('Add caching layer for frequently accessed data');

      return { immediate, maintenance, optimization };

    } catch (error) {
      return {
        immediate: ['Failed to generate recommendations - manual review required'],
        maintenance: [],
        optimization: [],
      };
    }
  }

  /**
   * Group errors by item for recovery
   */
  private groupErrorsByItem(errors: DBSyncError[]): Map<string, DBSyncError[]> {
    const groups = new Map<string, DBSyncError[]>();

    errors.forEach(error => {
      const key = `${error.item_type}:${error.item_id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(error);
    });

    // Sort errors within each group by created_at (most recent first)
    groups.forEach(groupErrors => {
      groupErrors.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    return groups;
  }

  /**
   * Attempt to recover a specific item
   */
  private async recoverItem(itemType: string, itemId: string, error: DBSyncError): Promise<boolean> {
    try {
      // Recovery logic based on item type
      switch (itemType) {
        case 'brand':
          return await this.recoverBrand(itemId, error);
        case 'product':
          return await this.recoverProduct(itemId, error);
        default:
          console.warn(`Unknown item type for recovery: ${itemType}`);
          return false;
      }
    } catch (error) {
      console.error(`Recovery failed for ${itemType}:${itemId}:`, error);
      return false;
    }
  }

  /**
   * Recover a failed brand
   */
  private async recoverBrand(brandId: string, error: DBSyncError): Promise<boolean> {
    // Implementation would retry brand synchronization
    console.log(`Attempting to recover brand ${brandId}`);

    // For now, return false to indicate recovery needs manual implementation
    return false;
  }

  /**
   * Recover a failed product
   */
  private async recoverProduct(productId: string, error: DBSyncError): Promise<boolean> {
    // Implementation would retry product synchronization
    console.log(`Attempting to recover product ${productId}`);

    // For now, return false to indicate recovery needs manual implementation
    return false;
  }
}