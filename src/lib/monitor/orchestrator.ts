import { WebhookQueue } from '../webhook/queue';
import { MonitorConfigService } from './config';
import { StockManager } from '../stock/manager';
import { AuditLogger, SystemMonitor } from '../monitoring/audit';
import { FeatureFlagService } from '../features/flags';

export interface MonitorOrchestrator {
  startMonitoring(): Promise<void>;
  stopMonitoring(): Promise<void>;
  getSystemStatus(): Promise<any>;
  performHealthCheck(): Promise<any>;
  enableProductMonitoring(productId: string, config: any): Promise<any>;
  disableProductMonitoring(productId: string): Promise<any>;
}

export class KicksDBMonitorOrchestrator implements MonitorOrchestrator {
  private webhookQueue: WebhookQueue;
  private monitorConfig: MonitorConfigService;
  private stockManager: StockManager;
  private auditLogger: AuditLogger;
  private systemMonitor: SystemMonitor;
  private featureFlags: FeatureFlagService;
  private isRunning = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.webhookQueue = new WebhookQueue();
    this.monitorConfig = new MonitorConfigService();
    this.stockManager = new StockManager();
    this.auditLogger = new AuditLogger();
    this.systemMonitor = new SystemMonitor();
    this.featureFlags = new FeatureFlagService();
  }

  /**
   * Start the monitoring system
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log('Monitoring system already running');
      return;
    }

    try {
      console.log('Starting KicksDB monitoring system...');

      // Initialize feature flags
      await this.featureFlags.initializeDefaults();

      // Start webhook queue processing
      this.webhookQueue.startProcessing();

      // Start health checks (every 5 minutes)
      this.healthCheckInterval = setInterval(async () => {
        try {
          const healthResults = await this.systemMonitor.performHealthCheck();

          // Log any unhealthy services
          for (const result of healthResults) {
            if (result.status === 'unhealthy') {
              await this.auditLogger.logEvent({
                event_type: 'health_check_failed',
                entity_type: 'system',
                entity_id: result.service,
                action: 'health_check',
                metadata: {
                  service: result.service,
                  error: result.error,
                  response_time_ms: result.response_time_ms
                },
                severity: 'error',
                source: 'system_monitor'
              });
            }
          }
        } catch (error) {
          console.error('Health check failed:', error);
        }
      }, 5 * 60 * 1000); // 5 minutes

      // Clean up expired stock reservations (every minute)
      setInterval(async () => {
        try {
          const result = await this.stockManager.cleanupExpiredReservations();
          if (result.released > 0) {
            await this.auditLogger.logEvent({
              event_type: 'stock_cleanup',
              entity_type: 'stock',
              action: 'cleanup_expired_reservations',
              metadata: { released_count: result.released },
              severity: 'info',
              source: 'stock_manager'
            });
          }
        } catch (error) {
          console.error('Stock cleanup failed:', error);
        }
      }, 60 * 1000); // 1 minute

      this.isRunning = true;

      await this.auditLogger.logEvent({
        event_type: 'system_started',
        entity_type: 'system',
        action: 'start',
        metadata: { component: 'monitor_orchestrator' },
        severity: 'info',
        source: 'system'
      });

      console.log('KicksDB monitoring system started successfully');

    } catch (error) {
      console.error('Failed to start monitoring system:', error);

      await this.auditLogger.logEvent({
        event_type: 'system_start_failed',
        entity_type: 'system',
        action: 'start',
        metadata: {
          component: 'monitor_orchestrator',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        severity: 'critical',
        source: 'system'
      });

      throw error;
    }
  }

  /**
   * Stop the monitoring system
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      console.log('Monitoring system not running');
      return;
    }

    try {
      console.log('Stopping KicksDB monitoring system...');

      // Stop webhook queue processing
      this.webhookQueue.stopProcessing();

      // Stop health checks
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }

      this.isRunning = false;

      await this.auditLogger.logEvent({
        event_type: 'system_stopped',
        entity_type: 'system',
        action: 'stop',
        metadata: { component: 'monitor_orchestrator' },
        severity: 'info',
        source: 'system'
      });

      console.log('KicksDB monitoring system stopped');

    } catch (error) {
      console.error('Error stopping monitoring system:', error);

      await this.auditLogger.logEvent({
        event_type: 'system_stop_failed',
        entity_type: 'system',
        action: 'stop',
        metadata: {
          component: 'monitor_orchestrator',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        severity: 'error',
        source: 'system'
      });

      throw error;
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<{
    isRunning: boolean;
    webhookQueue: any;
    monitoredProducts: any;
    featureFlags: any;
    lastHealthCheck?: any;
  }> {
    try {
      const [queueStats, monitoredProducts, featureFlags, healthResults] = await Promise.all([
        this.webhookQueue.getStats(),
        this.monitorConfig.getMonitoredProducts(),
        this.featureFlags.getMonitorConfig(),
        this.systemMonitor.performHealthCheck()
      ]);

      return {
        isRunning: this.isRunning,
        webhookQueue: queueStats,
        monitoredProducts,
        featureFlags,
        lastHealthCheck: healthResults
      };

    } catch (error) {
      console.error('Error getting system status:', error);
      return {
        isRunning: this.isRunning,
        webhookQueue: { error: 'Failed to get queue stats' },
        monitoredProducts: { error: 'Failed to get monitored products' },
        featureFlags: { error: 'Failed to get feature flags' }
      };
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: any[];
    timestamp: string;
  }> {
    try {
      const healthResults = await this.systemMonitor.performHealthCheck();

      // Determine overall health
      let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      for (const result of healthResults) {
        if (result.status === 'unhealthy') {
          overall = 'unhealthy';
          break;
        } else if (result.status === 'degraded' && overall === 'healthy') {
          overall = 'degraded';
        }
      }

      return {
        overall,
        services: healthResults,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Health check failed:', error);
      return {
        overall: 'unhealthy',
        services: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Enable monitoring for a product
   */
  async enableProductMonitoring(
    productId: string,
    config: {
      kicksdbId: string;
      monitorType: 'price' | 'stock' | 'both';
      frequency: 15 | 30 | 60 | 120;
      markets: string[];
      priceThreshold?: number;
      stockThreshold?: number;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check feature flags
      const flags = await this.featureFlags.getMonitorConfig();

      if (config.monitorType === 'price' && !flags.priceUpdateEnabled) {
        return {
          success: false,
          error: 'Price monitoring is disabled by feature flag'
        };
      }

      if (config.monitorType === 'stock' && !flags.stockMonitoringEnabled) {
        return {
          success: false,
          error: 'Stock monitoring is disabled by feature flag'
        };
      }

      // Enable monitoring
      const result = await this.monitorConfig.enableMonitoring({
        productId,
        kicksdbId: config.kicksdbId,
        monitorType: config.monitorType,
        frequency: config.frequency,
        markets: config.markets,
        priceThreshold: config.priceThreshold,
        stockThreshold: config.stockThreshold
      });

      if (result.success) {
        await this.auditLogger.logMonitorChange(
          'enable',
          productId,
          config.kicksdbId,
          config
        );
      }

      return result;

    } catch (error) {
      console.error('Error enabling product monitoring:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Disable monitoring for a product
   */
  async disableProductMonitoring(productId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current config for audit log
      const status = await this.monitorConfig.getMonitoringStatus(productId);

      const result = await this.monitorConfig.disableMonitoring(productId);

      if (result.success) {
        await this.auditLogger.logMonitorChange(
          'disable',
          productId,
          status.config?.kicksdb_id || 'unknown'
        );
      }

      return result;

    } catch (error) {
      console.error('Error disabling product monitoring:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get monitoring statistics
   */
  async getMonitoringStats(): Promise<{
    totalProducts: number;
    monitoredProducts: number;
    activeMonitors: number;
    webhookEvents24h: number;
    stockOperations24h: number;
    systemHealth: any;
  }> {
    try {
      const [monitoredProducts, webhookMetrics, stockMetrics, healthCheck] = await Promise.all([
        this.monitorConfig.getMonitoredProducts(),
        this.systemMonitor.getMetrics('webhook_events_processed', 24),
        this.systemMonitor.getMetrics('stock_operations_total', 24),
        this.performHealthCheck()
      ]);

      const webhookEvents24h = webhookMetrics.metrics.reduce((sum, metric) => {
        return sum + Number(metric.metric_value);
      }, 0);

      const stockOperations24h = stockMetrics.metrics.reduce((sum, metric) => {
        return sum + Number(metric.metric_value);
      }, 0);

      return {
        totalProducts: 0, // Would need to query products table
        monitoredProducts: monitoredProducts.total,
        activeMonitors: monitoredProducts.total, // Assuming all monitored products have active monitors
        webhookEvents24h,
        stockOperations24h,
        systemHealth: healthCheck
      };

    } catch (error) {
      console.error('Error getting monitoring stats:', error);
      return {
        totalProducts: 0,
        monitoredProducts: 0,
        activeMonitors: 0,
        webhookEvents24h: 0,
        stockOperations24h: 0,
        systemHealth: { overall: 'unknown' }
      };
    }
  }

  /**
   * Process webhook queue manually (for testing)
   */
  async processWebhookQueue(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      let hasMore = true;
      while (hasMore) {
        const result = await this.webhookQueue.processNext();
        if (result) {
          processed++;
        } else {
          hasMore = false;
        }
      }

    } catch (error) {
      console.error('Error processing webhook queue:', error);
      errors++;
    }

    return { processed, errors };
  }

  /**
   * Clean up old data (maintenance)
   */
  async performMaintenance(): Promise<{
    auditLogsDeleted: number;
    metricsDeleted: number;
    queueItemsDeleted: number;
    reservationsReleased: number;
  }> {
    try {
      const retentionDays = await this.featureFlags.getAuditLogRetentionDays();
      const metricsRetentionDays = await this.featureFlags.getMetricsRetentionDays();

      const [auditCleanup, queueCleanup, stockCleanup] = await Promise.all([
        this.auditLogger.cleanupOldLogs(retentionDays),
        this.webhookQueue.cleanup(7), // Keep queue items for 7 days
        this.stockManager.cleanupExpiredReservations()
      ]);

      await this.auditLogger.logEvent({
        event_type: 'maintenance_completed',
        entity_type: 'system',
        action: 'maintenance',
        metadata: {
          audit_logs_deleted: auditCleanup.deleted,
          queue_items_deleted: queueCleanup,
          reservations_released: stockCleanup.released
        },
        severity: 'info',
        source: 'maintenance'
      });

      return {
        auditLogsDeleted: auditCleanup.deleted,
        metricsDeleted: 0, // Would need to implement metrics cleanup
        queueItemsDeleted: queueCleanup,
        reservationsReleased: stockCleanup.released
      };

    } catch (error) {
      console.error('Maintenance failed:', error);

      await this.auditLogger.logEvent({
        event_type: 'maintenance_failed',
        entity_type: 'system',
        action: 'maintenance',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        severity: 'error',
        source: 'maintenance'
      });

      throw error;
    }
  }
}

// Global orchestrator instance
let orchestratorInstance: KicksDBMonitorOrchestrator | null = null;

export function getMonitorOrchestrator(): KicksDBMonitorOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new KicksDBMonitorOrchestrator();
  }
  return orchestratorInstance;
}