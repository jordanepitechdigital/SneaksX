#!/usr/bin/env node

/**
 * KicksDB Free Tier Endpoints Testing
 *
 * Based on OpenAPI spec analysis, these endpoints should be available:
 * - /v3/goat/products (free access)
 * - /v3/stockx/products (free access)
 * - /v3/stockx/products/{id} (free access)
 * - /v3/utils/brands (not explicitly limited)
 */

const https = require('https');
const fs = require('fs');

const API_KEY = 'KICKS-97EF-725F-A605-58232DC70EED';
const BASE_URL = 'https://api.kicks.dev';

const testResults = {
    timestamp: new Date().toISOString(),
    keyType: 'Free',
    apiLimits: {
        monthlyQuota: 50000,
        rateLimitPerMinute: 640,
        realtimeLimit: '1 request per second'
    },
    workingEndpoints: {},
    sampleData: {},
    errors: []
};

function makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);

        const requestOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'User-Agent': 'SneaksX-Free-Tier-Validated/1.0'
            }
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const result = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data ? JSON.parse(data) : null,
                        rawData: data
                    };
                    resolve(result);
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: null,
                        rawData: data,
                        parseError: error.message
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

async function testEndpoint(endpoint, description) {
    console.log(`   Testing: ${endpoint}`);
    console.log(`   Description: ${description}`);

    try {
        const response = await makeRequest(endpoint);

        const result = {
            success: response.statusCode === 200,
            statusCode: response.statusCode,
            quota: response.headers['x-quota-current'],
            keyType: response.headers['x-key-type'],
            hasData: !!response.data,
            dataSize: response.rawData ? response.rawData.length : 0,
            message: response.data?.message || response.data?.detail || null
        };

        testResults.workingEndpoints[endpoint] = result;

        if (response.statusCode === 200) {
            console.log(`   ✅ SUCCESS - ${response.statusCode}`);

            if (response.data) {
                // Analyze data structure
                const dataAnalysis = analyzeDataStructure(response.data);
                console.log(`   📊 Data structure: ${JSON.stringify(dataAnalysis.summary)}`);

                // Store sample data
                testResults.sampleData[endpoint] = {
                    structure: dataAnalysis,
                    sample: JSON.stringify(response.data).substring(0, 1000) + '...',
                    itemCount: dataAnalysis.itemCount || 0
                };

                if (dataAnalysis.itemCount > 0) {
                    console.log(`   📦 Items returned: ${dataAnalysis.itemCount}`);
                }
            }

        } else {
            console.log(`   ❌ FAILED - ${response.statusCode}: ${result.message}`);
        }

        if (response.headers['x-quota-current']) {
            console.log(`   📊 Quota used: ${response.headers['x-quota-current']}`);
        }

        console.log('');
        return result.success;

    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}\n`);
        testResults.errors.push({
            endpoint,
            error: error.message
        });
        return false;
    }
}

function analyzeDataStructure(data) {
    const analysis = {
        type: Array.isArray(data) ? 'array' : typeof data,
        itemCount: 0,
        summary: {}
    };

    if (Array.isArray(data)) {
        analysis.itemCount = data.length;
        analysis.summary = {
            type: 'array',
            length: data.length,
            itemType: data.length > 0 ? typeof data[0] : 'unknown'
        };

        if (data.length > 0 && typeof data[0] === 'object') {
            analysis.summary.itemKeys = Object.keys(data[0]);
            analysis.summary.sampleItem = data[0];
        }

    } else if (typeof data === 'object' && data !== null) {
        analysis.summary = {
            type: 'object',
            keys: Object.keys(data)
        };

        // Check for common pagination patterns
        if (data.results || data.data || data.items) {
            const itemsArray = data.results || data.data || data.items;
            if (Array.isArray(itemsArray)) {
                analysis.itemCount = itemsArray.length;
                analysis.summary.hasItems = true;
                analysis.summary.itemsKey = data.results ? 'results' : data.data ? 'data' : 'items';
            }
        }

        // Check for pagination info
        if (data.page || data.pagination || data.meta) {
            analysis.summary.hasPagination = true;
        }
    }

    return analysis;
}

async function runFreeEndpointTests() {
    console.log('🧪 Testing KicksDB Free Tier Endpoints');
    console.log(`   Based on OpenAPI specification analysis`);
    console.log(`   Free tier: 50,000 requests/month, StockX & GOAT access\n`);

    // Test endpoints that should be available to free tier
    const endpointsToTest = [
        {
            endpoint: '/v3/utils/brands?limit=5',
            description: 'Get brands list from StockX (should be available)'
        },
        {
            endpoint: '/v3/goat/products?limit=5',
            description: 'Get GOAT products (free tier access)'
        },
        {
            endpoint: '/v3/stockx/products?limit=5',
            description: 'Get StockX products (free tier access)'
        },
        {
            endpoint: '/v3/stockx/products?search=nike&limit=3',
            description: 'Search StockX products (free tier with search)'
        },
        {
            endpoint: '/v3/goat/products?search=jordan&limit=3',
            description: 'Search GOAT products (free tier with search)'
        }
    ];

    let successCount = 0;

    for (const test of endpointsToTest) {
        const success = await testEndpoint(test.endpoint, test.description);
        if (success) {
            successCount++;
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // If we got any successful responses, try to get specific product details
    if (successCount > 0) {
        console.log('🔍 Testing specific product endpoints...\n');

        // Try a few common product IDs
        const productTests = [
            {
                endpoint: '/v3/stockx/products/nike-dunk-low-retro-white-black-2021',
                description: 'Get specific StockX product by slug'
            },
            {
                endpoint: '/v3/stockx/products/air-jordan-1-retro-high-og-bred-toe',
                description: 'Get popular Jordan product'
            }
        ];

        for (const test of productTests) {
            await testEndpoint(test.endpoint, test.description);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    generateReport(successCount, endpointsToTest.length);
}

function generateReport(successCount, totalTests) {
    console.log('📊 KicksDB Free Tier Test Results:');
    console.log(`   ✅ Successful endpoints: ${successCount}/${totalTests}`);
    console.log(`   🔑 Key type: ${testResults.keyType}`);

    const workingEndpoints = Object.entries(testResults.workingEndpoints)
        .filter(([_, result]) => result.success)
        .map(([endpoint, _]) => endpoint);

    if (workingEndpoints.length > 0) {
        console.log('\n🎯 Working Endpoints:');
        workingEndpoints.forEach(endpoint => {
            const data = testResults.sampleData[endpoint];
            console.log(`   ✅ ${endpoint}`);
            if (data && data.itemCount > 0) {
                console.log(`      📦 Returns ${data.itemCount} items`);
            }
        });

        console.log('\n💡 Implementation Strategy:');
        console.log('   1. ✅ Free tier provides access to core product data');
        console.log('   2. 🏗️  Build API client focusing on working endpoints');
        console.log('   3. 📊 Implement caching to stay within 50k monthly limit');
        console.log('   4. 🔍 Use search functionality for product discovery');
        console.log('   5. 📈 Consider paid upgrade for enhanced features');

        console.log('\n🚀 Next Development Steps:');
        console.log('   1. Create KicksDB API client service');
        console.log('   2. Design database schema for product data');
        console.log('   3. Implement data sync pipeline');
        console.log('   4. Add rate limiting and caching');
        console.log('   5. Build product search and display features');

    } else {
        console.log('\n⚠️  No working endpoints found');
        console.log('   💡 Recommendations:');
        console.log('      1. Verify API key is activated');
        console.log('      2. Contact KicksDB support');
        console.log('      3. Consider upgrading to paid plan');
    }

    // Save detailed results
    const filename = `kicksdb-validated-endpoints-${Date.now()}.json`;
    try {
        fs.writeFileSync(filename, JSON.stringify(testResults, null, 2));
        console.log(`\n💾 Detailed test results saved to: ${filename}`);
    } catch (error) {
        console.log(`\n❌ Failed to save results: ${error.message}`);
    }

    console.log('\n📋 Summary for Database Design:');
    if (testResults.sampleData && Object.keys(testResults.sampleData).length > 0) {
        Object.entries(testResults.sampleData).forEach(([endpoint, data]) => {
            if (data.structure.summary.sampleItem) {
                console.log(`\n   ${endpoint}:`);
                console.log(`   Sample data structure: ${JSON.stringify(Object.keys(data.structure.summary.sampleItem))}`);
            }
        });
    }
}

runFreeEndpointTests().catch(console.error);