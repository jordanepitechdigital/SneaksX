import { createClient } from '@supabase/supabase-js';

export interface MonitorConfig {
  product_id: string;
  kicksdb_id: string;
  monitor_type: 'price' | 'stock' | 'both';
  frequency_minutes: 15 | 30 | 60 | 120; // KicksDB supported frequencies
  markets: ('US' | 'UK' | 'FR' | 'DE' | 'JP')[];
  price_threshold?: number; // Minimum price change to trigger
  stock_threshold?: number; // Minimum stock change to trigger
  is_active: boolean;
  webhook_url: string;
  created_at: string;
  updated_at: string;
}

export interface KicksDBMonitorRequest {
  product_id: string; // KicksDB product ID
  monitor_type: 'price_changes' | 'stock_changes' | 'new_products';
  frequency: '15min' | '30min' | '1hour' | '2hour';
  markets?: string[];
  webhook_url: string;
  signature_secret: string;
  filters?: {
    min_price_change?: number;
    min_stock_change?: number;
    size_specific?: boolean;
  };
}

export interface KicksDBMonitorResponse {
  monitor_id: string;
  status: 'active' | 'inactive' | 'error';
  message?: string;
  estimated_events_per_day?: number;
  next_check?: string;
}

export class MonitorConfigService {
  private supabase;
  private kicksdbApiKey: string;
  private kicksdbBaseUrl: string;
  private webhookBaseUrl: string;
  private webhookSecret: string;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.kicksdbApiKey = process.env.KICKSDB_API_KEY || '';
    this.kicksdbBaseUrl = process.env.KICKSDB_BASE_URL || 'https://api.kicksdb.com';
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    this.webhookSecret = process.env.KICKSDB_WEBHOOK_SECRET || '';

    if (!this.kicksdbApiKey) {
      console.warn('KicksDB API key not configured');
    }

