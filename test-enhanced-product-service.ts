/**
 * Test Enhanced Product Service Implementation
 * Validates Task 11.1 completion - Product Service API with BaseApiService integration
 */

import { productApiService } from './src/services/api/products'
import type { ProductFilters, ProductSortOptions } from './src/services/api/products'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL'
  message: string
  duration?: number
  data?: any
}

const results: TestResult[] = []

function logResult(result: TestResult) {
  const status = result.status === 'PASS' ? '✅' : '❌'
  console.log(`${status} ${result.name}: ${result.message}${result.duration ? ` (${result.duration}ms)` : ''}`)
  results.push(result)
}

async function testWithTimer<T>(
  name: string,
  testFn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now()
  try {
    const result = await testFn()
    const duration = Date.now() - start
    return { result, duration }
  } catch (error) {
    const duration = Date.now() - start
    throw { error, duration }
  }
}

async function testEnhancedProductService() {
  console.log('🧪 Testing Enhanced Product Service Implementation (Task 11.1)\n')

  // Test 1: Basic Product Fetching
  try {
    const { result, duration } = await testWithTimer('Basic Product Fetching', async () => {
      const response = await productApiService.getProducts({ page: 1, limit: 5 })
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Basic Product Fetching',
      status: 'PASS',
      message: `Fetched ${result.products.length} products`,
      duration,
      data: result.totalPages
    })
  } catch (error: any) {
    logResult({
      name: 'Basic Product Fetching',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 2: Advanced Filtering
  try {
    const filters: ProductFilters = {
      minPrice: 50,
      maxPrice: 200,
      inStock: true
    }

    const { result, duration } = await testWithTimer('Advanced Filtering', async () => {
      const response = await productApiService.getProducts(
        { page: 1, limit: 10 },
        filters
      )
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Advanced Filtering',
      status: 'PASS',
      message: `Filtered products (€50-200, in stock): ${result.products.length} results`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Advanced Filtering',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 3: Product Search
  try {
    const { result, duration } = await testWithTimer('Product Search', async () => {
      const response = await productApiService.searchProducts(
        'nike',
        { page: 1, limit: 5 },
        {},
        { field: 'name', direction: 'asc' }
      )
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Product Search',
      status: 'PASS',
      message: `Search "nike": ${result.products.length} results`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Product Search',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 4: Search Suggestions
  try {
    const { result, duration } = await testWithTimer('Search Suggestions', async () => {
      const response = await productApiService.getSearchSuggestions('air', 5)
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Search Suggestions',
      status: 'PASS',
      message: `Suggestions for "air": ${result.length} suggestions`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Search Suggestions',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 5: Featured Products
  try {
    const { result, duration } = await testWithTimer('Featured Products', async () => {
      const response = await productApiService.getFeaturedProducts(6)
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Featured Products',
      status: 'PASS',
      message: `Featured products: ${result.length} products`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Featured Products',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 6: Product Recommendations
  try {
    // First get a product to test recommendations
    const productsResponse = await productApiService.getProducts({ page: 1, limit: 1 })
    if (productsResponse.error || !productsResponse.data?.products.length) {
      throw new Error('No products available for recommendation test')
    }

    const productId = productsResponse.data.products[0].id

    const { result, duration } = await testWithTimer('Product Recommendations', async () => {
      const response = await productApiService.getRecommendations(productId, undefined, 12)
      if (response.error) throw response.error
      return response.data!
    })

    const totalRecommendations = result.similar.length + result.popular.length +
                                 result.crossSell.length + result.recentlyViewed.length

    logResult({
      name: 'Product Recommendations',
      status: 'PASS',
      message: `Recommendations: ${totalRecommendations} total (${result.similar.length} similar, ${result.popular.length} popular, ${result.crossSell.length} cross-sell)`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Product Recommendations',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 7: Brands API
  try {
    const { result, duration } = await testWithTimer('Brands API', async () => {
      const response = await productApiService.getBrands()
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Brands API',
      status: 'PASS',
      message: `Available brands: ${result.length} brands`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Brands API',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 8: Categories API
  try {
    const { result, duration } = await testWithTimer('Categories API', async () => {
      const response = await productApiService.getCategories()
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Categories API',
      status: 'PASS',
      message: `Available categories: ${result.length} categories`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Categories API',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 9: Single Product Retrieval
  try {
    // Get a product ID first
    const productsResponse = await productApiService.getProducts({ page: 1, limit: 1 })
    if (productsResponse.error || !productsResponse.data?.products.length) {
      throw new Error('No products available for single product test')
    }

    const productId = productsResponse.data.products[0].id

    const { result, duration } = await testWithTimer('Single Product Retrieval', async () => {
      const response = await productApiService.getProduct(productId)
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Single Product Retrieval',
      status: 'PASS',
      message: `Retrieved product: ${result.name} (${result.brand})`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Single Product Retrieval',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 10: Cache Performance
  try {
    console.log('\n🔄 Testing cache performance...')

    // First call (cache miss)
    const { duration: firstCall } = await testWithTimer('Cache Miss', async () => {
      const response = await productApiService.getProducts({ page: 1, limit: 5 })
      if (response.error) throw response.error
      return response.data!
    })

    // Second call (cache hit)
    const { duration: secondCall } = await testWithTimer('Cache Hit', async () => {
      const response = await productApiService.getProducts({ page: 1, limit: 5 })
      if (response.error) throw response.error
      return response.data!
    })

    const improvement = Math.round(((firstCall - secondCall) / firstCall) * 100)

    logResult({
      name: 'Cache Performance',
      status: improvement > 0 ? 'PASS' : 'FAIL',
      message: `Cache hit ${improvement}% faster (${firstCall}ms → ${secondCall}ms)`,
      duration: secondCall
    })
  } catch (error: any) {
    logResult({
      name: 'Cache Performance',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Summary
  console.log('\n📊 Test Summary:')
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const total = results.length

  console.log(`✅ Passed: ${passed}/${total}`)
  console.log(`❌ Failed: ${failed}/${total}`)
  console.log(`📈 Success Rate: ${Math.round((passed / total) * 100)}%`)

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Task 11.1 - Enhanced Product Service is fully functional.')
  } else {
    console.log('\n⚠️  Some tests failed. Please review the implementation.')
  }

  return {
    passed,
    failed,
    total,
    successRate: Math.round((passed / total) * 100),
    results
  }
}

// Run the tests
if (require.main === module) {
  testEnhancedProductService()
    .then(summary => {
      process.exit(summary.failed > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    })
}

export { testEnhancedProductService }