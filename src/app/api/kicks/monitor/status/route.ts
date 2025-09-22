import { NextRequest, NextResponse } from 'next/server';
import { getMonitorOrchestrator } from '@/lib/monitor/orchestrator';

/**
 * GET /api/kicks/monitor/status
 * Get monitoring system status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const orchestrator = getMonitorOrchestrator();

    const [systemStatus, stats] = await Promise.all([
      orchestrator.getSystemStatus(),
      orchestrator.getMonitoringStats()
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        system: systemStatus,
        statistics: stats
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting monitor status:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';