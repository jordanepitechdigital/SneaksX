import { DatabaseService } from '@/lib/database/client';
import { KicksDBClient } from '@/lib/kicksdb';
import type { DBSyncLog, DBSyncError } from '@/types/database';

export interface SyncMonitorStats {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageDuration: number;
  totalItemsProcessed: number;
  totalItemsCreated: number;
  totalItemsUpdated: number;
  totalErrors: number;
  lastSyncAt?: string;
  nextSyncAt?: string;
  currentRateLimit: {
    remaining: number;
    resetTime: number;
    requestCount: number;
  };
}

export interface SyncHealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  issues: string[];
  recommendations: string[];
}

/**
 * Monitoring and observability for the sync system
 */
export class SyncMonitor {
  private database: DatabaseService;
  private kicksDB: KicksDBClient;

  constructor() {
    this.database = new DatabaseService();
    this.kicksDB = new KicksDBClient();
  }

  /**
   * Get comprehensive sync statistics
   */
  async getStats(timeRange: 'day' | 'week' | 'month' = 'day'): Promise<SyncMonitorStats> {
    const hoursBack = timeRange === 'day' ? 24 : timeRange === 'week' ? 168 : 720;
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    try {
      // Get sync logs for the time range
      const logs = await this.database.getRecentSyncLogs(1000);
      const recentLogs = logs.filter(log => new Date(log.started_at) >= new Date(since));

      const stats: SyncMonitorStats = {
        totalSyncs: recentLogs.length,
        successfulSyncs: recentLogs.filter(log => log.status === 'completed').length,
        failedSyncs: recentLogs.filter(log => log.status === 'failed').length,
        averageDuration: 0,
        totalItemsProcessed: 0,
        totalItemsCreated: 0,
        totalItemsUpdated: 0,
        totalErrors: 0,
        currentRateLimit: this.kicksDB.getRateLimitStatus(),
      };

      if (recentLogs.length > 0) {
        // Calculate averages and totals
        let totalDuration = 0;
        let validDurations = 0;

        recentLogs.forEach(log => {
          if (log.completed_at) {
            const duration = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
            totalDuration += duration;
            validDurations++;
          }

          stats.totalItemsProcessed += log.items_processed || 0;
          stats.totalItemsCreated += log.items_created || 0;
          stats.totalItemsUpdated += log.items_updated || 0;
          stats.totalErrors += log.items_failed || 0;
        });

        stats.averageDuration = validDurations > 0 ? totalDuration / validDurations : 0;
        stats.lastSyncAt = recentLogs[0]?.started_at;

        // Estimate next sync time based on configuration
        const fullSyncInterval = await this.database.getSyncConfig('full_sync_interval_hours') || 24;
        const lastFullSync = recentLogs.find(log => log.sync_type === 'full');
        if (lastFullSync?.completed_at) {
          const nextSync = new Date(lastFullSync.completed_at);
          nextSync.setHours(nextSync.getHours() + fullSyncInterval);
          stats.nextSyncAt = nextSync.toISOString();
        }
      }

      return stats;

    } catch (error) {
      console.error('Failed to get sync stats:', error);
      throw error;
    }
  }

