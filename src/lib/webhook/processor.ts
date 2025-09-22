import { createClient } from '@supabase/supabase-js';

export interface WebhookEvent {
  event_id: string;
  event_type: string;
  product_id?: string;
  kicksdb_id?: string;
  old_value?: any;
  new_value?: any;
  change_amount?: number;
  timestamp: number;
  platform: string;
  market?: string;
  size?: string;
  [key: string]: any;
}

export interface ProcessingResult {
  success: boolean;
  error?: string;
  productId?: string;
  changes?: {
    priceUpdate?: boolean;
    stockUpdate?: boolean;
    newProduct?: boolean;
  };
}

export class WebhookEventProcessor {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Process incoming webhook event
   */
  async processEvent(event: WebhookEvent): Promise<ProcessingResult> {
    try {
      // Validate event structure
      const validation = this.validateEvent(event);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Check feature flags
      const featureFlags = await this.getFeatureFlags();

      switch (event.event_type) {
        case 'price_change':
          return await this.processPriceChange(event, featureFlags);

        case 'stock_change':
          return await this.processStockChange(event, featureFlags);

        case 'new_product':
          return await this.processNewProduct(event, featureFlags);

        case 'product_update':
          return await this.processProductUpdate(event, featureFlags);

        default:
          return { success: false, error: `Unknown event type: ${event.event_type}` };
      }
    } catch (error) {
      console.error('Error processing webhook event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      };
    }
  }

  /**
   * Validate webhook event structure
   */
  private validateEvent(event: WebhookEvent): { valid: boolean; error?: string } {
    if (!event.event_id) {
      return { valid: false, error: 'Missing event_id' };
    }

    if (!event.event_type) {
      return { valid: false, error: 'Missing event_type' };
    }

    if (!event.timestamp) {
      return { valid: false, error: 'Missing timestamp' };
    }

    // Validate timestamp is not too old (max 1 hour)
    const eventTime = event.timestamp * 1000; // Convert to milliseconds
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (Date.now() - eventTime > maxAge) {
      return { valid: false, error: 'Event timestamp too old' };
    }

    return { valid: true };
  }

  /**
   * Get feature flags from database
   */
  private async getFeatureFlags(): Promise<Record<string, any>> {
    try {
      const { data } = await this.supabase
        .from('sync_config')
        .select('key, value')
        .in('key', [
          'FEATURE_MONITOR_UPDATES_STOCK',
          'MONITOR_PRICE_UPDATE_ENABLED',
          'MONITOR_STOCK_UPDATE_ENABLED',
          'MONITOR_NEW_PRODUCT_ENABLED'
        ]);

      const flags: Record<string, any> = {};
      data?.forEach(config => {
        flags[config.key] = config.value;
      });

      // Set defaults
      flags.FEATURE_MONITOR_UPDATES_STOCK = flags.FEATURE_MONITOR_UPDATES_STOCK ?? false;
      flags.MONITOR_PRICE_UPDATE_ENABLED = flags.MONITOR_PRICE_UPDATE_ENABLED ?? true;
      flags.MONITOR_STOCK_UPDATE_ENABLED = flags.MONITOR_STOCK_UPDATE_ENABLED ?? false;
      flags.MONITOR_NEW_PRODUCT_ENABLED = flags.MONITOR_NEW_PRODUCT_ENABLED ?? true;

      return flags;
    } catch (error) {
      console.error('Error fetching feature flags:', error);
      return {
        FEATURE_MONITOR_UPDATES_STOCK: false,
        MONITOR_PRICE_UPDATE_ENABLED: true,
        MONITOR_STOCK_UPDATE_ENABLED: false,
        MONITOR_NEW_PRODUCT_ENABLED: true
      };
    }
  }

  /**
   * Process price change event
   */
  private async processPriceChange(event: WebhookEvent, featureFlags: Record<string, any>): Promise<ProcessingResult> {
    if (!featureFlags.MONITOR_PRICE_UPDATE_ENABLED) {
      return { success: true, error: 'Price updates disabled by feature flag' };
    }

    // Find product by kicksdb_id
    const product = await this.findProductByKicksDbId(event.kicksdb_id);
    if (!product) {
      return { success: false, error: `Product not found: ${event.kicksdb_id}` };
    }

    try {
      // Update product price
      const updateData: any = {
        current_price: event.new_value?.price || event.new_value,
        price_last_updated: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Update price history
      if (event.old_value && event.new_value) {
        const priceHistory = product.price_history || [];
        priceHistory.push({
          timestamp: new Date().toISOString(),
          old_price: event.old_value?.price || event.old_value,
          new_price: event.new_value?.price || event.new_value,
          change_amount: event.change_amount,
          source: 'kicksdb_webhook'
        });

        // Keep only last 100 price changes
        updateData.price_history = priceHistory.slice(-100);
      }

      await this.supabase
        .from('products')
        .update(updateData)
        .eq('id', product.id);

      // Create monitor event
      await this.createMonitorEvent({
        product_id: product.id,
        event_type: 'price_change',
        old_value: event.old_value,
        new_value: event.new_value,
        change_amount: event.change_amount,
        platform: 'kicksdb',
        triggered_by: 'webhook'
      });

      return {
        success: true,
        productId: product.id,
        changes: { priceUpdate: true }
      };
    } catch (error) {
      console.error('Error updating product price:', error);
      return {
        success: false,
        error: `Failed to update product price: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Process stock change event (monitoring only, no stock updates)
   */
  private async processStockChange(event: WebhookEvent, featureFlags: Record<string, any>): Promise<ProcessingResult> {
    // IMPORTANT: Never update product_stock table from webhooks per requirements
    // Only create monitor events for tracking purposes

    const product = await this.findProductByKicksDbId(event.kicksdb_id);
    if (!product) {
      return { success: false, error: `Product not found: ${event.kicksdb_id}` };
    }

    try {
      // Create monitor event only - no stock updates
      await this.createMonitorEvent({
        product_id: product.id,
        event_type: 'stock_change',
        old_value: event.old_value,
        new_value: event.new_value,
        change_amount: event.change_amount,
        platform: 'kicksdb',
        triggered_by: 'webhook'
      });

      return {
        success: true,
        productId: product.id,
        changes: { stockUpdate: false } // Explicitly false per requirements
      };
    } catch (error) {
      console.error('Error creating stock change monitor event:', error);
      return {
        success: false,
        error: `Failed to log stock change: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Process new product event
   */
  private async processNewProduct(event: WebhookEvent, featureFlags: Record<string, any>): Promise<ProcessingResult> {
    if (!featureFlags.MONITOR_NEW_PRODUCT_ENABLED) {
      return { success: true, error: 'New product monitoring disabled by feature flag' };
    }

    try {
      // Check if product already exists
      const existingProduct = await this.findProductByKicksDbId(event.kicksdb_id);
      if (existingProduct) {
        return { success: true, productId: existingProduct.id };
      }

      // Create monitor event for new product detection
      await this.createMonitorEvent({
        product_id: null, // No product ID yet
        event_type: 'new_product',
        old_value: null,
        new_value: event.new_value,
        change_amount: null,
        platform: 'kicksdb',
        triggered_by: 'webhook'
      });

      return {
        success: true,
        changes: { newProduct: true }
      };
    } catch (error) {
      console.error('Error processing new product:', error);
      return {
        success: false,
        error: `Failed to process new product: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Process product update event
   */
  private async processProductUpdate(event: WebhookEvent, featureFlags: Record<string, any>): Promise<ProcessingResult> {
    const product = await this.findProductByKicksDbId(event.kicksdb_id);
    if (!product) {
      return { success: false, error: `Product not found: ${event.kicksdb_id}` };
    }

    try {
      // Update product metadata only (not prices or stock)
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Update specific fields if provided
      if (event.new_value?.name) updateData.name = event.new_value.name;
      if (event.new_value?.description) updateData.description = event.new_value.description;
      if (event.new_value?.tags) updateData.tags = event.new_value.tags;

      await this.supabase
        .from('products')
        .update(updateData)
        .eq('id', product.id);

      // Create monitor event
      await this.createMonitorEvent({
        product_id: product.id,
        event_type: 'product_update',
        old_value: event.old_value,
        new_value: event.new_value,
        change_amount: null,
        platform: 'kicksdb',
        triggered_by: 'webhook'
      });

      return {
        success: true,
        productId: product.id
      };
    } catch (error) {
      console.error('Error updating product:', error);
      return {
        success: false,
        error: `Failed to update product: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Find product by KicksDB ID
   */
  private async findProductByKicksDbId(kicksdbId?: string): Promise<any> {
    if (!kicksdbId) return null;

    const { data } = await this.supabase
      .from('products')
      .select('*')
      .eq('kicksdb_id', kicksdbId)
      .single();

    return data;
  }

  /**
   * Create monitor event record
   */
  private async createMonitorEvent(event: {
    product_id: string | null;
    event_type: string;
    old_value: any;
    new_value: any;
    change_amount: number | null;
    platform: string;
    triggered_by: string;
  }): Promise<void> {
    await this.supabase
      .from('monitor_events')
      .insert([event]);
  }
}