// Database Schema Types for Supabase
export interface DBBrand {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface DBProduct {
  id: string;
  kicksdb_id: string;
  name: string;
  slug: string;
  brand_id: string;
  retail_price: number;
  release_date: string;
  colorway: string;
  description?: string;
  sku: string;
  category: string;
  gender: string;
  marketplace: 'stockx' | 'goat';
  status: 'active' | 'inactive' | 'discontinued';
  created_at: string;
  updated_at: string;
  last_synced_at: string;

  // Relations
  brand?: DBBrand;
  images?: DBProductImage[];
  market_data?: DBProductMarket[];
  sizes?: DBProductSize[];
}

export interface DBProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt_text?: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface DBProductMarket {
  id: string;
  product_id: string;
  lowest_ask: number;
  highest_bid: number;
  last_sale: number;
  change_value: number;
  change_percentage: number;
  volatility: number;
  deadstock_sold: number;
  annual_high: number;
  annual_low: number;
  recorded_at: string;
  created_at: string;
}

export interface DBProductSize {
  id: string;
  product_id: string;
  size: string;
  price: number;
  currency: string;
  is_available: boolean;
  last_updated: string;
  created_at: string;
}

export interface DBSyncLog {
  id: string;
  sync_type: 'full' | 'incremental' | 'brands' | 'products';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  items_processed: number;
  items_created: number;
  items_updated: number;
  items_failed: number;
  error_message?: string;
  metadata?: Record<string, any>;
}

export interface DBSyncError {
  id: string;
  sync_log_id: string;
  item_type: 'brand' | 'product';
  item_id: string;
  error_type: 'validation' | 'api' | 'database' | 'transformation';
  error_message: string;
  error_details?: Record<string, any>;
  retry_count: number;
  created_at: string;
}

// Sync Configuration
export interface SyncConfig {
  enabled: boolean;
  full_sync_interval_hours: number;
  incremental_sync_interval_minutes: number;
  max_products_per_sync: number;
  image_limit_per_product: number;
  retry_attempts: number;
  batch_size: number;
  concurrent_requests: number;
}