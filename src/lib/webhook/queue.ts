import { createClient } from '@supabase/supabase-js';
import { WebhookEventProcessor, WebhookEvent, ProcessingResult } from './processor';

export interface QueueItem {
  id: string;
  webhook_event_id: string;
  priority: number;
  scheduled_for: string;
  processing_attempts: number;
  max_attempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_details?: any;
  created_at: string;
  updated_at: string;
}

export class WebhookQueue {
  private supabase;
  private processor: WebhookEventProcessor;
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.processor = new WebhookEventProcessor();
  }

  /**
   * Add webhook event to processing queue
   */
  async enqueue(webhookEventId: string, priority: number = 0, scheduledFor?: Date): Promise<void> {
    try {
      await this.supabase
        .from('webhook_processing_queue')
        .insert([{
          webhook_event_id: webhookEventId,
          priority,
          scheduled_for: scheduledFor?.toISOString() || new Date().toISOString(),
          status: 'pending'
        }]);
    } catch (error) {
      console.error('Error enqueuing webhook event:', error);
      throw error;
    }
  }

  /**
   * Process next item in queue
   */
  async processNext(): Promise<boolean> {
    try {
      // Get next pending item ordered by priority and schedule time
      const { data: queueItems } = await this.supabase
        .from('webhook_processing_queue')
        .select(`
          *,
          webhook_event_logs!inner(*)
        `)
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .order('priority', { ascending: false })
        .order('scheduled_for', { ascending: true })
        .limit(1);

      if (!queueItems || queueItems.length === 0) {
        return false; // No items to process
      }

      const queueItem = queueItems[0];
      const webhookEvent = queueItem.webhook_event_logs;

      // Mark as processing
      await this.updateQueueItem(queueItem.id, {
        status: 'processing',
        processing_attempts: queueItem.processing_attempts + 1,
        updated_at: new Date().toISOString()
      });

      try {
        // Parse and process the webhook event
        const event: WebhookEvent = {
          event_id: webhookEvent.event_id,
          event_type: webhookEvent.event_type,
          ...webhookEvent.payload
        };

        const result = await this.processor.processEvent(event);

        if (result.success) {
          // Mark as completed
          await this.updateQueueItem(queueItem.id, {
            status: 'completed',
            updated_at: new Date().toISOString()
          });

          // Mark webhook as processed
          await this.supabase
            .from('webhook_event_logs')
            .update({
              processed: true,
              processed_at: new Date().toISOString()
            })
            .eq('id', webhookEvent.id);
        } else {
          // Handle failure
          await this.handleProcessingFailure(queueItem, result.error || 'Unknown error');
        }

        return true;
      } catch (error) {
        // Handle processing error
        await this.handleProcessingFailure(
          queueItem,
          error instanceof Error ? error.message : 'Unknown processing error'
        );
        return true;
      }
    } catch (error) {
      console.error('Error processing queue item:', error);
      return false;
    }
  }

  /**
   * Handle processing failure with retry logic
   */
  private async handleProcessingFailure(queueItem: any, errorMessage: string): Promise<void> {
    const attempts = queueItem.processing_attempts + 1;
    const maxAttempts = queueItem.max_attempts || 3;

    if (attempts >= maxAttempts) {
      // Mark as permanently failed
      await this.updateQueueItem(queueItem.id, {
        status: 'failed',
        error_details: { error: errorMessage, attempts },
        updated_at: new Date().toISOString()
      });

      // Update webhook event log
      await this.supabase
        .from('webhook_event_logs')
        .update({
          error_message: errorMessage,
          retry_count: attempts
        })
        .eq('id', queueItem.webhook_event_id);
    } else {
      // Schedule retry with exponential backoff
      const backoffMs = Math.pow(2, attempts) * 1000; // 2s, 4s, 8s, etc.
      const retryAt = new Date(Date.now() + backoffMs);

      await this.updateQueueItem(queueItem.id, {
        status: 'pending',
        scheduled_for: retryAt.toISOString(),
        error_details: { error: errorMessage, attempts },
        updated_at: new Date().toISOString()
      });
    }
  }

  /**
   * Update queue item
   */
  private async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void> {
    await this.supabase
      .from('webhook_processing_queue')
      .update(updates)
      .eq('id', id);
  }

  /**
   * Start processing queue continuously
   */
  startProcessing(intervalMs: number = 5000): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    console.log('Starting webhook queue processing...');

    this.processingInterval = setInterval(async () => {
      try {
        let processed = false;
        do {
          processed = await this.processNext();
        } while (processed); // Process all available items
      } catch (error) {
        console.error('Error in queue processing loop:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop processing queue
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.isProcessing = false;
    console.log('Stopped webhook queue processing');
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const { data } = await this.supabase
      .from('webhook_processing_queue')
      .select('status')
      .order('created_at', { ascending: false })
      .limit(1000); // Last 1000 items

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: data?.length || 0
    };

    data?.forEach(item => {
      stats[item.status as keyof typeof stats]++;
    });

    return stats;
  }

  /**
   * Clean up old completed/failed items
   */
  async cleanup(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await this.supabase
      .from('webhook_processing_queue')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      console.error('Error cleaning up queue:', error);
      return 0;
    }

    return data?.length || 0;
  }

  /**
   * Retry failed items
   */
  async retryFailed(maxAttempts?: number): Promise<number> {
    const query = this.supabase
      .from('webhook_processing_queue')
      .update({
        status: 'pending',
        scheduled_for: new Date().toISOString(),
        processing_attempts: 0,
        error_details: null
      })
      .eq('status', 'failed');

    if (maxAttempts) {
      query.lte('processing_attempts', maxAttempts);
    }

    const { data, error } = await query.select('id');

    if (error) {
      console.error('Error retrying failed items:', error);
      return 0;
    }

    return data?.length || 0;
  }
}