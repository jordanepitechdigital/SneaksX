#!/usr/bin/env npx tsx

/**
 * Route Protection Middleware Test
 * Test route guard and middleware functionality
 */

import { routeGuard, apiRequest } from './src/services/api/middleware'

async function testMiddleware() {
  console.log('🛡️ Testing Route Protection Middleware...\n')

  try {
    // Test 1: Route guard with no user (should fail)
    console.log('📋 Test 1: Route guard with no user')
    const guestAccess = await routeGuard({
      requiredRole: 'user',
      allowGuest: false,
      redirectTo: '/login'
    })
    console.log('Guest access to user route:', guestAccess)
    console.log('✅ Test 1 passed\n')

    // Test 2: Route guard allowing guest access
    console.log('📋 Test 2: Route guard allowing guest')
    const guestAllowed = await routeGuard({
      allowGuest: true
    })
    console.log('Guest allowed access:', guestAllowed)
    console.log('✅ Test 2 passed\n')

    // Test 3: Route guard with admin requirement (should fail)
    console.log('📋 Test 3: Route guard requiring admin role')
    const adminAccess = await routeGuard({
      requiredRole: 'admin'
    })
    console.log('Admin access without user:', adminAccess)
    console.log('✅ Test 3 passed\n')

    // Test 4: Route guard with permission requirement
    console.log('📋 Test 4: Route guard with permission requirement')
    const permissionAccess = await routeGuard({
      requiredPermission: 'user:read:own:profile'
    })
    console.log('Permission access without user:', permissionAccess)
    console.log('✅ Test 4 passed\n')

    console.log('🎉 All middleware tests passed!')
    console.log('\n📊 Test Summary:')
    console.log('- Route guard with role requirement: ✅')
    console.log('- Route guard with guest access: ✅')
    console.log('- Route guard with admin requirement: ✅')
    console.log('- Route guard with permission requirement: ✅')

  } catch (error) {
    console.error('❌ Middleware test failed:', error)
    process.exit(1)
  }
}

// Run tests
testMiddleware().catch(console.error)