    if (!this.webhookSecret) {
      console.warn('Webhook secret not configured');
    }
  }

  /**
   * Enable monitoring for a product
   */
  async enableMonitoring(config: {
    productId: string;
    kicksdbId: string;
    monitorType: 'price' | 'stock' | 'both';
    frequency: 15 | 30 | 60 | 120;
    markets: string[];
    priceThreshold?: number;
    stockThreshold?: number;
  }): Promise<{ success: boolean; monitorId?: string; error?: string }> {
    try {
      // Validate product exists
      const { data: product } = await this.supabase
        .from('products')
        .select('id, kicksdb_id, is_monitored')
        .eq('id', config.productId)
        .single();

      if (!product) {
        return { success: false, error: 'Product not found' };
      }

      if (product.kicksdb_id !== config.kicksdbId) {
        return { success: false, error: 'KicksDB ID mismatch' };
      }

      // Check if monitoring is already enabled
      if (product.is_monitored) {
        return { success: false, error: 'Monitoring already enabled for this product' };
      }

      // Create KicksDB monitors based on type
      const monitorResults: string[] = [];

      if (config.monitorType === 'price' || config.monitorType === 'both') {
        const priceMonitor = await this.createKicksDBMonitor({
          product_id: config.kicksdbId,
          monitor_type: 'price_changes',
          frequency: this.formatFrequency(config.frequency),
          markets: config.markets,
          webhook_url: `${this.webhookBaseUrl}/api/kicks/monitor`,
          signature_secret: this.webhookSecret,
          filters: {
            min_price_change: config.priceThreshold || 1.0
          }
        });

        if (priceMonitor.success) {
          monitorResults.push(priceMonitor.monitorId!);
        } else {
          return { success: false, error: `Failed to create price monitor: ${priceMonitor.error}` };
        }
      }

      if (config.monitorType === 'stock' || config.monitorType === 'both') {
        const stockMonitor = await this.createKicksDBMonitor({
          product_id: config.kicksdbId,
          monitor_type: 'stock_changes',
          frequency: this.formatFrequency(config.frequency),
          markets: config.markets,
          webhook_url: `${this.webhookBaseUrl}/api/kicks/monitor`,
          signature_secret: this.webhookSecret,
          filters: {
            min_stock_change: config.stockThreshold || 1
          }
        });

        if (stockMonitor.success) {
          monitorResults.push(stockMonitor.monitorId!);
        } else {
          return { success: false, error: `Failed to create stock monitor: ${stockMonitor.error}` };
        }
      }

      // Update product to mark as monitored
      await this.supabase
        .from('products')
        .update({
          is_monitored: true,
          monitor_price_threshold: config.priceThreshold,
          monitor_stock_threshold: config.stockThreshold,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.productId);

      // Store monitor configuration
      await this.supabase
        .from('sync_config')
        .upsert({
          key: `monitor_config_${config.productId}`,
          value: {
            kicksdb_id: config.kicksdbId,
            monitor_type: config.monitorType,
            frequency_minutes: config.frequency,
            markets: config.markets,
            price_threshold: config.priceThreshold,
            stock_threshold: config.stockThreshold,
            monitor_ids: monitorResults,
            enabled_at: new Date().toISOString()
          },
          description: `Monitor configuration for product ${config.productId}`
        });

      return {
        success: true,
        monitorId: monitorResults.join(',')
      };

    } catch (error) {
      console.error('Error enabling monitoring:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Disable monitoring for a product
   */
  async disableMonitoring(productId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get monitor configuration
      const { data: configData } = await this.supabase
        .from('sync_config')
        .select('value')
        .eq('key', `monitor_config_${productId}`)
        .single();

      if (configData?.value?.monitor_ids) {
        // Disable KicksDB monitors
        for (const monitorId of configData.value.monitor_ids) {
          await this.disableKicksDBMonitor(monitorId);
        }
      }

      // Update product
      await this.supabase
        .from('products')
        .update({
          is_monitored: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId);

      // Remove monitor configuration
      await this.supabase
        .from('sync_config')
        .delete()
        .eq('key', `monitor_config_${productId}`);

      return { success: true };

    } catch (error) {
      console.error('Error disabling monitoring:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get monitoring status for a product
   */
  async getMonitoringStatus(productId: string): Promise<{
    isMonitored: boolean;
    config?: any;
    status?: string;
    error?: string;
  }> {
    try {
      const { data: product } = await this.supabase
        .from('products')
        .select('is_monitored')
        .eq('id', productId)
        .single();

      if (!product) {
        return { isMonitored: false, error: 'Product not found' };
      }

      if (!product.is_monitored) {
        return { isMonitored: false };
      }

      const { data: configData } = await this.supabase
        .from('sync_config')
        .select('value')
        .eq('key', `monitor_config_${productId}`)
        .single();

      return {
        isMonitored: true,
        config: configData?.value,
        status: 'active'
      };

    } catch (error) {
      console.error('Error getting monitoring status:', error);
      return {
        isMonitored: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create KicksDB monitor via API
   */
  private async createKicksDBMonitor(request: KicksDBMonitorRequest): Promise<{
    success: boolean;
    monitorId?: string;
    error?: string;
  }> {
    try {
      if (!this.kicksdbApiKey) {
        return { success: false, error: 'KicksDB API key not configured' };
      }

      const response = await fetch(`${this.kicksdbBaseUrl}/v1/monitors`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.kicksdbApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `KicksDB API error: ${response.status} ${errorText}`
        };
      }

      const result: KicksDBMonitorResponse = await response.json();

      if (result.status === 'error') {
        return {
          success: false,
          error: result.message || 'Unknown KicksDB error'
        };
      }

      return {
        success: true,
        monitorId: result.monitor_id
      };

    } catch (error) {
      console.error('Error creating KicksDB monitor:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Disable KicksDB monitor via API
   */
  private async disableKicksDBMonitor(monitorId: string): Promise<boolean> {
    try {
      if (!this.kicksdbApiKey) {
        console.warn('KicksDB API key not configured, cannot disable monitor');
        return false;
      }

      const response = await fetch(`${this.kicksdbBaseUrl}/v1/monitors/${monitorId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.kicksdbApiKey}`
        }
      });

      return response.ok;

    } catch (error) {
      console.error('Error disabling KicksDB monitor:', error);
      return false;
    }
  }

  /**
   * Format frequency for KicksDB API
   */
  private formatFrequency(minutes: number): '15min' | '30min' | '1hour' | '2hour' {
    switch (minutes) {
      case 15: return '15min';
      case 30: return '30min';
      case 60: return '1hour';
      case 120: return '2hour';
      default: return '1hour';
    }
  }

  /**
   * Enable new product detection monitor
   */
  async enableNewProductMonitor(markets: string[] = ['US']): Promise<{
    success: boolean;
    monitorId?: string;
    error?: string;
  }> {
    try {
      const monitor = await this.createKicksDBMonitor({
        product_id: '*', // Wildcard for new products
        monitor_type: 'new_products',
        frequency: '1hour',
        markets,
        webhook_url: `${this.webhookBaseUrl}/api/kicks/monitor`,
        signature_secret: this.webhookSecret
      });

      if (monitor.success) {
        // Store global monitor configuration
        await this.supabase
          .from('sync_config')
          .upsert({
            key: 'new_product_monitor',
            value: {
              monitor_id: monitor.monitorId,
              markets,
              enabled_at: new Date().toISOString()
            },
            description: 'New product detection monitor'
          });
      }

      return monitor;

    } catch (error) {
      console.error('Error enabling new product monitor:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all monitored products
   */
  async getMonitoredProducts(): Promise<{
    products: any[];
    total: number;
    error?: string;
  }> {
    try {
      const { data: products, error } = await this.supabase
        .from('products')
        .select(`
          id,
          name,
          kicksdb_id,
          is_monitored,
          monitor_price_threshold,
          monitor_stock_threshold,
          current_price,
          brands(name)
        `)
        .eq('is_monitored', true)
        .order('updated_at', { ascending: false });

      if (error) {
        return { products: [], total: 0, error: error.message };
      }

      return {
        products: products || [],
        total: products?.length || 0
      };

    } catch (error) {
      console.error('Error getting monitored products:', error);
      return {
        products: [],
        total: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}