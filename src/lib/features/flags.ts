import { createClient } from '@supabase/supabase-js';

export interface FeatureFlag {
  key: string;
  value: any;
  description?: string;
  updated_at: string;
  created_at: string;
}

export interface FeatureFlagUpdate {
  key: string;
  value: any;
  description?: string;
}

export class FeatureFlagService {
  private supabase;
  private cache = new Map<string, { value: any; expiry: number }>();
  private cacheTimeMs = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get feature flag value with caching
   */
  async getFlag<T = any>(key: string, defaultValue?: T): Promise<T> {
    try {
      // Check cache first
      const cached = this.cache.get(key);
      if (cached && Date.now() < cached.expiry) {
        return cached.value as T;
      }

      // Fetch from database
      const { data, error } = await this.supabase
        .from('sync_config')
        .select('value')
        .eq('key', key)
        .single();

      if (error || !data) {
        if (defaultValue !== undefined) {
          return defaultValue;
        }
        throw new Error(`Feature flag '${key}' not found`);
      }

      const value = data.value;

      // Cache the value
      this.cache.set(key, {
        value,
        expiry: Date.now() + this.cacheTimeMs
      });

      return value as T;

    } catch (error) {
      console.error(`Error getting feature flag '${key}':`, error);
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw error;
    }
  }

  /**
   * Get multiple feature flags at once
   */
  async getFlags(keys: string[]): Promise<Record<string, any>> {
    try {
      const { data, error } = await this.supabase
        .from('sync_config')
        .select('key, value')
        .in('key', keys);

      if (error) {
        throw error;
      }

      const flags: Record<string, any> = {};
      data?.forEach(flag => {
        flags[flag.key] = flag.value;

        // Cache the value
        this.cache.set(flag.key, {
          value: flag.value,
          expiry: Date.now() + this.cacheTimeMs
        });
      });

      return flags;

    } catch (error) {
      console.error('Error getting feature flags:', error);
      return {};
    }
  }

  /**
   * Set feature flag value
   */
  async setFlag(key: string, value: any, description?: string): Promise<void> {
    try {
      await this.supabase
        .from('sync_config')
        .upsert({
          key,
          value,
          description,
          updated_at: new Date().toISOString()
        });

      // Update cache
      this.cache.set(key, {
        value,
        expiry: Date.now() + this.cacheTimeMs
      });

    } catch (error) {
      console.error(`Error setting feature flag '${key}':`, error);
      throw error;
    }
  }

  /**
   * Update multiple feature flags
   */
  async setFlags(updates: FeatureFlagUpdate[]): Promise<void> {
    try {
      const records = updates.map(update => ({
        key: update.key,
        value: update.value,
        description: update.description,
        updated_at: new Date().toISOString()
      }));

      await this.supabase
        .from('sync_config')
        .upsert(records);

      // Update cache
      updates.forEach(update => {
        this.cache.set(update.key, {
          value: update.value,
          expiry: Date.now() + this.cacheTimeMs
        });
      });

    } catch (error) {
      console.error('Error setting feature flags:', error);
      throw error;
    }
  }

  /**
   * Delete feature flag
   */
  async deleteFlag(key: string): Promise<void> {
    try {
      await this.supabase
        .from('sync_config')
        .delete()
        .eq('key', key);

      // Remove from cache
      this.cache.delete(key);

    } catch (error) {
      console.error(`Error deleting feature flag '${key}':`, error);
      throw error;
    }
  }

