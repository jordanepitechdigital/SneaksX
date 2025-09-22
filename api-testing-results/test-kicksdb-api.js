#!/usr/bin/env node

/**
 * KicksDB API Authentication and Endpoint Testing Script
 *
 * This script tests:
 * 1. API Authentication with Bearer Token
 * 2. Rate limit detection
 * 3. Available endpoints and data structure
 * 4. API tier/plan identification
 */

const https = require('https');
const fs = require('fs');

// Configuration
const API_KEY = 'KICKS-97EF-725F-A605-58232DC70EED';
const BASE_URL = 'https://api.kicks.dev';

// Test results storage
const testResults = {
    timestamp: new Date().toISOString(),
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    authentication: null,
    endpoints: {},
    rateLimit: null,
    errors: [],
    summary: {}
};

// Helper function to make API requests
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
                'User-Agent': 'SneaksX-API-Test/1.0',
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

// Test authentication
async function testAuthentication() {
    console.log('🔐 Testing API Authentication...');

    try {
        // Test basic endpoint that should require authentication
        const response = await makeRequest('/');

        testResults.authentication = {
            success: response.statusCode !== 401 && response.statusCode !== 403,
            statusCode: response.statusCode,
            headers: response.headers,
            data: response.data,
            rawResponse: response.rawData
        };

        if (testResults.authentication.success) {
            console.log('✅ Authentication successful');
            console.log(`   Status: ${response.statusCode}`);
        } else {
            console.log('❌ Authentication failed');
            console.log(`   Status: ${response.statusCode}`);
            console.log(`   Response: ${response.rawData}`);
        }

        return testResults.authentication.success;
    } catch (error) {
        console.log('❌ Authentication test error:', error.message);
        testResults.authentication = {
            success: false,
            error: error.message
        };
        return false;
    }
}

// Test various endpoints to map API structure
async function testEndpoints() {
    console.log('\n🔍 Testing API Endpoints...');

    const endpointsToTest = [
        // Base endpoints
        '/',
        '/health',
        '/status',
        '/version',
        '/info',

        // Product endpoints
        '/products',
        '/products/search',
        '/sneakers',
        '/sneakers/search',

        // Brand endpoints
        '/brands',
        '/brands/list',

        // Category endpoints
        '/categories',
        '/categories/list',

        // Monitor endpoints
        '/monitors',
        '/monitors/list',
        '/webhooks',

        // Search endpoints
        '/search',
        '/search/products',
        '/search/sneakers',

        // Common API patterns
        '/api/v1/products',
        '/api/v1/sneakers',
        '/api/v1/brands',
        '/v1/products',
        '/v1/sneakers',
        '/v1/brands',
    ];

    for (const endpoint of endpointsToTest) {
        try {
            console.log(`   Testing: ${endpoint}`);
            const response = await makeRequest(endpoint);

            testResults.endpoints[endpoint] = {
                statusCode: response.statusCode,
                success: response.statusCode >= 200 && response.statusCode < 400,
                headers: response.headers,
                dataSize: response.rawData ? response.rawData.length : 0,
                hasData: !!response.data,
                dataStructure: response.data ? Object.keys(response.data) : null,
                rateLimitHeaders: extractRateLimitHeaders(response.headers)
            };

            if (response.statusCode >= 200 && response.statusCode < 300) {
                console.log(`   ✅ ${endpoint} - ${response.statusCode}`);
                if (response.data) {
                    console.log(`      Data keys: ${Object.keys(response.data).join(', ')}`);
                }
            } else if (response.statusCode === 404) {
                console.log(`   ➖ ${endpoint} - Not Found (404)`);
            } else {
                console.log(`   ❌ ${endpoint} - ${response.statusCode}`);
            }

            // Small delay to avoid hitting rate limits
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.log(`   ❌ ${endpoint} - Error: ${error.message}`);
            testResults.endpoints[endpoint] = {
                error: error.message,
                success: false
            };
        }
    }
}

