/**
 * Centralized Real-time Notification System
 * Provides user-friendly notifications for real-time events
 */

import { createContext, useContext } from 'react'

export enum NotificationType {
  STOCK_LOW = 'STOCK_LOW',
  STOCK_OUT = 'STOCK_OUT',
  PRICE_DROP = 'PRICE_DROP',
  PRICE_INCREASE = 'PRICE_INCREASE',
  ORDER_STATUS = 'ORDER_STATUS',
  CART_ITEM_UNAVAILABLE = 'CART_ITEM_UNAVAILABLE',
  NEW_PRODUCT = 'NEW_PRODUCT',
  RESTOCK_ALERT = 'RESTOCK_ALERT',
  SYSTEM_ALERT = 'SYSTEM_ALERT'
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export interface NotificationData {
  id: string
  type: NotificationType
  priority: NotificationPriority
  title: string
  message: string
  timestamp: number
  data?: Record<string, any>
  actions?: NotificationAction[]
  autoHide?: boolean
  hideDelay?: number
  read?: boolean
  dismissed?: boolean
}

export interface NotificationAction {
  id: string
  label: string
  action: () => void
  style?: 'primary' | 'secondary' | 'danger'
}

export interface NotificationSettings {
  enabled: boolean
  types: Partial<Record<NotificationType, boolean>>
  priority: Partial<Record<NotificationPriority, boolean>>
  sound: boolean
  desktop: boolean
  maxNotifications: number
  autoHideDelay: number
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  types: {
    [NotificationType.STOCK_LOW]: true,
    [NotificationType.STOCK_OUT]: true,
    [NotificationType.PRICE_DROP]: true,
    [NotificationType.PRICE_INCREASE]: false,
    [NotificationType.ORDER_STATUS]: true,
    [NotificationType.CART_ITEM_UNAVAILABLE]: true,
    [NotificationType.NEW_PRODUCT]: false,
    [NotificationType.RESTOCK_ALERT]: true,
    [NotificationType.SYSTEM_ALERT]: true
  },
  priority: {
    [NotificationPriority.LOW]: true,
    [NotificationPriority.MEDIUM]: true,
    [NotificationPriority.HIGH]: true,
    [NotificationPriority.URGENT]: true
  },
  sound: true,
  desktop: true,
  maxNotifications: 10,
  autoHideDelay: 5000
}

export class NotificationSystem {
  private notifications: Map<string, NotificationData> = new Map()
  private settings: NotificationSettings = { ...DEFAULT_SETTINGS }
  private listeners: Set<(notifications: NotificationData[]) => void> = new Set()
  private notificationCounter = 0

  constructor() {
    this.loadSettings()
    if (typeof window !== 'undefined') {
      this.requestDesktopPermission()
    }
  }

  /**
   * Add a new notification
   */
  notify(notification: Omit<NotificationData, 'id' | 'timestamp'>): string {
    if (!this.shouldShow(notification)) {
      return ''
    }

    const id = `notification-${++this.notificationCounter}-${Date.now()}`
    const fullNotification: NotificationData = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
      dismissed: false,
      autoHide: notification.autoHide ?? this.getAutoHideForType(notification.type),
      hideDelay: notification.hideDelay ?? this.settings.autoHideDelay
    }

    this.notifications.set(id, fullNotification)
    this.maintainMaxNotifications()
    this.notifyListeners()

    // Show desktop notification if enabled (client-side only)
    if (typeof window !== 'undefined' && this.settings.desktop) {
      this.showDesktopNotification(fullNotification)
    }

    // Play sound if enabled (client-side only)
    if (typeof window !== 'undefined' && this.settings.sound) {
      this.playNotificationSound(notification.priority)
    }

    // Auto-hide if configured
    if (fullNotification.autoHide && fullNotification.hideDelay) {
      setTimeout(() => {
        this.dismiss(id)
      }, fullNotification.hideDelay)
    }

    return id
  }