  /**
   * List all feature flags
   */
  async listFlags(): Promise<FeatureFlag[]> {
    try {
      const { data, error } = await this.supabase
        .from('sync_config')
        .select('key, value, description, updated_at, created_at')
        .order('key');

      if (error) {
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('Error listing feature flags:', error);
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  // Predefined feature flag getters for type safety

  /**
   * Check if monitor updates stock (should always be false per requirements)
   */
  async isMonitorStockUpdateEnabled(): Promise<boolean> {
    return await this.getFlag('FEATURE_MONITOR_UPDATES_STOCK', false);
  }

  /**
   * Check if price updates from monitors are enabled
   */
  async isPriceUpdateEnabled(): Promise<boolean> {
    return await this.getFlag('MONITOR_PRICE_UPDATE_ENABLED', true);
  }

  /**
   * Check if stock monitoring (tracking only) is enabled
   */
  async isStockMonitoringEnabled(): Promise<boolean> {
    return await this.getFlag('MONITOR_STOCK_UPDATE_ENABLED', false);
  }

  /**
   * Check if new product detection is enabled
   */
  async isNewProductDetectionEnabled(): Promise<boolean> {
    return await this.getFlag('MONITOR_NEW_PRODUCT_ENABLED', true);
  }

  /**
   * Get webhook rate limit per minute
   */
  async getWebhookRateLimit(): Promise<number> {
    return await this.getFlag('WEBHOOK_RATE_LIMIT_PER_MINUTE', 100);
  }

  /**
   * Check if webhook signature verification is required
   */
  async isWebhookSignatureRequired(): Promise<boolean> {
    return await this.getFlag('WEBHOOK_SIGNATURE_REQUIRED', true);
  }

  /**
   * Get stock reservation TTL in minutes
   */
  async getStockReservationTTL(): Promise<number> {
    return await this.getFlag('STOCK_RESERVATION_TTL_MINUTES', 15);
  }

  /**
   * Get audit log retention days
   */
  async getAuditLogRetentionDays(): Promise<number> {
    return await this.getFlag('AUDIT_LOG_RETENTION_DAYS', 90);
  }

  /**
   * Get metrics retention days
   */
  async getMetricsRetentionDays(): Promise<number> {
    return await this.getFlag('METRICS_RETENTION_DAYS', 30);
  }

  /**
   * Get monitor configuration for a specific type
   */
  async getMonitorConfig(): Promise<{
    priceUpdateEnabled: boolean;
    stockMonitoringEnabled: boolean;
    newProductDetectionEnabled: boolean;
    stockUpdateEnabled: boolean;
    rateLimitPerMinute: number;
    signatureRequired: boolean;
  }> {
    const flags = await this.getFlags([
      'MONITOR_PRICE_UPDATE_ENABLED',
      'MONITOR_STOCK_UPDATE_ENABLED',
      'MONITOR_NEW_PRODUCT_ENABLED',
      'FEATURE_MONITOR_UPDATES_STOCK',
      'WEBHOOK_RATE_LIMIT_PER_MINUTE',
      'WEBHOOK_SIGNATURE_REQUIRED'
    ]);

    return {
      priceUpdateEnabled: flags.MONITOR_PRICE_UPDATE_ENABLED ?? true,
      stockMonitoringEnabled: flags.MONITOR_STOCK_UPDATE_ENABLED ?? false,
      newProductDetectionEnabled: flags.MONITOR_NEW_PRODUCT_ENABLED ?? true,
      stockUpdateEnabled: flags.FEATURE_MONITOR_UPDATES_STOCK ?? false, // Always false per requirements
      rateLimitPerMinute: flags.WEBHOOK_RATE_LIMIT_PER_MINUTE ?? 100,
      signatureRequired: flags.WEBHOOK_SIGNATURE_REQUIRED ?? true
    };
  }

  /**
   * Validate monitor configuration
   */
  validateMonitorConfig(): {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Critical validation: FEATURE_MONITOR_UPDATES_STOCK must be false
    this.getFlag('FEATURE_MONITOR_UPDATES_STOCK', false).then(value => {
      if (value === true) {
        errors.push('FEATURE_MONITOR_UPDATES_STOCK is enabled but should be disabled per requirements');
      }
    });

    return {
      isValid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Initialize default feature flags
   */
  async initializeDefaults(): Promise<void> {
    const defaultFlags: FeatureFlagUpdate[] = [
      {
        key: 'FEATURE_MONITOR_UPDATES_STOCK',
        value: false,
        description: 'Whether monitor webhooks can update stock (locked to false per requirements)'
      },
      {
        key: 'MONITOR_PRICE_UPDATE_ENABLED',
        value: true,
        description: 'Enable price updates from monitor webhooks'
      },
      {
        key: 'MONITOR_STOCK_UPDATE_ENABLED',
        value: false,
        description: 'Enable stock tracking from monitor webhooks (monitoring only)'
      },
      {
        key: 'MONITOR_NEW_PRODUCT_ENABLED',
        value: true,
        description: 'Enable new product detection from monitor webhooks'
      },
      {
        key: 'WEBHOOK_RATE_LIMIT_PER_MINUTE',
        value: 100,
        description: 'Rate limit for webhook endpoints per minute'
      },
      {
        key: 'WEBHOOK_SIGNATURE_REQUIRED',
        value: true,
        description: 'Require webhook signature verification'
      },
      {
        key: 'STOCK_RESERVATION_TTL_MINUTES',
        value: 15,
        description: 'Default TTL for stock reservations in minutes'
      },
      {
        key: 'AUDIT_LOG_RETENTION_DAYS',
        value: 90,
        description: 'Number of days to retain audit logs'
      },
      {
        key: 'METRICS_RETENTION_DAYS',
        value: 30,
        description: 'Number of days to retain system metrics'
      }
    ];

    // Only set flags that don't already exist
    for (const flag of defaultFlags) {
      try {
        const existing = await this.supabase
          .from('sync_config')
          .select('key')
          .eq('key', flag.key)
          .single();

        if (!existing.data) {
          await this.setFlag(flag.key, flag.value, flag.description);
        }
      } catch (error) {
        // Flag doesn't exist, create it
        await this.setFlag(flag.key, flag.value, flag.description);
      }
    }
  }
}