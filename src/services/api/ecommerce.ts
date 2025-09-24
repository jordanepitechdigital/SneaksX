import { BaseApiService } from './base'
import { supabase } from '@/lib/supabase/client'
import { OrderService } from '@/services/orders'
import { PaymentService } from '@/services/payments'
import { InventoryService } from '@/services/inventory'
import type { Order, OrderItem, CheckoutData } from '@/types/order'
import type { CreatePaymentIntentRequest, ProcessPaymentRequest, PaymentIntent } from '@/services/payments'
import type { StockAvailability, StockReservation } from '@/services/inventory'

export interface CartItem {
  id: string
  sessionId?: string
  userId?: string
  productId: string
  productName: string
  productBrand: string
  productImageUrl: string
  size: string
  quantity: number
  price: number
  totalPrice: number
  addedAt: string
  updatedAt: string
}

export interface CartSummary {
  items: CartItem[]
  totalItems: number
  subtotal: number
  estimatedShipping: number
  estimatedTax: number
  estimatedTotal: number
}

export interface AddToCartRequest {
  productId: string
  size: string
  quantity: number
  sessionId?: string
  userId?: string
}

export interface UpdateCartItemRequest {
  cartItemId: string
  quantity: number
}

export interface CartValidationResult {
  isValid: boolean
  errors: string[]
  unavailableItems: Array<{
    cartItemId: string
    productName: string
    size: string
    requestedQuantity: number
    availableQuantity: number
  }>
}

export class EcommerceService extends BaseApiService {
  constructor() {
    super('ecommerce')
  }

  // CART OPERATIONS

  async addToCart(request: AddToCartRequest): Promise<{ success: boolean; cartItem?: CartItem; error?: string }> {
    try {
      const sessionId = request.sessionId || this.generateSessionId()
      const cartItemId = crypto.randomUUID()

      // Check if item already exists in cart
      const existingItem = await this.getCartItem(request.productId, request.size, sessionId, request.userId)

      if (existingItem) {
        // Update quantity
        return this.updateCartItem({
          cartItemId: existingItem.id,
          quantity: existingItem.quantity + request.quantity
        })
      }

      // Create new cart item
      const { data, error } = await supabase
        .from('shopping_cart')
        .insert({
          id: cartItemId,
          session_id: sessionId,
          user_id: request.userId,
          product_id: request.productId,
          size: request.size,
          quantity: request.quantity,
          added_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select(`
          *,
          products (
            name,
            current_price,
            brands (name),
            product_images (image_url, is_primary)
          )
        `)
        .single()

      if (error) throw error

      const cartItem: CartItem = {
        id: data.id,
        sessionId: data.session_id,
        userId: data.user_id,
        productId: data.product_id,
        productName: data.products?.name || 'Unknown Product',
        productBrand: data.products?.brands?.name || 'Unknown Brand',
        productImageUrl: data.products?.product_images?.find((img: any) => img.is_primary)?.image_url || '',
        size: data.size,
        quantity: data.quantity,
        price: parseFloat(data.products?.current_price || '0'),
        totalPrice: parseFloat(data.products?.current_price || '0') * data.quantity,
        addedAt: data.added_at,
        updatedAt: data.updated_at
      }

      return { success: true, cartItem }
    } catch (error) {
      console.error('Error adding to cart:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add to cart'
      }
    }
  }

  async updateCartItem(request: UpdateCartItemRequest): Promise<{ success: boolean; cartItem?: CartItem; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('shopping_cart')
        .update({
          quantity: request.quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.cartItemId)
        .select(`
          *,
          products (
            name,
            current_price,
            brands (name),
            product_images (image_url, is_primary)
          )
        `)
        .single()

      if (error) throw error

      const cartItem: CartItem = {
        id: data.id,
        sessionId: data.session_id,
        userId: data.user_id,
        productId: data.product_id,
        productName: data.products?.name || 'Unknown Product',
        productBrand: data.products?.brands?.name || 'Unknown Brand',
        productImageUrl: data.products?.product_images?.find((img: any) => img.is_primary)?.image_url || '',
        size: data.size,
        quantity: data.quantity,
        price: parseFloat(data.products?.current_price || '0'),
        totalPrice: parseFloat(data.products?.current_price || '0') * data.quantity,
        addedAt: data.added_at,
        updatedAt: data.updated_at
      }

      return { success: true, cartItem }
    } catch (error) {
      console.error('Error updating cart item:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update cart item'
      }
    }
  }

  async removeFromCart(cartItemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('shopping_cart')
        .delete()
        .eq('id', cartItemId)

      if (error) throw error

      return { success: true }
    } catch (error) {
      console.error('Error removing from cart:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove from cart'
      }
    }
  }

  async getCart(sessionId: string, userId?: string): Promise<CartSummary> {
    try {
      let query = supabase
        .from('shopping_cart')
        .select(`
          *,
          products (
            name,
            current_price,
            brands (name),
            product_images (image_url, is_primary)
          )
        `)
        .order('added_at', { ascending: true })

      if (userId) {
        query = query.eq('user_id', userId)
      } else {
        query = query.eq('session_id', sessionId)
      }

      const { data, error } = await query

      if (error) throw error

      const items: CartItem[] = (data || []).map(item => ({
        id: item.id,
        sessionId: item.session_id,
        userId: item.user_id,
        productId: item.product_id,
        productName: item.products?.name || 'Unknown Product',
        productBrand: item.products?.brands?.name || 'Unknown Brand',
        productImageUrl: item.products?.product_images?.find((img: any) => img.is_primary)?.image_url || '',
        size: item.size,
        quantity: item.quantity,
        price: parseFloat(item.products?.current_price || '0'),
        totalPrice: parseFloat(item.products?.current_price || '0') * item.quantity,
        addedAt: item.added_at,
        updatedAt: item.updated_at
      }))

      const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0)
      const estimatedShipping = subtotal > 100 ? 0 : 10 // Free shipping over €100
      const estimatedTax = subtotal * 0.21 // 21% VAT
      const estimatedTotal = subtotal + estimatedShipping + estimatedTax

      return {
        items,
        totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        estimatedShipping,
        estimatedTax,
        estimatedTotal
      }
    } catch (error) {
      console.error('Error getting cart:', error)
      return {
        items: [],
        totalItems: 0,
        subtotal: 0,
        estimatedShipping: 0,
        estimatedTax: 0,
        estimatedTotal: 0
      }
    }
  }

