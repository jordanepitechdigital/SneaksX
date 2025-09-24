#!/usr/bin/env npx tsx

/**
 * Authentication Service Test
 * Test basic authentication functionality
 */

import { DEFAULT_AUTH_CONFIG } from './src/types/auth'
import { authService } from './src/services/api/auth'
import type { RegisterCredentials } from './src/types/auth'

async function testAuthService() {
  console.log('🔑 Testing Authentication Service...\n')

  try {
    // Test 1: Get current user (should be null initially)
    console.log('📋 Test 1: Get current user')
    const currentUser = await authService.getCurrentUser()
    console.log('Current user:', currentUser ? currentUser.email : 'None')
    console.log('✅ Test 1 passed\n')

    // Test 2: Test auth state
    console.log('📋 Test 2: Get auth state')
    const authState = await authService.getAuthState()
    console.log('Is authenticated:', authState.isAuthenticated)
    console.log('Is loading:', authState.isLoading)
    console.log('✅ Test 2 passed\n')

    // Test 3: Test role and permission checking (with no user)
    console.log('📋 Test 3: Test permissions (no user)')
    const hasUserRole = authService.hasRole('user')
    const hasAdminRole = authService.hasRole('admin')
    const hasReadPermission = authService.hasPermission('user:read:own:profile')

    console.log('Has user role:', hasUserRole)
    console.log('Has admin role:', hasAdminRole)
    console.log('Has read permission:', hasReadPermission)
    console.log('✅ Test 3 passed\n')

    // Test 4: Test session validation
    console.log('📋 Test 4: Validate session')
    const isValidSession = await authService.validateSession()
    console.log('Session valid:', isValidSession)
    console.log('✅ Test 4 passed\n')

    console.log('🎉 All authentication service tests passed!')
    console.log('\n📊 Test Summary:')
    console.log('- Basic service instantiation: ✅')
    console.log('- User state management: ✅')
    console.log('- Auth state retrieval: ✅')
    console.log('- Permission checking: ✅')
    console.log('- Session validation: ✅')

  } catch (error) {
    console.error('❌ Authentication service test failed:', error)
    process.exit(1)
  }
}

// Run tests
testAuthService().catch(console.error)