import type {
  KicksDBProduct,
  KicksDBProductsResponse,
  KicksDBBrandsResponse,
  KicksDBSearchParams,
  APIConfig,
  RateLimitInfo,
} from '@/types/kicksdb';
import { RateLimiter } from './rate-limiter';
import {
  KicksDBAPIError,
  RateLimitError,
  AuthenticationError,
  NetworkError,
  createErrorFromResponse,
} from './api-error';

/**
 * KicksDB API Client with rate limiting and error handling
 */
export class KicksDBClient {
  private readonly config: APIConfig;
  private readonly rateLimiter: RateLimiter;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;

  constructor(config: Partial<APIConfig> = {}) {
    this.config = {
      baseURL: 'https://api.kicks.dev',
      apiKey: process.env.KICKSDB_API_KEY || 'KICKS-97EF-725F-A605-58232DC70EED',
      timeout: 30000,
      rateLimitPerMinute: 640,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };

    this.rateLimiter = new RateLimiter(this.config.rateLimitPerMinute);
  }

  /**
   * Make authenticated HTTP request with rate limiting and retries
   */
  private async makeRequest<T>(
    endpoint: string,
    params: Record<string, any> = {},
    retryCount: number = 0
  ): Promise<T> {
    // Enforce rate limiting
    await this.rateLimiter.waitForAvailability();

    const url = new URL(endpoint, this.config.baseURL);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      this.requestCount++;
      this.lastRequestTime = Date.now();

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SneaksX/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

        if (retryCount < this.config.maxRetries) {
          console.log(`Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.makeRequest<T>(endpoint, params, retryCount + 1);
        }

        throw new RateLimitError(waitTime / 1000);
      }

      // Handle authentication errors
      if (response.status === 401) {
        throw new AuthenticationError('Invalid API key');
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        throw createErrorFromResponse(
          response.status,
          errorData.message || `HTTP ${response.status}`,
          { data: errorData, headers: Object.fromEntries(response.headers) }
        );
      }

      const data = await response.json();

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new KicksDBAPIError('Invalid response format', 'INVALID_RESPONSE');
      }

      return data as T;

    } catch (error) {
      clearTimeout(timeoutId);

      // Handle network errors with retry logic
      if (error instanceof TypeError || error.name === 'AbortError') {
        if (retryCount < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, retryCount);
          console.log(`Network error. Retrying in ${delay}ms (attempt ${retryCount + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest<T>(endpoint, params, retryCount + 1);
        }

        throw new NetworkError(
          error.name === 'AbortError'
            ? 'Request timeout'
            : 'Network connection failed',
          error as Error
        );
      }

      // Re-throw known errors
      if (error instanceof KicksDBAPIError) {
        throw error;
      }

      // Wrap unknown errors
      throw new KicksDBAPIError(
        'Unexpected error occurred',
        'UNKNOWN_ERROR',
        undefined,
        error
      );
    }
  }

  /**
   * Get all brands with product counts
   */
  async getBrands(): Promise<KicksDBBrandsResponse> {
    return this.makeRequest<KicksDBBrandsResponse>('/v3/utils/brands');
  }

  /**
   * Search StockX products
   */
  async getStockXProducts(params: KicksDBSearchParams = {}): Promise<KicksDBProductsResponse> {
    return this.makeRequest<KicksDBProductsResponse>('/v3/stockx/products', params);
  }

  /**
   * Search GOAT products
   */
  async getGOATProducts(params: KicksDBSearchParams = {}): Promise<KicksDBProductsResponse> {
    return this.makeRequest<KicksDBProductsResponse>('/v3/goat/products', params);
  }

  /**
   * Get detailed product information by slug
   */
  async getProductDetails(slug: string, marketplace: 'stockx' | 'goat' = 'stockx'): Promise<KicksDBProduct> {
    const endpoint = marketplace === 'stockx'
      ? `/v3/stockx/products/${slug}`
      : `/v3/goat/products/${slug}`;

    const response = await this.makeRequest<{ success: boolean; data: KicksDBProduct }>(endpoint);

    if (!response.success || !response.data) {
      throw new KicksDBAPIError('Product not found', 'PRODUCT_NOT_FOUND', 404);
    }

    return response.data;
  }

  /**
   * Search products across both marketplaces
   */
  async searchProducts(params: KicksDBSearchParams = {}): Promise<{
    stockx: KicksDBProductsResponse;
    goat: KicksDBProductsResponse;
  }> {
    const [stockx, goat] = await Promise.all([
      this.getStockXProducts(params),
      this.getGOATProducts(params),
    ]);

    return { stockx, goat };
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitInfo & { requestCount: number; lastRequestTime: number } {
    const { remaining, resetTime } = this.rateLimiter.getStatus();

    return {
      limit: this.config.rateLimitPerMinute,
      remaining,
      reset: resetTime,
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
    };
  }

  /**
   * Reset rate limiter and counters
   */
  resetRateLimit(): void {
    this.rateLimiter.reset();
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }

  /**
   * Test API connectivity and authentication
   */
  async testConnection(): Promise<{ success: boolean; message: string; latency: number }> {
    const startTime = Date.now();

    try {
      await this.getBrands();
      const latency = Date.now() - startTime;

      return {
        success: true,
        message: 'API connection successful',
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        latency,
      };
    }
  }
}