  /**
   * Create stock-related notifications
   */
  notifyStockChange(
    productId: string,
    productName: string,
    size: string,
    oldQuantity: number,
    newQuantity: number
  ): void {
    if (newQuantity === 0 && oldQuantity > 0) {
      // Stock out
      this.notify({
        type: NotificationType.STOCK_OUT,
        priority: NotificationPriority.HIGH,
        title: 'Product Out of Stock',
        message: `${productName} (${size}) is now out of stock`,
        data: { productId, productName, size, oldQuantity, newQuantity },
        actions: [
          {
            id: 'view-product',
            label: 'View Product',
            action: () => this.navigateToProduct(productId)
          },
          {
            id: 'find-similar',
            label: 'Find Similar',
            action: () => this.findSimilarProducts(productId)
          }
        ]
      })
    } else if (newQuantity <= 5 && newQuantity > 0 && oldQuantity > 5) {
      // Low stock
      this.notify({
        type: NotificationType.STOCK_LOW,
        priority: NotificationPriority.MEDIUM,
        title: 'Low Stock Alert',
        message: `Only ${newQuantity} left for ${productName} (${size})`,
        data: { productId, productName, size, oldQuantity, newQuantity },
        actions: [
          {
            id: 'add-to-cart',
            label: 'Add to Cart',
            action: () => this.quickAddToCart(productId, size),
            style: 'primary'
          }
        ]
      })
    } else if (newQuantity > 0 && oldQuantity === 0) {
      // Restock
      this.notify({
        type: NotificationType.RESTOCK_ALERT,
        priority: NotificationPriority.MEDIUM,
        title: 'Back in Stock!',
        message: `${productName} (${size}) is available again`,
        data: { productId, productName, size, newQuantity },
        actions: [
          {
            id: 'add-to-cart',
            label: 'Add to Cart',
            action: () => this.quickAddToCart(productId, size),
            style: 'primary'
          }
        ]
      })
    }
  }

  /**
   * Create price change notifications
   */
  notifyPriceChange(
    productId: string,
    productName: string,
    oldPrice: number,
    newPrice: number,
    changePercentage: number
  ): void {
    const isDecrease = newPrice < oldPrice
    const type = isDecrease ? NotificationType.PRICE_DROP : NotificationType.PRICE_INCREASE

    // Only notify for significant changes (> 5%)
    if (Math.abs(changePercentage) < 5) return

    this.notify({
      type,
      priority: isDecrease ? NotificationPriority.MEDIUM : NotificationPriority.LOW,
      title: isDecrease ? 'Price Drop!' : 'Price Change',
      message: `${productName} ${isDecrease ? 'dropped' : 'increased'} by ${Math.abs(changePercentage).toFixed(1)}%`,
      data: { productId, productName, oldPrice, newPrice, changePercentage },
      actions: isDecrease ? [
        {
          id: 'view-product',
          label: 'View Deal',
          action: () => this.navigateToProduct(productId),
          style: 'primary'
        }
      ] : undefined
    })
  }

  /**
   * Create order status notifications
   */
  notifyOrderStatus(orderId: string, oldStatus: string, newStatus: string): void {
    const statusMessages: Record<string, { title: string; message: string; priority: NotificationPriority }> = {
      processing: {
        title: 'Order Processing',
        message: 'Your order is being processed',
        priority: NotificationPriority.MEDIUM
      },
      shipped: {
        title: 'Order Shipped',
        message: 'Your order is on its way!',
        priority: NotificationPriority.HIGH
      },
      delivered: {
        title: 'Order Delivered',
        message: 'Your order has been delivered',
        priority: NotificationPriority.HIGH
      },
      cancelled: {
        title: 'Order Cancelled',
        message: 'Your order has been cancelled',
        priority: NotificationPriority.HIGH
      }
    }

    const statusInfo = statusMessages[newStatus]
    if (!statusInfo) return

    this.notify({
      type: NotificationType.ORDER_STATUS,
      priority: statusInfo.priority,
      title: statusInfo.title,
      message: statusInfo.message,
      data: { orderId, oldStatus, newStatus },
      actions: [
        {
          id: 'view-order',
          label: 'View Order',
          action: () => this.navigateToOrder(orderId)
        }
      ]
    })
  }

  /**
   * Create cart item unavailable notification
   */
  notifyCartItemUnavailable(productId: string, productName: string, size: string): void {
    this.notify({
      type: NotificationType.CART_ITEM_UNAVAILABLE,
      priority: NotificationPriority.HIGH,
      title: 'Cart Item Unavailable',
      message: `${productName} (${size}) in your cart is no longer available`,
      data: { productId, productName, size },
      actions: [
        {
          id: 'remove-from-cart',
          label: 'Remove from Cart',
          action: () => this.removeFromCart(productId, size),
          style: 'secondary'
        },
        {
          id: 'find-similar',
          label: 'Find Similar',
          action: () => this.findSimilarProducts(productId)
        }
      ]
    })
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): void {
    const notification = this.notifications.get(id)
    if (notification) {
      notification.read = true
      this.notifyListeners()
    }
  }

  /**
   * Dismiss notification
   */
  dismiss(id: string): void {
    const notification = this.notifications.get(id)
    if (notification) {
      notification.dismissed = true
      // Remove after a short delay to allow exit animation
      setTimeout(() => {
        this.notifications.delete(id)
        this.notifyListeners()
      }, 300)
    }
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications.clear()
    this.notifyListeners()
  }