  async clearCart(sessionId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      let query = supabase
        .from('shopping_cart')
        .delete()

      if (userId) {
        query = query.eq('user_id', userId)
      } else {
        query = query.eq('session_id', sessionId)
      }

      const { error } = await query

      if (error) throw error

      return { success: true }
    } catch (error) {
      console.error('Error clearing cart:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear cart'
      }
    }
  }

  async validateCart(sessionId: string, userId?: string): Promise<CartValidationResult> {
    try {
      const cart = await this.getCart(sessionId, userId)

      if (cart.items.length === 0) {
        return { isValid: false, errors: ['Cart is empty'], unavailableItems: [] }
      }

      // Check stock availability
      const stockItems = cart.items.map(item => ({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity
      }))

      const availability = await InventoryService.checkStockAvailability(stockItems)
      const unavailableItems = availability
        .filter(item => !item.isAvailable)
        .map(item => {
          const cartItem = cart.items.find(ci => ci.productId === item.productId && ci.size === item.size)!
          return {
            cartItemId: cartItem.id,
            productName: cartItem.productName,
            size: item.size,
            requestedQuantity: item.quantity,
            availableQuantity: item.availableQuantity
          }
        })

      const errors: string[] = []
      if (unavailableItems.length > 0) {
        errors.push(`${unavailableItems.length} item(s) in your cart are no longer available or have insufficient stock`)
      }

      return {
        isValid: unavailableItems.length === 0,
        errors,
        unavailableItems
      }
    } catch (error) {
      console.error('Error validating cart:', error)
      return {
        isValid: false,
        errors: ['Failed to validate cart'],
        unavailableItems: []
      }
    }
  }

  private async getCartItem(productId: string, size: string, sessionId: string, userId?: string): Promise<CartItem | null> {
    try {
      let query = supabase
        .from('shopping_cart')
        .select(`
          *,
          products (
            name,
            current_price,
            brands (name),
            product_images (image_url, is_primary)
          )
        `)
        .eq('product_id', productId)
        .eq('size', size)

      if (userId) {
        query = query.eq('user_id', userId)
      } else {
        query = query.eq('session_id', sessionId)
      }

      const { data, error } = await query.single()

      if (error && error.code !== 'PGRST116') throw error // PGRST116 is "not found"
      if (!data) return null

      return {
        id: data.id,
        sessionId: data.session_id,
        userId: data.user_id,
        productId: data.product_id,
        productName: data.products?.name || 'Unknown Product',
        productBrand: data.products?.brands?.name || 'Unknown Brand',
        productImageUrl: data.products?.product_images?.find((img: any) => img.is_primary)?.image_url || '',
        size: data.size,
        quantity: data.quantity,
        price: parseFloat(data.products?.current_price || '0'),
        totalPrice: parseFloat(data.products?.current_price || '0') * data.quantity,
        addedAt: data.added_at,
        updatedAt: data.updated_at
      }
    } catch (error) {
      console.error('Error getting cart item:', error)
      return null
    }
  }

  // ORDER OPERATIONS (Integrated from OrderService)

  async createOrder(userId: string, checkoutData: CheckoutData, sessionId?: string): Promise<{ success: boolean; order?: Order; reservations?: StockReservation[]; error?: string }> {
    try {
      const result = await OrderService.createOrder(userId, checkoutData, sessionId)
      return { success: true, order: result.order, reservations: result.reservations }
    } catch (error) {
      console.error('Error creating order:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create order'
      }
    }
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return OrderService.getUserOrders(userId)
  }

  async getOrderById(userId: string, orderId: string): Promise<Order | null> {
    return OrderService.getOrderById(userId, orderId)
  }

  async updateOrderStatus(userId: string, orderId: string, status: Order['status']): Promise<{ success: boolean; error?: string }> {
    const success = await OrderService.updateOrderStatus(userId, orderId, status)
    return { success, error: success ? undefined : 'Failed to update order status' }
  }

  async cancelOrder(userId: string, orderId: string): Promise<{ success: boolean; error?: string }> {
    const success = await OrderService.cancelOrder(userId, orderId)
    return { success, error: success ? undefined : 'Failed to cancel order' }
  }

  async getOrderStats(userId: string) {
    return OrderService.getOrderStats(userId)
  }

  // PAYMENT OPERATIONS (Integrated from PaymentService)

  async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<{ success: boolean; paymentIntent?: PaymentIntent; error?: string }> {
    try {
      const paymentIntent = await PaymentService.createPaymentIntent(request)
      return { success: true, paymentIntent }
    } catch (error) {
      console.error('Error creating payment intent:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create payment intent'
      }
    }
  }

  async processPayment(request: ProcessPaymentRequest): Promise<{ success: boolean; orderId?: string; error?: string }> {
    return PaymentService.processPayment(request)
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<{ success: boolean; paymentIntent?: PaymentIntent; error?: string }> {
    try {
      const paymentIntent = await PaymentService.retrievePaymentIntent(paymentIntentId)
      return { success: true, paymentIntent }
    } catch (error) {
      console.error('Error retrieving payment intent:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve payment intent'
      }
    }
  }

  // INVENTORY OPERATIONS (Integrated from InventoryService)

  async checkStockAvailability(items: Array<{ productId: string; size: string; quantity: number }>): Promise<StockAvailability[]> {
    return InventoryService.checkStockAvailability(items)
  }

  async reserveStock(
    items: Array<{ productId: string; size: string; quantity: number }>,
    options: { sessionId?: string; userId?: string; orderId?: string; expirationMinutes?: number } = {}
  ): Promise<{ success: boolean; reservations?: StockReservation[]; errors?: string[] }> {
    return InventoryService.reserveStock(items, options)
  }

  async getUserReservations(userId: string): Promise<StockReservation[]> {
    return InventoryService.getUserReservations(userId)
  }

  async getLowStockItems(threshold = 5) {
    return InventoryService.getLowStockItems(threshold)
  }

  // UTILITY METHODS

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  formatPrice(amount: number, currency = 'EUR'): string {
    return PaymentService.formatPrice(amount, currency)
  }

  // CHECKOUT FLOW

  async processCheckout(params: {
    sessionId: string
    userId: string
    checkoutData: CheckoutData
    paymentMethod: { type: 'card' | 'bank_transfer' | 'crypto'; details?: Record<string, any> }
    returnUrl: string
  }): Promise<{
    success: boolean
    order?: Order
    paymentIntent?: PaymentIntent
    redirectUrl?: string
    error?: string
  }> {
    try {
      // 1. Validate cart
      const validation = await this.validateCart(params.sessionId, params.userId)
      if (!validation.isValid) {
        return {
          success: false,
          error: `Cart validation failed: ${validation.errors.join(', ')}`
        }
      }

      // 2. Create order with stock reservation
      const orderResult = await this.createOrder(params.userId, params.checkoutData, params.sessionId)
      if (!orderResult.success || !orderResult.order) {
        return {
          success: false,
          error: orderResult.error || 'Failed to create order'
        }
      }

      // 3. Create payment intent
      const paymentResult = await this.createPaymentIntent({
        amount: params.checkoutData.total,
        orderId: orderResult.order.id,
        userId: params.userId,
        metadata: {
          sessionId: params.sessionId
        }
      })

      if (!paymentResult.success || !paymentResult.paymentIntent) {
        // Cleanup: cancel order if payment intent creation fails
        await this.cancelOrder(params.userId, orderResult.order.id)
        return {
          success: false,
          error: paymentResult.error || 'Failed to create payment'
        }
      }

      // 4. Clear cart after successful order creation
      await this.clearCart(params.sessionId, params.userId)

      return {
        success: true,
        order: orderResult.order,
        paymentIntent: paymentResult.paymentIntent,
        redirectUrl: params.returnUrl
      }
    } catch (error) {
      console.error('Error processing checkout:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Checkout processing failed'
      }
    }
  }
}

// Export singleton instance
export const ecommerceService = new EcommerceService()
export default ecommerceService