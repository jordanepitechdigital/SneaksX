/**
 * KicksDB API Client - Export all components
 */
export { KicksDBClient } from './client';
export { RateLimiter } from './rate-limiter';
export {
  KicksDBAPIError,
  RateLimitError,
  AuthenticationError,
  NetworkError,
  ValidationError,
  createErrorFromResponse,
} from './api-error';

// Import the class to create instances
import { KicksDBClient } from './client';

// Create default client instance
export const kicksDBClient = new KicksDBClient();

// Export client factory for custom configurations
export const createKicksDBClient = (config?: Parameters<typeof KicksDBClient>[0]) => {
  return new KicksDBClient(config);
};