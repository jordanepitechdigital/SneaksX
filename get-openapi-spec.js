#!/usr/bin/env node

/**
 * KicksDB OpenAPI Specification Retrieval
 *
 * The documentation page references /openapi.yaml
 * This should contain the complete API specification
 */

const https = require('https');
const fs = require('fs');

const API_KEY = 'KICKS-97EF-725F-A605-58232DC70EED';
const BASE_URL = 'https://api.kicks.dev';

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
                'Accept': 'application/yaml, text/yaml, application/x-yaml, text/x-yaml, */*',
                'User-Agent': 'SneaksX-OpenAPI-Retrieval/1.0'
            }
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data,
                    contentType: res.headers['content-type']
                });
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

async function getOpenAPISpec() {
    console.log('📋 Retrieving KicksDB OpenAPI Specification...');
    console.log(`   Endpoint: ${BASE_URL}/openapi.yaml`);
    console.log(`   API Key: ${API_KEY}\n`);

    try {
        const response = await makeRequest('/openapi.yaml');

        console.log(`Status: ${response.statusCode}`);
        console.log(`Content-Type: ${response.contentType}`);
        console.log(`Data Length: ${response.data.length} characters\n`);

        if (response.statusCode === 200) {
            console.log('✅ OpenAPI specification retrieved successfully!\n');

            // Save raw specification
            const timestamp = Date.now();
            const filename = `kicksdb-openapi-${timestamp}.yaml`;
            fs.writeFileSync(filename, response.data);
            console.log(`💾 OpenAPI spec saved to: ${filename}`);

            // Analyze the specification
            console.log('\n📋 OpenAPI Specification Analysis:');

            const lines = response.data.split('\n');
            console.log(`   Total lines: ${lines.length}`);

            // Extract key information
            const openApiVersion = lines.find(line => line.startsWith('openapi:'));
            const infoTitle = lines.find(line => line.trim().startsWith('title:'));
            const infoVersion = lines.find(line => line.trim().startsWith('version:'));
            const servers = lines.filter(line => line.trim().startsWith('- url:'));

            if (openApiVersion) console.log(`   ${openApiVersion.trim()}`);
            if (infoTitle) console.log(`   ${infoTitle.trim()}`);
            if (infoVersion) console.log(`   ${infoVersion.trim()}`);

            if (servers.length > 0) {
                console.log(`   Servers:`);
                servers.forEach(server => {
                    console.log(`      ${server.trim()}`);
                });
            }

            // Extract endpoints
            const pathLines = lines.filter((line, index) => {
                return line.match(/^  \//) && lines[index + 1] && lines[index + 1].match(/^\s+get:|^\s+post:|^\s+put:|^\s+delete:/);
            });

            if (pathLines.length > 0) {
                console.log(`\n   📍 Available endpoints (${pathLines.length} found):`);
                pathLines.forEach(path => {
                    console.log(`      ${path.trim()}`);
                });
            }

            // Look for authentication schemes
            const securitySchemes = lines.filter(line => line.includes('securitySchemes') || line.includes('Bearer') || line.includes('apiKey'));
            if (securitySchemes.length > 0) {
                console.log(`\n   🔐 Security information found:`);
                securitySchemes.forEach(scheme => {
                    console.log(`      ${scheme.trim()}`);
                });
            }

            // Look for free tier information
            const freeInfo = lines.filter(line =>
                line.toLowerCase().includes('free') ||
                line.toLowerCase().includes('tier') ||
                line.toLowerCase().includes('plan')
            );
            if (freeInfo.length > 0) {
                console.log(`\n   🆓 Free tier information:`);
                freeInfo.forEach(info => {
                    console.log(`      ${info.trim()}`);
                });
            }

            // Look for rate limiting info
            const rateLimitInfo = lines.filter(line =>
                line.toLowerCase().includes('rate') ||
                line.toLowerCase().includes('limit') ||
                line.toLowerCase().includes('quota')
            );
            if (rateLimitInfo.length > 0) {
                console.log(`\n   ⏱️  Rate limiting information:`);
                rateLimitInfo.forEach(info => {
                    console.log(`      ${info.trim()}`);
                });
            }

            // Create a summary
            console.log('\n📊 Summary for Implementation:');
            console.log(`   ✅ OpenAPI spec available and accessible`);
            console.log(`   📄 Complete API documentation retrieved`);
            console.log(`   🔍 ${pathLines.length} endpoints documented`);
            console.log(`   💾 Specification saved for detailed analysis`);

            console.log('\n🎯 Next Steps:');
            console.log(`   1. Review the complete OpenAPI spec: ${filename}`);
            console.log(`   2. Identify which endpoints require paid access`);
            console.log(`   3. Test documented endpoints to verify access levels`);
            console.log(`   4. Plan API client implementation based on available endpoints`);

        } else {
            console.log(`❌ Failed to retrieve OpenAPI spec: ${response.statusCode}`);
            console.log(`Response: ${response.data}`);
        }

    } catch (error) {
        console.log(`❌ Error retrieving OpenAPI spec: ${error.message}`);
    }
}

getOpenAPISpec().catch(console.error);