  /**
   * Analyze sync health and provide recommendations
   */
  async getHealthStatus(): Promise<SyncHealthStatus> {
    const stats = await this.getStats('day');
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check API connectivity
    const apiTest = await this.kicksDB.testConnection();
    if (!apiTest.success) {
      issues.push(`KicksDB API connection failed: ${apiTest.message}`);
      recommendations.push('Check API key and network connectivity');
    }

    // Check recent sync failures
    const failureRate = stats.totalSyncs > 0 ? stats.failedSyncs / stats.totalSyncs : 0;
    if (failureRate > 0.5) {
      issues.push(`High failure rate: ${(failureRate * 100).toFixed(1)}% of syncs failed`);
      recommendations.push('Review sync logs and fix underlying issues');
    }

    // Check rate limiting
    if (stats.currentRateLimit.remaining < 100) {
      issues.push(`Low API rate limit remaining: ${stats.currentRateLimit.remaining}`);
      recommendations.push('Consider reducing sync frequency or batch sizes');
    }

    // Check if syncs are running
    if (stats.lastSyncAt) {
      const lastSyncTime = new Date(stats.lastSyncAt);
      const hoursSinceLastSync = (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastSync > 25) { // More than 25 hours since last sync
        issues.push(`No recent syncs: last sync was ${hoursSinceLastSync.toFixed(1)} hours ago`);
        recommendations.push('Check if sync scheduler is running');
      }
    } else {
      issues.push('No sync history found');
      recommendations.push('Perform initial sync to establish baseline');
    }

    // Check error rate
    const errorRate = stats.totalItemsProcessed > 0 ? stats.totalErrors / stats.totalItemsProcessed : 0;
    if (errorRate > 0.1) {
      issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}% of items failed`);
      recommendations.push('Review error logs and improve data validation');
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    let message = 'Sync system is operating normally';

    if (issues.length > 0) {
      if (!apiTest.success || failureRate > 0.8) {
        status = 'critical';
        message = 'Sync system requires immediate attention';
      } else {
        status = 'warning';
        message = 'Sync system has some issues that should be addressed';
      }
    }

    return {
      status,
      message,
      issues,
      recommendations,
    };
  }

  /**
   * Get detailed error analysis
   */
  async getErrorAnalysis(syncLogId?: string): Promise<{
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByItem: Record<string, number>;
    recentErrors: DBSyncError[];
    commonIssues: string[];
  }> {
    try {
      let errors: DBSyncError[];

      if (syncLogId) {
        errors = await this.database.getSyncErrors(syncLogId);
      } else {
        // Get recent errors across all syncs
        const recentLogs = await this.database.getRecentSyncLogs(10);
        errors = [];
        for (const log of recentLogs) {
          const logErrors = await this.database.getSyncErrors(log.id);
          errors.push(...logErrors);
        }
      }

      const errorsByType: Record<string, number> = {};
      const errorsByItem: Record<string, number> = {};
      const commonIssues: string[] = [];

      errors.forEach(error => {
        errorsByType[error.error_type] = (errorsByType[error.error_type] || 0) + 1;
        errorsByItem[error.item_type] = (errorsByItem[error.item_type] || 0) + 1;
      });

      // Identify common issues
      if (errorsByType.validation > 0) {
        commonIssues.push('Data validation errors - check API response format');
      }
      if (errorsByType.api > 0) {
        commonIssues.push('API connectivity issues - check network and rate limits');
      }
      if (errorsByType.database > 0) {
        commonIssues.push('Database errors - check connection and constraints');
      }

      return {
        totalErrors: errors.length,
        errorsByType,
        errorsByItem,
        recentErrors: errors.slice(0, 20),
        commonIssues,
      };

    } catch (error) {
      console.error('Failed to get error analysis:', error);
      throw error;
    }
  }

  /**
   * Get quota and usage monitoring
   */
  async getQuotaStatus(): Promise<{
    monthlyQuota: number;
    monthlyUsage: number;
    dailyUsage: number;
    currentRateLimit: ReturnType<KicksDBClient['getRateLimitStatus']>;
    projectedMonthlyUsage: number;
    quotaHealthy: boolean;
    warnings: string[];
  }> {
    const currentRateLimit = this.kicksDB.getRateLimitStatus();

    // For KicksDB free tier
    const monthlyQuota = 50000;

    // Estimate usage based on request count (this is simplified)
    const dailyUsage = currentRateLimit.requestCount;
    const projectedMonthlyUsage = dailyUsage * 30;

    const warnings: string[] = [];
    let quotaHealthy = true;

    if (projectedMonthlyUsage > monthlyQuota * 0.8) {
      warnings.push('Projected monthly usage exceeds 80% of quota');
      quotaHealthy = false;
    }

    if (currentRateLimit.remaining < 100) {
      warnings.push('Rate limit remaining is low');
    }

    return {
      monthlyQuota,
      monthlyUsage: dailyUsage * new Date().getDate(), // Rough estimate
      dailyUsage,
      currentRateLimit,
      projectedMonthlyUsage,
      quotaHealthy,
      warnings,
    };
  }

  /**
   * Performance monitoring
   */
  async getPerformanceMetrics(): Promise<{
    averageSyncDuration: number;
    averageItemsPerSecond: number;
    slowestSyncs: Array<{ id: string; duration: number; itemsProcessed: number }>;
    performanceHealth: 'good' | 'degraded' | 'poor';
    recommendations: string[];
  }> {
    const logs = await this.database.getRecentSyncLogs(50);
    const completedLogs = logs.filter(log => log.status === 'completed' && log.completed_at);

    if (completedLogs.length === 0) {
      return {
        averageSyncDuration: 0,
        averageItemsPerSecond: 0,
        slowestSyncs: [],
        performanceHealth: 'poor',
        recommendations: ['No completed syncs to analyze'],
      };
    }

    const durations = completedLogs.map(log => {
      const duration = new Date(log.completed_at!).getTime() - new Date(log.started_at).getTime();
      return {
        id: log.id,
        duration,
        itemsProcessed: log.items_processed || 0,
      };
    });

    const averageDuration = durations.reduce((sum, d) => sum + d.duration, 0) / durations.length;
    const totalItems = durations.reduce((sum, d) => sum + d.itemsProcessed, 0);
    const totalTime = durations.reduce((sum, d) => sum + d.duration, 0);
    const averageItemsPerSecond = totalTime > 0 ? (totalItems / totalTime) * 1000 : 0;

    const slowestSyncs = durations
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    let performanceHealth: 'good' | 'degraded' | 'poor' = 'good';
    const recommendations: string[] = [];

    if (averageDuration > 300000) { // 5 minutes
      performanceHealth = 'poor';
      recommendations.push('Sync duration is very high - consider reducing batch sizes');
    } else if (averageDuration > 120000) { // 2 minutes
      performanceHealth = 'degraded';
      recommendations.push('Sync duration is elevated - monitor for further degradation');
    }

    if (averageItemsPerSecond < 1) {
      recommendations.push('Low throughput detected - consider optimizing API calls or database operations');
    }

    return {
      averageSyncDuration: averageDuration,
      averageItemsPerSecond,
      slowestSyncs,
      performanceHealth,
      recommendations,
    };
  }

  /**
   * Generate comprehensive sync report
   */
  async generateReport(): Promise<{
    timestamp: string;
    stats: SyncMonitorStats;
    health: SyncHealthStatus;
    errors: Awaited<ReturnType<SyncMonitor['getErrorAnalysis']>>;
    quota: Awaited<ReturnType<SyncMonitor['getQuotaStatus']>>;
    performance: Awaited<ReturnType<SyncMonitor['getPerformanceMetrics']>>;
  }> {
    const [stats, health, errors, quota, performance] = await Promise.all([
      this.getStats(),
      this.getHealthStatus(),
      this.getErrorAnalysis(),
      this.getQuotaStatus(),
      this.getPerformanceMetrics(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      stats,
      health,
      errors,
      quota,
      performance,
    };
  }
}