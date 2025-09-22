#!/usr/bin/env node

/**
 * KicksDB Documentation Retrieval Script
 *
 * The only working endpoint for free tier is /docs
 * Let's get the documentation and see what's available
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
                'Content-Type': 'application/json',
                'User-Agent': 'SneaksX-Docs-Retrieval/1.0'
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

async function getDocumentation() {
    console.log('📚 Retrieving KicksDB API Documentation...');
    console.log(`   Endpoint: ${BASE_URL}/docs`);
    console.log(`   API Key: ${API_KEY}\n`);

    try {
        const response = await makeRequest('/docs');

        console.log(`Status: ${response.statusCode}`);
        console.log(`Content-Type: ${response.contentType}`);
        console.log(`Data Length: ${response.data.length} characters\n`);

        if (response.statusCode === 200) {
            console.log('✅ Documentation retrieved successfully!\n');

            // Save raw documentation
            const timestamp = Date.now();
            const filename = `kicksdb-docs-${timestamp}.txt`;
            fs.writeFileSync(filename, response.data);
            console.log(`💾 Raw documentation saved to: ${filename}`);

            // Try to parse if it's JSON
            try {
                const jsonData = JSON.parse(response.data);
                const jsonFilename = `kicksdb-docs-${timestamp}.json`;
                fs.writeFileSync(jsonFilename, JSON.stringify(jsonData, null, 2));
                console.log(`📄 Parsed JSON saved to: ${jsonFilename}`);

                // Analyze the documentation structure
                console.log('\n📋 Documentation Analysis:');
                console.log(`   Type: JSON`);
                console.log(`   Top-level keys: ${Object.keys(jsonData).join(', ')}`);

                if (jsonData.paths) {
                    console.log(`   Available paths: ${Object.keys(jsonData.paths).length}`);
                    console.log('   Endpoints:');
                    Object.keys(jsonData.paths).forEach(path => {
                        console.log(`      ${path}`);
                    });
                }

                if (jsonData.info) {
                    console.log(`\n   API Info:`);
                    console.log(`      Title: ${jsonData.info.title || 'N/A'}`);
                    console.log(`      Version: ${jsonData.info.version || 'N/A'}`);
                    console.log(`      Description: ${jsonData.info.description || 'N/A'}`);
                }

                if (jsonData.servers) {
                    console.log(`\n   Servers:`);
                    jsonData.servers.forEach(server => {
                        console.log(`      ${server.url} - ${server.description || 'No description'}`);
                    });
                }

            } catch (parseError) {
                console.log(`   Type: Text/HTML (not JSON)`);
                console.log(`   Content preview (first 500 chars):`);
                console.log(`   ${response.data.substring(0, 500)}...`);
            }

            // Extract rate limit info from headers
            console.log('\n📊 Response Headers:');
            Object.entries(response.headers).forEach(([key, value]) => {
                if (key.toLowerCase().includes('rate') ||
                    key.toLowerCase().includes('limit') ||
                    key.toLowerCase().includes('quota') ||
                    key.toLowerCase().includes('key')) {
                    console.log(`   ${key}: ${value}`);
                }
            });

        } else {
            console.log(`❌ Failed to retrieve documentation: ${response.statusCode}`);
            console.log(`Response: ${response.data}`);
        }

    } catch (error) {
        console.log(`❌ Error retrieving documentation: ${error.message}`);
    }
}

getDocumentation().catch(console.error);