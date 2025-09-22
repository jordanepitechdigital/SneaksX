#!/usr/bin/env node

/**
 * KicksDB Free Tier API Testing Script
 *
 * Based on the initial test, we know:
 * - API key is valid (Free tier)
 * - Root endpoint requires paid plan
 * - Need to test specific endpoints available to free tier
 */

const https = require('https');
const fs = require('fs');

const API_KEY = 'KICKS-97EF-725F-A605-58232DC70EED';
const BASE_URL = 'https://api.kicks.dev';

const testResults = {
    timestamp: new Date().toISOString(),
    keyType: 'Free',
    freeEndpoints: {},
    successfulCalls: [],
    errors: [],
    sampleData: {}
};

function makeRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);

        const requestOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'User-Agent': 'SneaksX-Free-Tier-Test/1.0',
                ...options.headers
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

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

async function testFreeEndpoints() {
    console.log('🆓 Testing Free Tier Endpoints...');
    console.log(`   Key Type: Free (confirmed from headers)`);
    console.log(`   Testing endpoints likely available for free tier...\n`);

    // Common free tier endpoints patterns
    const freeEndpoints = [
        // Product search (often free with limits)
        '/search?q=nike',
        '/search?q=jordan',
        '/search?q=adidas',
        '/products/search?q=nike&limit=5',
        '/sneakers/search?q=jordan&limit=5',
        '/search/products?q=adidas&limit=3',

        // Individual product lookups
        '/product/1',
        '/sneaker/1',
        '/products/1',
        '/sneakers/1',

        // Brand lists (often free)
        '/brands',
        '/brands/list',
        '/brand/nike',
        '/brand/adidas',

        // Category information
        '/categories',
        '/category/sneakers',

        // Info endpoints
        '/info',
        '/status',
        '/health',
        '/version',
        '/limits',
        '/plan',
        '/quota',

        // API documentation endpoints
        '/docs',
        '/documentation',
        '/swagger',
        '/openapi',

        // Free data endpoints
        '/free/products',
        '/free/search',
        '/public/brands',
        '/public/categories',

        // Limited access endpoints
        '/limited/search?q=nike',
        '/lite/products',
        '/basic/search',

        // Alternative patterns
        '/api/search?q=nike',
        '/api/products/search?q=jordan',
        '/api/v1/search?q=adidas',
        '/v1/search?q=nike',
        '/v2/search?q=puma'
    ];

    for (const endpoint of freeEndpoints) {
        try {
            console.log(`   Testing: ${endpoint}`);
            const response = await makeRequest(endpoint);

            const result = {
                statusCode: response.statusCode,
                success: response.statusCode >= 200 && response.statusCode < 400,
                keyType: response.headers['x-key-type'],
                quota: response.headers['x-quota-current'],
                rateLimitRemaining: response.headers['x-ratelimit-remaining'],
                hasData: !!response.data,
                dataSize: response.rawData ? response.rawData.length : 0,
                message: response.data?.message || null
            };

            testResults.freeEndpoints[endpoint] = result;

            if (response.statusCode === 200) {
                console.log(`   ✅ ${endpoint} - SUCCESS (200)`);
                testResults.successfulCalls.push(endpoint);

                // Store sample data for analysis
                if (response.data) {
                    testResults.sampleData[endpoint] = {
                        structure: analyzeDataStructure(response.data),
                        sample: JSON.stringify(response.data).substring(0, 500) + '...'
                    };
                    console.log(`      Data keys: ${Object.keys(response.data).join(', ')}`);
                }
            } else if (response.statusCode === 403) {
                console.log(`   🚫 ${endpoint} - FORBIDDEN (403) - ${response.data?.message || 'Not available for free tier'}`);
            } else if (response.statusCode === 404) {
                console.log(`   ❌ ${endpoint} - NOT FOUND (404)`);
            } else if (response.statusCode === 429) {
                console.log(`   ⏱️  ${endpoint} - RATE LIMITED (429)`);
            } else {
                console.log(`   ⚠️  ${endpoint} - ${response.statusCode} - ${response.data?.message || 'Unknown'}`);
            }

            // Display quota info if available
            if (response.headers['x-quota-current']) {
                console.log(`      Quota used: ${response.headers['x-quota-current']}`);
            }

            await new Promise(resolve => setTimeout(resolve, 250)); // Rate limiting

        } catch (error) {
            console.log(`   ❌ ${endpoint} - ERROR: ${error.message}`);
            testResults.errors.push({
                endpoint,
                error: error.message
            });
        }
    }
}

