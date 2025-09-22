import { NextRequest, NextResponse } from 'next/server';
import { getMonitorOrchestrator } from '@/lib/monitor/orchestrator';

/**
 * GET /api/kicks/monitor/health
 * Health check endpoint for the monitoring system
 */
export async function GET(request: NextRequest) {
  try {
    const orchestrator = getMonitorOrchestrator();
    const healthCheck = await orchestrator.performHealthCheck();

    const status = healthCheck.overall === 'healthy' ? 200 :
                  healthCheck.overall === 'degraded' ? 200 : 503;

    return NextResponse.json(healthCheck, { status });

  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        overall: 'unhealthy',
        services: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}

export const dynamic = 'force-dynamic';