// Extract rate limit information from headers
function extractRateLimitHeaders(headers) {
    const rateLimitHeaders = {};

    // Common rate limit header patterns
    const patterns = [
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset',
        'x-rate-limit-limit',
        'x-rate-limit-remaining',
        'x-rate-limit-reset',
        'ratelimit-limit',
        'ratelimit-remaining',
        'ratelimit-reset',
        'rate-limit-limit',
        'rate-limit-remaining',
        'rate-limit-reset'
    ];

    for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();
        if (patterns.includes(lowerKey) || lowerKey.includes('rate') || lowerKey.includes('limit')) {
            rateLimitHeaders[key] = value;
        }
    }

    return Object.keys(rateLimitHeaders).length > 0 ? rateLimitHeaders : null;
}

// Test rate limiting by making multiple requests
async function testRateLimit() {
    console.log('\n⏱️  Testing Rate Limits...');

    const testEndpoint = '/'; // Use root endpoint for rate limit testing
    const requests = [];
    const requestCount = 10;

    console.log(`   Making ${requestCount} rapid requests to detect rate limits...`);

    const startTime = Date.now();

    for (let i = 0; i < requestCount; i++) {
        requests.push(makeRequest(testEndpoint));
    }

    try {
        const responses = await Promise.all(requests);
        const endTime = Date.now();

        let rateLimitInfo = null;
        let rateLimitHit = false;

        responses.forEach((response, index) => {
            const rlHeaders = extractRateLimitHeaders(response.headers);
            if (rlHeaders) {
                rateLimitInfo = rlHeaders;
            }

            if (response.statusCode === 429) {
                rateLimitHit = true;
                console.log(`   ⚠️  Rate limit hit on request ${index + 1}`);
            }
        });

        testResults.rateLimit = {
            requestCount,
            duration: endTime - startTime,
            rateLimitHit,
            rateLimitHeaders: rateLimitInfo,
            statusCodes: responses.map(r => r.statusCode)
        };

        if (rateLimitHit) {
            console.log('   🚫 Rate limit detected');
        } else {
            console.log('   ✅ No rate limit hit in test');
        }

        if (rateLimitInfo) {
            console.log('   📊 Rate limit headers found:', rateLimitInfo);
        }

    } catch (error) {
        console.log('   ❌ Rate limit test error:', error.message);
        testResults.rateLimit = { error: error.message };
    }
}

// Test specific product/sneaker endpoints with search parameters
async function testProductEndpoints() {
    console.log('\n👟 Testing Product/Sneaker Endpoints...');

    const productTests = [
        // Search tests
        { endpoint: '/products', params: { limit: 5 } },
        { endpoint: '/sneakers', params: { limit: 5 } },
        { endpoint: '/search', params: { q: 'nike', limit: 5 } },
        { endpoint: '/products/search', params: { q: 'jordan', limit: 5 } },
        { endpoint: '/sneakers/search', params: { brand: 'adidas', limit: 5 } },

        // Specific product tests
        { endpoint: '/products/1' },
        { endpoint: '/sneakers/1' },
    ];

    for (const test of productTests) {
        try {
            let endpoint = test.endpoint;
            if (test.params) {
                const params = new URLSearchParams(test.params);
                endpoint += `?${params.toString()}`;
            }

            console.log(`   Testing: ${endpoint}`);
            const response = await makeRequest(endpoint);

            const testKey = `${test.endpoint}${test.params ? '_with_params' : ''}`;
            testResults.endpoints[testKey] = {
                statusCode: response.statusCode,
                success: response.statusCode >= 200 && response.statusCode < 400,
                hasData: !!response.data,
                dataStructure: response.data ? analyzeDataStructure(response.data) : null,
                sampleData: response.data ? JSON.stringify(response.data).substring(0, 500) + '...' : null
            };

            if (response.statusCode >= 200 && response.statusCode < 300) {
                console.log(`   ✅ ${endpoint} - Success`);
                if (response.data) {
                    console.log(`      Data structure: ${JSON.stringify(analyzeDataStructure(response.data))}`);
                }
            } else {
                console.log(`   ❌ ${endpoint} - ${response.statusCode}`);
            }

            await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
            console.log(`   ❌ ${test.endpoint} - Error: ${error.message}`);
        }
    }
}

// Analyze data structure to understand API response format
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
            structure[key] = typeof value;
            if (Array.isArray(value)) {
                structure[key] = `array(${value.length})`;
            }
        }
        return {
            type: 'object',
            keys: Object.keys(data),
            structure
        };
    } else {
        return {
            type: typeof data,
            value: data
        };
    }
}

