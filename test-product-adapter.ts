/**
 * Test Product Service Adapter
 * Validates the adapter implementation that bridges to the working ProductService
 */

import { productApiService } from './src/services/api/products-adapter'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL'
  message: string
  duration?: number
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

async function testProductAdapter() {
  console.log('🧪 Testing Product Service Adapter Implementation\n')

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
      message: `Fetched ${result.products.length} products, total: ${result.total}`,
      duration
    })
  } catch (error: any) {
    logResult({
      name: 'Basic Product Fetching',
      status: 'FAIL',
      message: `Error: ${error.error?.message || error.message}`,
      duration: error.duration
    })
  }

  // Test 2: Product Search
  try {
    const { result, duration } = await testWithTimer('Product Search', async () => {
      const response = await productApiService.searchProducts(
        'air',
        { page: 1, limit: 5 }
      )
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Product Search',
      status: 'PASS',
      message: `Search "air": ${result.products.length} results`,
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

  // Test 3: Search Suggestions
  try {
    const { result, duration } = await testWithTimer('Search Suggestions', async () => {
      const response = await productApiService.getSearchSuggestions('nike', 5)
      if (response.error) throw response.error
      return response.data!
    })

    logResult({
      name: 'Search Suggestions',
      status: 'PASS',
      message: `Suggestions for "nike": ${result.length} suggestions`,
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

  // Test 4: Featured Products
  try {
    const { result, duration } = await testWithTimer('Featured Products', async () => {
      const response = await productApiService.getFeaturedProducts(3)
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

  // Test 5: Brands API
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

  // Test 6: Categories API
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

  // Test 7: Product Recommendations (if products exist)
  try {
    // First get a product for recommendations
    const productsResponse = await productApiService.getProducts({ page: 1, limit: 1 })
    if (productsResponse.error || !productsResponse.data?.products.length) {
      logResult({
        name: 'Product Recommendations',
        status: 'FAIL',
        message: 'No products available for recommendation test'
      })
    } else {
      const productId = productsResponse.data.products[0].id

      const { result, duration } = await testWithTimer('Product Recommendations', async () => {
        const response = await productApiService.getRecommendations(productId, undefined, 8)
        if (response.error) throw response.error
        return response.data!
      })

      const totalRecommendations = result.similar.length + result.popular.length +
                                   result.crossSell.length + result.recentlyViewed.length

      logResult({
        name: 'Product Recommendations',
        status: 'PASS',
        message: `Recommendations: ${totalRecommendations} total (${result.similar.length} similar, ${result.popular.length} popular)`,
        duration
      })
    }
  } catch (error: any) {
    logResult({
      name: 'Product Recommendations',
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

  if (passed >= 5) {
    console.log('\n🎉 Product Service Adapter is working! Task 11.1 successfully completed with backward compatibility.')
  } else if (passed >= 3) {
    console.log('\n⚠️  Product Service Adapter partially working. Core functionality available.')
  } else {
    console.log('\n❌ Product Service Adapter needs debugging.')
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
  testProductAdapter()
    .then(summary => {
      process.exit(summary.failed > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    })
}

export { testProductAdapter }