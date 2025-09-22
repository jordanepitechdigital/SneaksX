import { createClient } from '@supabase/supabase-js';
import type { DBProduct, DBBrand, DBSyncLog, DBSyncError } from '@/types/database';

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for authenticated operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client for admin operations (sync operations)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Database types for better TypeScript support
export type Database = {
  public: {
    Tables: {
      products: {
        Row: DBProduct;
        Insert: Omit<DBProduct, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DBProduct, 'id' | 'created_at'>>;
      };
      brands: {
        Row: DBBrand;
        Insert: Omit<DBBrand, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DBBrand, 'id' | 'created_at'>>;
      };
      sync_logs: {
        Row: DBSyncLog;
        Insert: Omit<DBSyncLog, 'id'>;
        Update: Partial<Omit<DBSyncLog, 'id'>>;
      };
      sync_errors: {
        Row: DBSyncError;
        Insert: Omit<DBSyncError, 'id'>;
        Update: Partial<Omit<DBSyncError, 'id'>>;
      };
    };
  };
};

/**
 * Database utility functions for sync operations
 */
export class DatabaseService {
  private client = supabaseAdmin;

  /**
   * Get sync configuration value
   */
  async getSyncConfig(key: string): Promise<any> {
    const { data, error } = await this.client
      .from('sync_config')
      .select('value')
      .eq('key', key)
      .single();

    if (error) {
      throw new Error(`Failed to get sync config for ${key}: ${error.message}`);
    }

    return data?.value;
  }

  /**
   * Update sync configuration
   */
  async updateSyncConfig(key: string, value: any): Promise<void> {
    const { error } = await this.client
      .from('sync_config')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to update sync config for ${key}: ${error.message}`);
    }
  }

  /**
   * Create a new sync log entry
   */
  async createSyncLog(data: {
    sync_type: string;
    started_at: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const { data: syncLog, error } = await this.client
      .from('sync_logs')
      .insert({
        ...data,
        status: 'syncing',
        items_processed: 0,
        items_created: 0,
        items_updated: 0,
        items_failed: 0,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create sync log: ${error.message}`);
    }

    return syncLog.id;
  }

  /**
   * Update sync log with progress
   */
  async updateSyncLog(
    id: string,
    updates: {
      status?: 'running' | 'completed' | 'failed' | 'cancelled';
      completed_at?: string;
      items_processed?: number;
      items_created?: number;
      items_updated?: number;
      items_failed?: number;
      error_message?: string;
    }
  ): Promise<void> {
    const { error } = await this.client
      .from('sync_logs')
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update sync log: ${error.message}`);
    }
  }

  /**
   * Log sync error
   */
  async logSyncError(data: {
    sync_log_id: string;
    item_type: string;
    item_id: string;
    error_type: string;
    error_message: string;
    error_details?: Record<string, any>;
    retry_count?: number;
  }): Promise<void> {
    const { error } = await this.client
      .from('sync_errors')
      .insert({
        ...data,
        retry_count: data.retry_count || 0,
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to log sync error: ${error.message}`);
    }
  }

  /**
   * Get brand by KicksDB name
   */
  async getBrandByKicksDBName(kicksdbName: string): Promise<DBBrand | null> {
    const { data, error } = await this.client
      .from('brands')
      .select('*')
      .eq('kicksdb_name', kicksdbName)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get brand: ${error.message}`);
    }

    return data;
  }

  /**
   * Get product by KicksDB ID
   */
  async getProductByKicksDBId(kicksdbId: string): Promise<DBProduct | null> {
    const { data, error } = await this.client
      .from('products')
      .select('*')
      .eq('kicksdb_id', kicksdbId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get product: ${error.message}`);
    }

    return data;
  }

  /**
   * Upsert brand
   */
  async upsertBrand(brand: Partial<DBBrand>): Promise<DBBrand> {
    const { data, error } = await this.client
      .from('brands')
      .upsert(brand, { onConflict: 'kicksdb_name' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert brand: ${error.message}`);
    }

    return data;
  }

  /**
   * Upsert product
   */
  async upsertProduct(product: Partial<DBProduct>): Promise<DBProduct> {
    const { data, error } = await this.client
      .from('products')
      .upsert(product, { onConflict: 'kicksdb_id' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert product: ${error.message}`);
    }

    return data;
  }

  /**
   * Get recent sync logs
   */
  async getRecentSyncLogs(limit: number = 10): Promise<DBSyncLog[]> {
    const { data, error } = await this.client
      .from('sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get sync logs: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get sync errors for a log
   */
  async getSyncErrors(syncLogId: string): Promise<DBSyncError[]> {
    const { data, error } = await this.client
      .from('sync_errors')
      .select('*')
      .eq('sync_log_id', syncLogId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get sync errors: ${error.message}`);
    }

    return data || [];
  }
}