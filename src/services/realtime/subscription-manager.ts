/**
 * Enhanced Real-time Subscription Manager
 * Integrates Supabase real-time with React Query for automatic cache updates
 */

import { supabase } from '@/lib/supabase/client'
import { QueryClient } from '@tanstack/react-query'
import { AppError, ErrorType, ErrorSeverity, ErrorReporter } from '@/services/api/error-types'

export interface SubscriptionConfig {
  channel: string
  table: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  schema?: string
  filter?: string
  onData: (payload: any) => void
  onError?: (error: Error) => void
  queryKeysToInvalidate?: string[][]
  retryAttempts?: number
  retryDelay?: number
}

export interface SubscriptionStatus {
  id: string
  channel: string
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  errorCount: number
  lastError?: Error
  lastHeartbeat?: number
  retryCount: number
}

export class RealtimeSubscriptionManager {
  private subscriptions: Map<string, any> = new Map()
  private statusMap: Map<string, SubscriptionStatus> = new Map()
  private queryClient?: QueryClient
  private heartbeatInterval?: NodeJS.Timeout
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map()

  constructor(queryClient?: QueryClient) {
    this.queryClient = queryClient
    this.startHeartbeat()
  }

  /**
   * Subscribe to real-time updates with automatic React Query integration
   */
  subscribe(config: SubscriptionConfig): string {
    const subscriptionId = this.generateSubscriptionId(config.channel, config.table)

    try {
      this.initializeStatus(subscriptionId, config.channel)
      this.createSubscription(subscriptionId, config)

      return subscriptionId
    } catch (error) {
      this.handleSubscriptionError(subscriptionId, error as Error, config)
      throw error
    }
  }

  /**
   * Unsubscribe from real-time updates
   */
  unsubscribe(subscriptionId: string): boolean {
    try {
      const subscription = this.subscriptions.get(subscriptionId)
      if (subscription) {
        supabase.removeChannel(subscription)
        this.subscriptions.delete(subscriptionId)
        this.statusMap.delete(subscriptionId)

        // Clear any retry timeouts
        const timeout = this.reconnectTimeouts.get(subscriptionId)
        if (timeout) {
          clearTimeout(timeout)
          this.reconnectTimeouts.delete(subscriptionId)
        }

        return true
      }
      return false
    } catch (error) {
      console.error(`Error unsubscribing from ${subscriptionId}:`, error)
      return false
    }
  }

  /**
   * Get subscription status
   */
  getStatus(subscriptionId: string): SubscriptionStatus | undefined {
    return this.statusMap.get(subscriptionId)
  }

  /**
   * Get all subscription statuses
   */
  getAllStatuses(): SubscriptionStatus[] {
    return Array.from(this.statusMap.values())
  }

  /**
   * Check if any subscriptions are connected
   */
  isAnyConnected(): boolean {
    return Array.from(this.statusMap.values()).some(
      status => status.status === 'CONNECTED'
    )
  }

  /**
   * Get connection health score (0-100)
   */
  getHealthScore(): number {
    const statuses = this.getAllStatuses()
    if (statuses.length === 0) return 100

    const connectedCount = statuses.filter(s => s.status === 'CONNECTED').length
    const errorCount = statuses.reduce((sum, s) => sum + s.errorCount, 0)

    const connectionScore = (connectedCount / statuses.length) * 80
    const errorPenalty = Math.min(errorCount * 5, 20)

    return Math.max(0, Math.min(100, connectionScore - errorPenalty))
  }

