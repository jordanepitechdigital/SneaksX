import { createClient } from '@supabase/supabase-js';

export interface AuditEvent {
  id?: string;
  event_type: string;
  entity_type: string; // 'product', 'stock', 'webhook', 'monitor', etc.
  entity_id?: string;
  user_id?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  action: string; // 'create', 'update', 'delete', 'reserve', 'commit', etc.
  old_values?: any;
  new_values?: any;
  metadata?: any;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string; // 'webhook', 'api', 'admin', 'system', etc.
  created_at?: string;
}

export interface MonitoringMetric {
  metric_name: string;
  metric_value: number;
  tags?: Record<string, string>;
  timestamp?: string;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  response_time_ms?: number;
  error?: string;
  details?: any;
  timestamp: string;
}

export class AuditLogger {
  private supabase;
  private enabledSeverities: Set<string>;

  constructor(enabledSeverities: string[] = ['info', 'warning', 'error', 'critical']) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.enabledSeverities = new Set(enabledSeverities);
  }

  /**
   * Log an audit event
   */
  async logEvent(event: AuditEvent): Promise<void> {
    try {
      // Check if severity is enabled
      if (!this.enabledSeverities.has(event.severity)) {
        return;
      }

      // Ensure audit_logs table exists (create if needed)
      await this.ensureAuditTable();

      const auditRecord = {
        event_type: event.event_type,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        user_id: event.user_id,
        session_id: event.session_id,
        ip_address: event.ip_address,
        user_agent: event.user_agent,
        action: event.action,
        old_values: event.old_values,
        new_values: event.new_values,
        metadata: event.metadata,
        severity: event.severity,
        source: event.source,
        created_at: event.created_at || new Date().toISOString()
      };

      await this.supabase
        .from('audit_logs')
        .insert([auditRecord]);

    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw - audit logging should not break the main flow
    }
  }

  /**
   * Log webhook event processing
   */
  async logWebhookEvent(
    eventId: string,
    eventType: string,
    result: 'success' | 'failure',
    processingTimeMs: number,
    error?: string,
    metadata?: any
  ): Promise<void> {
    await this.logEvent({
      event_type: 'webhook_processed',
      entity_type: 'webhook',
      entity_id: eventId,
      action: result,
      metadata: {
        event_type: eventType,
        processing_time_ms: processingTimeMs,
        error: error,
        ...metadata
      },
      severity: result === 'success' ? 'info' : 'error',
      source: 'webhook'
    });
  }

  /**
   * Log stock operation
   */
  async logStockOperation(
    operation: 'reserve' | 'commit' | 'release' | 'adjust' | 'restock',
    productId: string,
    size: string,
    quantity: number,
    userId?: string,
    sessionId?: string,
    metadata?: any
  ): Promise<void> {
    await this.logEvent({
      event_type: 'stock_operation',
      entity_type: 'stock',
      entity_id: `${productId}:${size}`,
      user_id: userId,
      session_id: sessionId,
      action: operation,
      new_values: { quantity },
      metadata,
      severity: 'info',
      source: 'stock_manager'
    });
  }

  /**
   * Log monitor configuration change
   */
  async logMonitorChange(
    action: 'enable' | 'disable' | 'update',
    productId: string,
    kicksdbId: string,
    config?: any,
    userId?: string
  ): Promise<void> {
    await this.logEvent({
      event_type: 'monitor_configuration',
      entity_type: 'monitor',
      entity_id: productId,
      user_id: userId,
      action: action,
      new_values: config,
      metadata: { kicksdb_id: kicksdbId },
      severity: 'info',
      source: 'monitor_service'
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    eventType: string,
    severity: 'warning' | 'error' | 'critical',
    details: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      event_type: 'security_event',
      entity_type: 'security',
      action: eventType,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: details,
      severity,
      source: 'security'
    });
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filters: {
    entity_type?: string;
    entity_id?: string;
    user_id?: string;
    severity?: string;
    source?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  } = {}): Promise<{ logs: AuditEvent[]; error?: string }> {
    try {
      let query = this.supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.entity_type) {
        query = query.eq('entity_type', filters.entity_type);
      }
      if (filters.entity_id) {
        query = query.eq('entity_id', filters.entity_id);
      }
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }
      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }
      if (filters.source) {
        query = query.eq('source', filters.source);
      }
      if (filters.start_date) {
        query = query.gte('created_at', filters.start_date);
      }
      if (filters.end_date) {
        query = query.lte('created_at', filters.end_date);
      }

      query = query.limit(filters.limit || 100);

      const { data, error } = await query;

      if (error) {
        return { logs: [], error: error.message };
      }

      return { logs: data || [] };

    } catch (error) {
      console.error('Error getting audit logs:', error);
      return {
        logs: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create audit table if it doesn't exist
   */
  private async ensureAuditTable(): Promise<void> {
    try {
      // Check if table exists
      const { data: tables } = await this.supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'audit_logs');

      if (!tables || tables.length === 0) {
        // Table doesn't exist, we should create it via migration
        console.warn('audit_logs table does not exist - should be created via migration');
      }
    } catch (error) {
      console.error('Error checking audit table:', error);
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(olderThanDays: number = 90): Promise<{ deleted: number; error?: string }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { data, error } = await this.supabase
        .from('audit_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        return { deleted: 0, error: error.message };
      }

      return { deleted: data?.length || 0 };

    } catch (error) {
      console.error('Error cleaning up audit logs:', error);
      return {
        deleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export class SystemMonitor {
  private supabase;
  private auditLogger: AuditLogger;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.auditLogger = new AuditLogger();
  }

  /**
   * Record system metric
   */
  async recordMetric(metric: MonitoringMetric): Promise<void> {
    try {
      const record = {
        metric_name: metric.metric_name,
        metric_value: metric.metric_value,
        tags: metric.tags || {},
        created_at: metric.timestamp || new Date().toISOString()
      };

      await this.supabase
        .from('system_metrics')
        .insert([record]);

    } catch (error) {
      console.error('Failed to record metric:', error);
    }
  }

  /**
   * Perform health check on system components
   */
  async performHealthCheck(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    // Check database connectivity
    results.push(await this.checkDatabase());

    // Check webhook queue
    results.push(await this.checkWebhookQueue());

    // Check stock management
    results.push(await this.checkStockManagement());

    // Check external APIs (if configured)
    if (process.env.KICKSDB_API_KEY) {
      results.push(await this.checkKicksDBAPI());
    }

    return results;
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      await this.supabase
        .from('sync_config')
        .select('id')
        .limit(1);

      return {
        service: 'database',
        status: 'healthy',
        response_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check webhook queue health
   */
  private async checkWebhookQueue(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const { data, error } = await this.supabase
        .from('webhook_processing_queue')
        .select('status')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const stats = {
        pending: 0,
        processing: 0,
        failed: 0,
        total: data?.length || 0
      };

      data?.forEach(item => {
        if (item.status in stats) {
          (stats as any)[item.status]++;
        }
      });

      const failureRate = stats.total > 0 ? stats.failed / stats.total : 0;
      const status = failureRate > 0.1 ? 'degraded' : 'healthy'; // >10% failure rate

      return {
        service: 'webhook_queue',
        status,
        response_time_ms: Date.now() - startTime,
        details: stats,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        service: 'webhook_queue',
        status: 'unhealthy',
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check stock management health
   */
  private async checkStockManagement(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Check for expired reservations
      const { data: expiredReservations } = await this.supabase
        .from('stock_reservations')
        .select('id')
        .lt('expires_at', new Date().toISOString());

      const expiredCount = expiredReservations?.length || 0;
      const status = expiredCount > 100 ? 'degraded' : 'healthy'; // Too many expired reservations

      return {
        service: 'stock_management',
        status,
        response_time_ms: Date.now() - startTime,
        details: { expired_reservations: expiredCount },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        service: 'stock_management',
        status: 'unhealthy',
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check KicksDB API health
   */
  private async checkKicksDBAPI(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${process.env.KICKSDB_BASE_URL || 'https://api.kicksdb.com'}/v1/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.KICKSDB_API_KEY}`
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      const status = response.ok ? 'healthy' : 'degraded';

      return {
        service: 'kicksdb_api',
        status,
        response_time_ms: Date.now() - startTime,
        details: { status_code: response.status },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        service: 'kicksdb_api',
        status: 'unhealthy',
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get system metrics
   */
  async getMetrics(
    metricName?: string,
    hours: number = 24
  ): Promise<{ metrics: any[]; error?: string }> {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);

      let query = this.supabase
        .from('system_metrics')
        .select('*')
        .gte('created_at', startTime.toISOString())
        .order('created_at', { ascending: false });

      if (metricName) {
        query = query.eq('metric_name', metricName);
      }

      const { data, error } = await query;

      if (error) {
        return { metrics: [], error: error.message };
      }

      return { metrics: data || [] };

    } catch (error) {
      console.error('Error getting metrics:', error);
      return {
        metrics: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Record webhook processing metrics
   */
  async recordWebhookMetrics(
    eventType: string,
    processingTimeMs: number,
    success: boolean
  ): Promise<void> {
    await Promise.all([
      this.recordMetric({
        metric_name: 'webhook_processing_time',
        metric_value: processingTimeMs,
        tags: { event_type: eventType, success: success.toString() }
      }),
      this.recordMetric({
        metric_name: 'webhook_events_processed',
        metric_value: 1,
        tags: { event_type: eventType, success: success.toString() }
      })
    ]);
  }

  /**
   * Record stock operation metrics
   */
  async recordStockMetrics(
    operation: string,
    success: boolean,
    responseTimeMs: number
  ): Promise<void> {
    await Promise.all([
      this.recordMetric({
        metric_name: 'stock_operation_time',
        metric_value: responseTimeMs,
        tags: { operation, success: success.toString() }
      }),
      this.recordMetric({
        metric_name: 'stock_operations_total',
        metric_value: 1,
        tags: { operation, success: success.toString() }
      })
    ]);
  }
}