  /**
   * Get all notifications
   */
  getAll(): NotificationData[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get unread notifications
   */
  getUnread(): NotificationData[] {
    return this.getAll().filter(n => !n.read)
  }

  /**
   * Get notifications by type
   */
  getByType(type: NotificationType): NotificationData[] {
    return this.getAll().filter(n => n.type === type)
  }

  /**
   * Subscribe to notification changes
   */
  subscribe(listener: (notifications: NotificationData[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Update notification settings
   */
  updateSettings(updates: Partial<NotificationSettings>): void {
    this.settings = { ...this.settings, ...updates }
    this.saveSettings()
  }

  /**
   * Get current settings
   */
  getSettings(): NotificationSettings {
    return { ...this.settings }
  }

  // Private methods

  private shouldShow(notification: Omit<NotificationData, 'id' | 'timestamp'>): boolean {
    if (!this.settings.enabled) return false
    if (!this.settings.types[notification.type]) return false
    if (!this.settings.priority[notification.priority]) return false
    return true
  }

  private getAutoHideForType(type: NotificationType): boolean {
    const autoHideTypes = [
      NotificationType.STOCK_LOW,
      NotificationType.PRICE_INCREASE,
      NotificationType.SYSTEM_ALERT
    ]
    return autoHideTypes.includes(type)
  }

  private maintainMaxNotifications(): void {
    const notifications = this.getAll()
    if (notifications.length > this.settings.maxNotifications) {
      const excess = notifications.slice(this.settings.maxNotifications)
      excess.forEach(n => this.notifications.delete(n.id))
    }
  }

  private notifyListeners(): void {
    const notifications = this.getAll()
    this.listeners.forEach(listener => listener(notifications))
  }

  private async showDesktopNotification(notification: NotificationData): Promise<void> {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const desktopNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/icon-192x192.png',
          badge: '/icon-72x72.png',
          tag: notification.id
        })

        desktopNotification.onclick = () => {
          window.focus()
          if (notification.actions && notification.actions[0]) {
            notification.actions[0].action()
          }
        }
      } catch (error) {
        console.warn('Failed to show desktop notification:', error)
      }
    }
  }

  private playNotificationSound(priority: NotificationPriority): void {
    try {
      // Create different sounds for different priorities
      const context = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(context.destination)

      // Different frequencies for different priorities
      const frequencies = {
        [NotificationPriority.LOW]: 200,
        [NotificationPriority.MEDIUM]: 300,
        [NotificationPriority.HIGH]: 400,
        [NotificationPriority.URGENT]: 500
      }

      oscillator.frequency.setValueAtTime(frequencies[priority], context.currentTime)
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.1, context.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3)

      oscillator.start(context.currentTime)
      oscillator.stop(context.currentTime + 0.3)
    } catch (error) {
      // Fallback: no sound
      console.warn('Could not play notification sound:', error)
    }
  }

  private async requestDesktopPermission(): Promise<void> {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch (error) {
        console.warn('Failed to request notification permission:', error)
      }
    }
  }

  private loadSettings(): void {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('notification-settings')
        if (saved) {
          this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
        }
      }
    } catch (error) {
      console.warn('Failed to load notification settings:', error)
    }
  }

  private saveSettings(): void {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem('notification-settings', JSON.stringify(this.settings))
      }
    } catch (error) {
      console.warn('Failed to save notification settings:', error)
    }
  }

  // Navigation helpers (to be implemented based on routing)
  private navigateToProduct(productId: string): void {
    if (typeof window !== 'undefined') {
      window.location.href = `/products/${productId}`
    }
  }

  private navigateToOrder(orderId: string): void {
    if (typeof window !== 'undefined') {
      window.location.href = `/orders/${orderId}`
    }
  }

  private findSimilarProducts(productId: string): void {
    if (typeof window !== 'undefined') {
      window.location.href = `/products?similar=${productId}`
    }
  }

  private quickAddToCart(productId: string, size: string): void {
    // This would integrate with cart context/service
    console.log('Quick add to cart:', productId, size)
  }

  private removeFromCart(productId: string, size: string): void {
    // This would integrate with cart context/service
    console.log('Remove from cart:', productId, size)
  }
}

// Singleton instance
export const notificationSystem = new NotificationSystem()

// React context for notifications
export const NotificationContext = createContext<NotificationSystem>(notificationSystem)

export const useNotifications = () => {
  return useContext(NotificationContext)
}