  /**
   * Reconnect all failed subscriptions
   */
  reconnectAll(): void {
    const failedStatuses = this.getAllStatuses().filter(
      s => s.status === 'DISCONNECTED' || s.status === 'ERROR'
    )

    failedStatuses.forEach(status => {
      this.attemptReconnection(status.id)
    })
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Clear all timeouts
    this.reconnectTimeouts.forEach(timeout => clearTimeout(timeout))
    this.reconnectTimeouts.clear()

    // Unsubscribe from all subscriptions
    const subscriptionIds = Array.from(this.subscriptions.keys())
    subscriptionIds.forEach(id => this.unsubscribe(id))
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(channel: string, table: string): string {
    return `${channel}-${table}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Initialize subscription status
   */
  private initializeStatus(subscriptionId: string, channel: string): void {
    this.statusMap.set(subscriptionId, {
      id: subscriptionId,
      channel,
      status: 'CONNECTING',
      errorCount: 0,
      retryCount: 0,
    })
  }

  /**
   * Create Supabase subscription
   */
  private createSubscription(subscriptionId: string, config: SubscriptionConfig): void {
    const {
      channel,
      table,
      event = '*',
      schema = 'public',
      filter,
      onData,
      onError,
      queryKeysToInvalidate = []
    } = config

    const subscription = supabase
      .channel(channel)
      .on(
        'postgres_changes',
        {
          event,
          schema,
          table,
          ...(filter && { filter })
        },
        (payload) => {
          try {
            // Update heartbeat
            this.updateHeartbeat(subscriptionId)

            // Call custom handler
            onData(payload)

            // Invalidate React Query keys
            if (this.queryClient && queryKeysToInvalidate.length > 0) {
              queryKeysToInvalidate.forEach(queryKey => {
                this.queryClient!.invalidateQueries({ queryKey })
              })
            }

            // Reset error count on successful data
            this.updateStatus(subscriptionId, {
              status: 'CONNECTED',
              errorCount: 0
            })

          } catch (error) {
            this.handleDataError(subscriptionId, error as Error, config)
          }
        }
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          this.updateStatus(subscriptionId, {
            status: 'CONNECTED',
            lastHeartbeat: Date.now()
          })
        } else if (status === 'CHANNEL_ERROR' || error) {
          this.handleSubscriptionError(subscriptionId, error || new Error('Channel error'), config)
        } else if (status === 'CLOSED') {
          this.updateStatus(subscriptionId, { status: 'DISCONNECTED' })
          this.scheduleReconnection(subscriptionId, config)
        }
      })

    this.subscriptions.set(subscriptionId, subscription)
  }

  /**
   * Handle subscription errors
   */
  private handleSubscriptionError(subscriptionId: string, error: Error, config: SubscriptionConfig): void {
    const status = this.statusMap.get(subscriptionId)
    if (!status) return

    const errorCount = status.errorCount + 1
    const appError = new AppError(
      `Real-time subscription error: ${error.message}`,
      ErrorType.THIRD_PARTY_SERVICE_ERROR,
      ErrorSeverity.MEDIUM,
      undefined,
      'Real-time updates temporarily unavailable',
      {
        subscriptionId,
        channel: config.channel,
        table: config.table,
        errorCount
      }
    )

    this.updateStatus(subscriptionId, {
      status: 'ERROR',
      errorCount,
      lastError: appError
    })

    // Report error
    ErrorReporter.report(appError, {
      component: 'RealtimeSubscriptionManager',
      action: 'subscription_error'
    })

    // Call custom error handler
    if (config.onError) {
      config.onError(appError)
    }

    // Schedule reconnection if not too many errors
    if (errorCount < (config.retryAttempts || 5)) {
      this.scheduleReconnection(subscriptionId, config)
    }
  }

  /**
   * Handle data processing errors
   */
  private handleDataError(subscriptionId: string, error: Error, config: SubscriptionConfig): void {
    const appError = new AppError(
      `Real-time data processing error: ${error.message}`,
      ErrorType.DATA_CORRUPTION,
      ErrorSeverity.LOW,
      undefined,
      'Error processing real-time update',
      { subscriptionId }
    )

    ErrorReporter.report(appError, {
      component: 'RealtimeSubscriptionManager',
      action: 'data_processing_error'
    })

    if (config.onError) {
      config.onError(appError)
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnection(subscriptionId: string, config: SubscriptionConfig): void {
    const status = this.statusMap.get(subscriptionId)
    if (!status) return

    const delay = (config.retryDelay || 1000) * Math.pow(2, status.retryCount)
    const maxDelay = 30000 // 30 seconds max

    const timeout = setTimeout(() => {
      this.attemptReconnection(subscriptionId, config)
    }, Math.min(delay, maxDelay))

    this.reconnectTimeouts.set(subscriptionId, timeout)
  }

  /**
   * Attempt to reconnect subscription
   */
  private attemptReconnection(subscriptionId: string, config?: SubscriptionConfig): void {
    const status = this.statusMap.get(subscriptionId)
    if (!status || !config) return

    // Clean up old subscription
    const oldSubscription = this.subscriptions.get(subscriptionId)
    if (oldSubscription) {
      supabase.removeChannel(oldSubscription)
    }

    // Update retry count
    this.updateStatus(subscriptionId, {
      status: 'CONNECTING',
      retryCount: status.retryCount + 1
    })

    // Create new subscription
    try {
      this.createSubscription(subscriptionId, config)
    } catch (error) {
      this.handleSubscriptionError(subscriptionId, error as Error, config)
    }
  }

  /**
   * Update subscription status
   */
  private updateStatus(subscriptionId: string, updates: Partial<SubscriptionStatus>): void {
    const current = this.statusMap.get(subscriptionId)
    if (current) {
      this.statusMap.set(subscriptionId, { ...current, ...updates })
    }
  }

  /**
   * Update heartbeat timestamp
   */
  private updateHeartbeat(subscriptionId: string): void {
    this.updateStatus(subscriptionId, { lastHeartbeat: Date.now() })
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats()
    }, 30000) // Check every 30 seconds
  }

  /**
   * Check for stale connections
   */
  private checkHeartbeats(): void {
    const now = Date.now()
    const staleThreshold = 60000 // 1 minute

    this.statusMap.forEach((status, subscriptionId) => {
      if (
        status.status === 'CONNECTED' &&
        status.lastHeartbeat &&
        now - status.lastHeartbeat > staleThreshold
      ) {
        console.warn(`Stale subscription detected: ${subscriptionId}`)
        this.updateStatus(subscriptionId, { status: 'DISCONNECTED' })

        // Try to reconnect stale connections
        // Note: Would need config to be stored for this
      }
    })
  }
}

// Singleton instance
export const realtimeManager = new RealtimeSubscriptionManager()

// React Query integration helper
export const createRealtimeQueryIntegration = (queryClient: QueryClient) => {
  return new RealtimeSubscriptionManager(queryClient)
}

// Hook for accessing subscription manager in components
import { createContext, useContext } from 'react'

export const RealtimeManagerContext = createContext<RealtimeSubscriptionManager>(realtimeManager)

export const useRealtimeManager = () => {
  return useContext(RealtimeManagerContext)
}