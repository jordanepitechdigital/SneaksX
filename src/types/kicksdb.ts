// KicksDB API Types
export interface KicksDBBrand {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  logo?: string;
}

export interface KicksDBProduct {
  id: string;
  name: string;
  slug: string;
  brand: string;
  retailPrice: number;
  releaseDate: string;
  colorway: string;
  images: string[];
  description?: string;
  sku: string;
  category: string;
  gender: string;
  marketplace: 'stockx' | 'goat';
  market: {
    lowestAsk: number;
    highestBid: number;
    lastSale: number;
    changeValue: number;
    changePercentage: number;
    volatility: number;
    deadstockSold: number;
    annualHigh: number;
    annualLow: number;
  };
  sizes: {
    size: string;
    price: number;
    currency: string;
  }[];
}

export interface KicksDBProductsResponse {
  success: boolean;
  data: KicksDBProduct[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export interface KicksDBBrandsResponse {
  success: boolean;
  data: KicksDBBrand[];
}

export interface KicksDBSearchParams {
  query?: string;
  brand?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

export interface KicksDBAPIError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface APIConfig {
  baseURL: string;
  apiKey: string;
  timeout: number;
  rateLimitPerMinute: number;
  maxRetries: number;
  retryDelay: number;
}