// Generate summary and save results
function generateSummary() {
    console.log('\n📊 Test Summary:');

    const successfulEndpoints = Object.entries(testResults.endpoints)
        .filter(([_, result]) => result.success)
        .map(([endpoint, _]) => endpoint);

    const failedEndpoints = Object.entries(testResults.endpoints)
        .filter(([_, result]) => !result.success && !result.error)
        .map(([endpoint, _]) => endpoint);

    const errorEndpoints = Object.entries(testResults.endpoints)
        .filter(([_, result]) => result.error)
        .map(([endpoint, _]) => endpoint);

    testResults.summary = {
        authenticationWorking: testResults.authentication?.success || false,
        totalEndpointsTested: Object.keys(testResults.endpoints).length,
        successfulEndpoints: successfulEndpoints.length,
        failedEndpoints: failedEndpoints.length,
        errorEndpoints: errorEndpoints.length,
        rateLimitDetected: testResults.rateLimit?.rateLimitHit || false,
        workingEndpoints: successfulEndpoints,
        recommendations: []
    };

    // Generate recommendations based on results
    if (!testResults.authentication?.success) {
        testResults.summary.recommendations.push('❌ Authentication failed - verify API key and endpoint URL');
    } else {
        testResults.summary.recommendations.push('✅ Authentication working correctly');
    }

    if (successfulEndpoints.length > 0) {
        testResults.summary.recommendations.push(`✅ Found ${successfulEndpoints.length} working endpoints`);
        testResults.summary.recommendations.push(`📍 Working endpoints: ${successfulEndpoints.join(', ')}`);
    }

    if (testResults.rateLimit?.rateLimitHeaders) {
        testResults.summary.recommendations.push('📊 Rate limit headers detected - implement proper rate limiting');
    }

    console.log(`   Authentication: ${testResults.authentication?.success ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Successful endpoints: ${successfulEndpoints.length}`);
    console.log(`   Failed endpoints: ${failedEndpoints.length}`);
    console.log(`   Error endpoints: ${errorEndpoints.length}`);
    console.log(`   Rate limiting: ${testResults.rateLimit?.rateLimitHit ? '🚫 Detected' : '✅ None detected'}`);

    if (successfulEndpoints.length > 0) {
        console.log('\n✅ Working endpoints:');
        successfulEndpoints.forEach(endpoint => {
            console.log(`   - ${endpoint}`);
        });
    }
}

// Save test results to file
function saveResults() {
    const filename = `kicksdb-api-test-results-${Date.now()}.json`;
    const filepath = `/Users/jordanjosub/Desktop/SneaksX/${filename}`;

    try {
        fs.writeFileSync(filepath, JSON.stringify(testResults, null, 2));
        console.log(`\n💾 Test results saved to: ${filename}`);
        return filename;
    } catch (error) {
        console.log(`\n❌ Failed to save results: ${error.message}`);
        return null;
    }
}

// Main test execution
async function runTests() {
    console.log('🚀 Starting KicksDB API Tests');
    console.log(`   API Key: ${API_KEY}`);
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Timestamp: ${testResults.timestamp}\n`);

    try {
        // Run all tests
        const authSuccess = await testAuthentication();

        if (authSuccess) {
            await testEndpoints();
            await testProductEndpoints();
            await testRateLimit();
        } else {
            console.log('\n⚠️  Skipping endpoint tests due to authentication failure');
        }

        generateSummary();
        const savedFile = saveResults();

        console.log('\n🎯 Next Steps:');
        if (testResults.authentication?.success) {
            console.log('   1. Review working endpoints for data integration');
            console.log('   2. Implement API client service based on successful endpoints');
            console.log('   3. Design database schema based on response data structures');
            console.log('   4. Set up rate limiting based on detected limits');
        } else {
            console.log('   1. Verify API key is correct and active');
            console.log('   2. Check if API endpoint URL is correct');
            console.log('   3. Contact KicksDB support if authentication continues to fail');
        }

        if (savedFile) {
            console.log(`   📄 Review detailed results in: ${savedFile}`);
        }

    } catch (error) {
        console.error('❌ Test execution failed:', error);
        testResults.errors.push(error.message);
    }
}

// Run the tests
runTests().catch(console.error);