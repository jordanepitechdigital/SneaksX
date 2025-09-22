import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WebhookSecurity, WebhookRateLimit } from '@/lib/webhook/security';
import { WebhookQueue } from '@/lib/webhook/queue';

// Rate limiter instance (in production, use Redis or external service)
const rateLimiter = new WebhookRateLimit(100, 60 * 1000); // 100 requests per minute

// Webhook security instance
let webhookSecurity: WebhookSecurity;
try {
  webhookSecurity = new WebhookSecurity();
} catch (error) {
  console.error('Failed to initialize webhook security:', error);
}

// Webhook queue instance
let webhookQueue: WebhookQueue;
try {
  webhookQueue = new WebhookQueue();
} catch (error) {
  console.error('Failed to initialize webhook queue:', error);
}

// Supabase client for logging
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/kicks/monitor
 * Webhook endpoint for KicksDB monitor events
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let eventId: string | undefined;
  let rateLimitIdentifier: string;

  try {
    // Get client identifier for rate limiting (IP + user agent)
    const clientIP = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    rateLimitIdentifier = `${clientIP}:${userAgent}`;

    // Check rate limit
    if (!rateLimiter.isAllowed(rateLimitIdentifier)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          remaining: rateLimiter.getRemaining(rateLimitIdentifier)
        },
        { status: 429 }
      );
    }

    // Validate webhook security is initialized
    if (!webhookSecurity) {
      console.error('Webhook security not initialized');
      return NextResponse.json(
        { error: 'Service configuration error' },
        { status: 500 }
      );
    }

    // Validate webhook queue is initialized
    if (!webhookQueue) {
      console.error('Webhook queue not initialized');
      return NextResponse.json(
        { error: 'Service configuration error' },
        { status: 500 }
      );
    }

    // Parse and validate headers
    const headers = Object.fromEntries(request.headers.entries());
    const headerValidation = webhookSecurity.validateHeaders(headers);

    if (headerValidation.error) {
      return NextResponse.json(
        { error: headerValidation.error },
        { status: 400 }
      );
    }

    eventId = headerValidation.eventId;
    const signature = headerValidation.signature!;
    const timestamp = headerValidation.timestamp;

    // Validate timestamp if provided
    if (timestamp && !webhookSecurity.validateTimestamp(timestamp)) {
      return NextResponse.json(
        { error: 'Invalid or expired timestamp' },
        { status: 400 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();

    if (!rawBody) {
      return NextResponse.json(
        { error: 'Missing request body' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const signatureResult = webhookSecurity.verifySignature(rawBody, signature);
    if (!signatureResult.isValid) {
      console.warn('Invalid webhook signature:', signatureResult.error);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Validate required payload fields
    if (!payload.event_type) {
      return NextResponse.json(
        { error: 'Missing event_type in payload' },
        { status: 400 }
      );
    }

    // Check for duplicate event (idempotency)
    const { data: existingEvent } = await supabase
      .from('webhook_event_logs')
      .select('id, processed')
      .eq('event_id', eventId)
      .single();

    if (existingEvent) {
      // Event already exists
      if (existingEvent.processed) {
        return NextResponse.json({
          message: 'Event already processed',
          event_id: eventId
        });
      } else {
        // Event exists but not processed, re-queue it
        await webhookQueue.enqueue(existingEvent.id, 1); // Higher priority for retry
        return NextResponse.json({
          message: 'Event re-queued for processing',
          event_id: eventId
        });
      }
    }

    // Log webhook event
    const { data: webhookLog, error: logError } = await supabase
      .from('webhook_event_logs')
      .insert([{
        event_id: eventId,
        source: 'kicksdb',
        event_type: payload.event_type,
        payload: payload,
        signature: signature,
        verified: true,
        processed: false,
        retry_count: 0
      }])
      .select('id')
      .single();

    if (logError || !webhookLog) {
      console.error('Failed to log webhook event:', logError);
      return NextResponse.json(
        { error: 'Failed to log webhook event' },
        { status: 500 }
      );
    }

    // Add to processing queue
    try {
      await webhookQueue.enqueue(webhookLog.id, 0); // Normal priority
    } catch (queueError) {
      console.error('Failed to enqueue webhook event:', queueError);
      // Update log with error
      await supabase
        .from('webhook_event_logs')
        .update({
          error_message: 'Failed to enqueue for processing'
        })
        .eq('id', webhookLog.id);

      return NextResponse.json(
        { error: 'Failed to queue event for processing' },
        { status: 500 }
      );
    }

    // Log successful receipt
    const processingTime = Date.now() - startTime;
    console.log(`Webhook received successfully: ${eventId} (${processingTime}ms)`);

    return NextResponse.json({
      message: 'Webhook received and queued for processing',
      event_id: eventId,
      processing_time_ms: processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Webhook processing error:', error);

    // Log error if we have an event ID
    if (eventId) {
      try {
        await supabase
          .from('webhook_event_logs')
          .update({
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('event_id', eventId);
      } catch (logError) {
        console.error('Failed to log webhook error:', logError);
      }
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        event_id: eventId,
        processing_time_ms: processingTime
      },
      { status: 500 }
    );
  } finally {
    // Clean up rate limiter periodically
    if (Math.random() < 0.1) { // 10% chance
      rateLimiter.cleanup();
    }
  }
}

/**
 * GET /api/kicks/monitor
 * Health check and queue status endpoint
 */
export async function GET() {
  try {
    if (!webhookQueue) {
      return NextResponse.json(
        { error: 'Queue service not available' },
        { status: 503 }
      );
    }

    const stats = await webhookQueue.getStats();

    return NextResponse.json({
      status: 'healthy',
      queue_stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Export supported HTTP methods
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';