#!/usr/bin/env tsx

/**
 * KicksDB Monitor System Startup Script
 *
 * This script initializes and starts the KicksDB real-time monitoring system.
 * Run this script to begin processing webhook events and monitoring products.
 *
 * Usage:
 *   npm run monitor:start
 *   or
 *   npx tsx scripts/start-monitoring.ts
 */

import { getMonitorOrchestrator } from '../src/lib/monitor/orchestrator';

async function startMonitoringSystem() {
  console.log('🚀 Initializing KicksDB Monitor System...');
  console.log('=====================================');

  try {
    const orchestrator = getMonitorOrchestrator();

    // Perform initial health check
    console.log('🔍 Performing health check...');
    const healthCheck = await orchestrator.performHealthCheck();

    console.log(`Overall System Health: ${healthCheck.overall.toUpperCase()}`);
    for (const service of healthCheck.services) {
      const status = service.status === 'healthy' ? '✅' :
                    service.status === 'degraded' ? '⚠️' : '❌';
      console.log(`${status} ${service.service}: ${service.status} (${service.response_time_ms}ms)`);
      if (service.error) {
        console.log(`   Error: ${service.error}`);
      }
    }

    if (healthCheck.overall === 'unhealthy') {
      console.log('❌ System health check failed. Please resolve issues before starting.');
      process.exit(1);
    }

    // Start the monitoring system
    console.log('\n🎯 Starting monitoring system...');
    await orchestrator.startMonitoring();

    // Display system status
    console.log('\n📊 System Status:');
    const status = await orchestrator.getSystemStatus();
    console.log(`- Monitoring System: ${status.isRunning ? 'RUNNING' : 'STOPPED'}`);
    console.log(`- Monitored Products: ${status.monitoredProducts.total || 0}`);
    console.log(`- Feature Flags: ${JSON.stringify(status.featureFlags, null, 2)}`);
    console.log(`- Webhook Queue: ${JSON.stringify(status.webhookQueue, null, 2)}`);

    console.log('\n✅ KicksDB Monitor System is now running!');
    console.log('📝 Key endpoints:');
    console.log('   - Webhook: POST /api/kicks/monitor');
    console.log('   - Health: GET /api/kicks/monitor/health');
    console.log('   - Status: GET /api/kicks/monitor/status');

    console.log('\n⚠️  IMPORTANT NOTES:');
    console.log('   - Stock updates are DISABLED per requirements (FEATURE_MONITOR_UPDATES_STOCK=false)');
    console.log('   - Only price monitoring and stock tracking (no modifications) are enabled');
    console.log('   - SneakX manages its own stock via internal systems');
    console.log('   - Webhook events update prices only, never stock quantities');

    console.log('\n🔧 To stop the system:');
    console.log('   - Use Ctrl+C or run: npm run monitor:stop');

    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received shutdown signal...');
      await gracefulShutdown(orchestrator);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received termination signal...');
      await gracefulShutdown(orchestrator);
    });

    // Keep the process running
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      gracefulShutdown(orchestrator).then(() => process.exit(1));
    });

    // Periodic status updates (every 5 minutes)
    setInterval(async () => {
      try {
        const stats = await orchestrator.getMonitoringStats();
        console.log(`\n📈 Status Update (${new Date().toISOString()})`);
        console.log(`   - Monitored Products: ${stats.monitoredProducts}`);
        console.log(`   - Webhook Events (24h): ${stats.webhookEvents24h}`);
        console.log(`   - Stock Operations (24h): ${stats.stockOperations24h}`);
        console.log(`   - System Health: ${stats.systemHealth.overall}`);
      } catch (error) {
        console.error('❌ Error getting status update:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

  } catch (error) {
    console.error('❌ Failed to start monitoring system:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check your environment variables (.env.local)');
    console.error('   2. Ensure Supabase database is accessible');
    console.error('   3. Verify KicksDB API credentials');
    console.error('   4. Check network connectivity');
    process.exit(1);
  }
}

async function gracefulShutdown(orchestrator: any) {
  try {
    console.log('🔄 Gracefully shutting down monitoring system...');
    await orchestrator.stopMonitoring();
    console.log('✅ Monitoring system stopped successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Run the startup script if this file is executed directly
if (require.main === module) {
  startMonitoringSystem().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { startMonitoringSystem };