function analyzeDataStructure(data) {
    if (Array.isArray(data)) {
        return {
            type: 'array',
            length: data.length,
            itemStructure: data.length > 0 ? analyzeDataStructure(data[0]) : null
        };
    } else if (typeof data === 'object' && data !== null) {
        const structure = {};
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                structure[key] = `array(${value.length})`;
            } else if (typeof value === 'object' && value !== null) {
                structure[key] = 'object';
            } else {
                structure[key] = typeof value;
            }
        }
        return structure;
    } else {
        return typeof data;
    }
}

async function testSpecificSearches() {
    console.log('\n🔍 Testing Specific Product Searches...');

    const searchTests = [
        { endpoint: '/search', params: { q: 'nike air force', limit: 3 } },
        { endpoint: '/search', params: { q: 'jordan 1', limit: 3 } },
        { endpoint: '/search', params: { q: 'adidas ultraboost', limit: 3 } },
        { endpoint: '/search', params: { brand: 'nike', limit: 5 } },
        { endpoint: '/search', params: { category: 'sneakers', limit: 5 } }
    ];

    for (const test of searchTests) {
        try {
            const params = new URLSearchParams(test.params);
            const fullEndpoint = `${test.endpoint}?${params.toString()}`;

            console.log(`   Testing search: ${fullEndpoint}`);
            const response = await makeRequest(fullEndpoint);

            if (response.statusCode === 200) {
                console.log(`   ✅ Search successful`);
                if (response.data) {
                    testResults.sampleData[`search_${Object.values(test.params).join('_')}`] = {
                        endpoint: fullEndpoint,
                        structure: analyzeDataStructure(response.data),
                        sample: JSON.stringify(response.data).substring(0, 300) + '...'
                    };
                }
            } else {
                console.log(`   ❌ Search failed: ${response.statusCode} - ${response.data?.message || 'Unknown error'}`);
            }

            await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
            console.log(`   ❌ Search error: ${error.message}`);
        }
    }
}

function generateReport() {
    console.log('\n📊 Free Tier API Test Report:');

    const successful = testResults.successfulCalls.length;
    const total = Object.keys(testResults.freeEndpoints).length;

    console.log(`   ✅ Successful endpoints: ${successful}/${total}`);

    if (successful > 0) {
        console.log('\n   🎯 Working endpoints:');
        testResults.successfulCalls.forEach(endpoint => {
            console.log(`      - ${endpoint}`);
        });

        console.log('\n   📋 Available functionality:');
        if (testResults.successfulCalls.some(e => e.includes('search'))) {
            console.log('      ✅ Product search available');
        }
        if (testResults.successfulCalls.some(e => e.includes('brand'))) {
            console.log('      ✅ Brand data available');
        }
        if (testResults.successfulCalls.some(e => e.includes('categor'))) {
            console.log('      ✅ Category data available');
        }

        console.log('\n   💡 Implementation recommendations:');
        console.log('      1. Focus on working search endpoints for product data');
        console.log('      2. Implement client with proper rate limiting');
        console.log('      3. Cache results to minimize API calls');
        console.log('      4. Consider upgrading to paid tier for more features');

    } else {
        console.log('\n   ⚠️  No working endpoints found for free tier');
        console.log('      💡 Consider:');
        console.log('         1. Verify API key is active');
        console.log('         2. Check KicksDB documentation for free tier endpoints');
        console.log('         3. Contact support for free tier access');
        console.log('         4. Consider upgrading to paid plan');
    }

    // Save detailed results
    const filename = `kicksdb-free-tier-test-${Date.now()}.json`;
    try {
        fs.writeFileSync(filename, JSON.stringify(testResults, null, 2));
        console.log(`\n💾 Detailed results saved to: ${filename}`);
    } catch (error) {
        console.log(`\n❌ Failed to save results: ${error.message}`);
    }
}

async function runFreeTests() {
    console.log('🚀 KicksDB Free Tier API Testing');
    console.log(`   API Key: ${API_KEY}`);
    console.log(`   Base URL: ${BASE_URL}\n`);

    await testFreeEndpoints();
    await testSpecificSearches();
    generateReport();
}

runFreeTests().catch(console.error);