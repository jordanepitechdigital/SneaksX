import { supabase } from '@/lib/supabase/client'
import { InventoryService } from '@/services/inventory'
import type { Order, OrderItem, CheckoutData } from '@/types/order'
import type { StockReservation } from '@/services/inventory'

export class OrderService {
  static async createOrder(userId: string, checkoutData: CheckoutData, sessionId?: string): Promise<{ order: Order; reservations: StockReservation[] }> {
    const orderId = crypto.randomUUID()

    try {
      // 1. First, validate and reserve stock for all items
      const stockItems = checkoutData.items.map(item => ({
        productId: item.product.id,
        size: item.size,
        quantity: item.quantity
      }))

      console.log('Reserving stock for order:', orderId, stockItems)

      const reservationResult = await InventoryService.reserveStock(stockItems, {
        userId,
        sessionId,
        orderId,
        expirationMinutes: 15 // 15 minutes to complete payment
      })

      if (!reservationResult.success) {
        throw new Error(`Stock reservation failed: ${reservationResult.errors?.join(', ')}`)
      }

      const reservations = reservationResult.reservations!

      try {
        // 2. Create order in database with reserved stock reference
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            id: orderId,
            user_id: userId,
            order_number: `SX-${Date.now().toString().slice(-8)}`,
            subtotal: checkoutData.subtotal,
            shipping_amount: checkoutData.shipping,
            tax_amount: checkoutData.tax,
            total_amount: checkoutData.total,
            status: 'pending',
            payment_status: 'pending',
            customer_notes: checkoutData.notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (orderError) throw orderError

        // 3. Create order items with product details
        const orderItems = checkoutData.items.map(item => ({
          id: crypto.randomUUID(),
          order_id: orderId,
          product_id: item.product.id,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.product.price,
          total_price: item.product.price * item.quantity,
          product_name: item.product.name,
          product_brand: item.product.brand,
          product_image_url: item.product.imageUrl,
          created_at: new Date().toISOString(),
        }))

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems)

        if (itemsError) throw itemsError

        // 4. Create shipping address if provided
        let shippingAddressId = null
        if (checkoutData.shippingAddress) {
          const addressId = crypto.randomUUID()
          const { error: addressError } = await supabase
            .from('user_addresses')
            .insert({
              id: addressId,
              user_id: userId,
              type: 'shipping',
              first_name: checkoutData.shippingAddress.name.split(' ')[0] || '',
              last_name: checkoutData.shippingAddress.name.split(' ').slice(1).join(' ') || '',
              address_line_1: checkoutData.shippingAddress.address,
              city: checkoutData.shippingAddress.city,
              postal_code: checkoutData.shippingAddress.postalCode,
              country: checkoutData.shippingAddress.country,
              created_at: new Date().toISOString(),
            })

          if (addressError) {
            console.warn('Failed to save address:', addressError)
          } else {
            shippingAddressId = addressId
            // Update order with shipping address reference
            await supabase
              .from('orders')
              .update({ shipping_address_id: shippingAddressId })
              .eq('id', orderId)
          }
        }

        // 5. Return formatted order with reservations
        const order: Order = {
          id: orderId,
          userId,
          items: checkoutData.items.map(item => ({
            id: crypto.randomUUID(),
            productId: item.product.id,
            productName: item.product.name,
            productBrand: item.product.brand,
            productImageUrl: item.product.imageUrl,
            size: item.size,
            quantity: item.quantity,
            price: item.product.price,
            totalPrice: item.product.price * item.quantity,
          })),
          subtotal: checkoutData.subtotal,
          shipping: checkoutData.shipping,
          tax: checkoutData.tax,
          total: checkoutData.total,
          status: 'pending',
          shippingAddress: checkoutData.shippingAddress,
          paymentMethod: checkoutData.paymentMethod,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        console.log('Order created successfully with stock reservations:', orderId)
        return { order, reservations }

      } catch (error) {
        // Rollback: Release the reserved stock if order creation fails
        console.error('Order creation failed, releasing reserved stock:', error)
        await InventoryService.releaseReservations(reservations.map(r => r.id))
        throw error
      }

    } catch (error) {
      console.error('Error creating order:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to create order')
    }
  }

  static async getUserOrders(userId: string): Promise<Order[]> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            products (
              name,
              brands (name),
              product_images (image_url, is_primary)
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Transform to Order format
      return (data || []).map(dbOrder => ({
        id: dbOrder.id,
        userId: dbOrder.user_id,
        items: dbOrder.order_items.map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.products?.name || 'Unknown Product',
          productBrand: item.products?.brands?.name || 'Unknown Brand',
          productImageUrl: item.products?.product_images?.find((img: any) => img.is_primary)?.image_url || '',
          size: item.size,
          quantity: item.quantity,
          price: parseFloat(item.unit_price),
          totalPrice: parseFloat(item.total_price),
        })),
        subtotal: parseFloat(dbOrder.subtotal),
        shipping: parseFloat(dbOrder.shipping_amount || 0),
        tax: parseFloat(dbOrder.tax_amount || 0),
        total: parseFloat(dbOrder.total_amount),
        status: dbOrder.status,
        shippingAddress: null, // TODO: Load from addresses table
        paymentMethod: { type: 'card', cardLast4: '****' }, // TODO: Store payment method info
        createdAt: dbOrder.created_at,
        updatedAt: dbOrder.updated_at,
      }))
    } catch (error) {
      console.error('Failed to load orders:', error)
      return []
    }
  }

  static async getOrderById(userId: string, orderId: string): Promise<Order | null> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            products (
              name,
              brands (name),
              product_images (image_url, is_primary)
            )
          )
        `)
        .eq('user_id', userId)
        .eq('id', orderId)
        .single()

      if (error) throw error

      if (!data) return null

      // Transform to Order format
      return {
        id: data.id,
        userId: data.user_id,
        items: data.order_items.map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.products?.name || 'Unknown Product',
          productBrand: item.products?.brands?.name || 'Unknown Brand',
          productImageUrl: item.products?.product_images?.find((img: any) => img.is_primary)?.image_url || '',
          size: item.size,
          quantity: item.quantity,
          price: parseFloat(item.unit_price),
          totalPrice: parseFloat(item.total_price),
        })),
        subtotal: parseFloat(data.subtotal),
        shipping: parseFloat(data.shipping_amount || 0),
        tax: parseFloat(data.tax_amount || 0),
        total: parseFloat(data.total_amount),
        status: data.status,
        shippingAddress: null, // TODO: Load from addresses table
        paymentMethod: { type: 'card', cardLast4: '****' }, // TODO: Store payment method info
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }
    } catch (error) {
      console.error('Failed to load order:', error)
      return null
    }
  }

  static async updateOrderStatus(userId: string, orderId: string, status: Order['status']): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', orderId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Failed to update order:', error)
      return false
    }
  }

  static async cancelOrder(userId: string, orderId: string): Promise<boolean> {
    try {
      // Release any active reservations for this order
      await this.releaseOrderReservations(orderId)

      return await this.updateOrderStatus(userId, orderId, 'cancelled')
    } catch (error) {
      console.error('Error cancelling order:', error)
      return false
    }
  }

  static async getOrderStats(userId: string) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('status, total_amount')
        .eq('user_id', userId)

      if (error) throw error

      const orders = data || []

      return {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        processing: orders.filter(o => o.status === 'processing').length,
        shipped: orders.filter(o => o.status === 'shipped').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        cancelled: orders.filter(o => o.status === 'cancelled').length,
        totalSpent: orders.reduce((sum, order) => sum + parseFloat(order.total_amount), 0),
      }
    } catch (error) {
      console.error('Failed to get order stats:', error)
      return {
        total: 0,
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0,
        totalSpent: 0,
      }
    }
  }

  // Stock management methods for order processing

  static async completeOrderPayment(orderId: string, paymentIntentId?: string): Promise<boolean> {
    try {
      console.log('Completing payment for order:', orderId)

      // Get active reservations for this order
      const { data: reservations, error: reservationError } = await supabase
        .from('stock_reservations')
        .select('id')
        .eq('order_id', orderId)

      if (reservationError) throw reservationError

      if (reservations && reservations.length > 0) {
        // Commit the reserved stock (move to actual inventory)
        const reservationIds = reservations.map(r => r.id)
        const result = await InventoryService.commitReservedStock(reservationIds, orderId)

        if (!result.success) {
          console.error('Failed to commit stock for order:', orderId, result.error)
          throw new Error(result.error || 'Failed to commit stock')
        }

        console.log('Stock committed successfully for order:', orderId)
      }

      // Update order status to processing and payment to completed
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'processing',
          payment_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (updateError) throw updateError

      console.log('Order payment completed successfully:', orderId)
      return true

    } catch (error) {
      console.error('Error completing order payment:', error)
      return false
    }
  }

  static async failOrderPayment(orderId: string, reason?: string): Promise<boolean> {
    try {
      console.log('Failing payment for order:', orderId, 'Reason:', reason)

      // Release any active reservations for this order
      await this.releaseOrderReservations(orderId)

      // Update order status to cancelled and payment to failed
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          payment_status: 'failed',
          notes: reason || 'Payment failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (updateError) throw updateError

      console.log('Order payment failed and stock released:', orderId)
      return true

    } catch (error) {
      console.error('Error failing order payment:', error)
      return false
    }
  }

  static async releaseOrderReservations(orderId: string): Promise<boolean> {
    try {
      // Get active reservations for this order
      const { data: reservations, error: reservationError } = await supabase
        .from('stock_reservations')
        .select('id')
        .eq('order_id', orderId)

      if (reservationError) throw reservationError

      if (reservations && reservations.length > 0) {
        const reservationIds = reservations.map(r => r.id)
        const result = await InventoryService.releaseReservations(reservationIds)

        if (!result.success) {
          console.error('Failed to release reservations for order:', orderId, result.error)
          return false
        }

        console.log('Reservations released for order:', orderId)
      }

      return true

    } catch (error) {
      console.error('Error releasing order reservations:', error)
      return false
    }
  }

  static async expireUnpaidOrders(): Promise<{ expired: number; error?: string }> {
    try {
      // Find orders that are still pending payment after 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

      const { data: expiredOrders, error: findError } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'pending')
        .eq('payment_status', 'pending')
        .lt('created_at', fifteenMinutesAgo)

      if (findError) throw findError

      if (!expiredOrders?.length) {
        return { expired: 0 }
      }

      let expiredCount = 0

      // Process each expired order
      for (const order of expiredOrders) {
        const success = await this.failOrderPayment(order.id, 'Payment timeout - order expired')
        if (success) expiredCount++
      }

      console.log(`Expired ${expiredCount} unpaid orders`)
      return { expired: expiredCount }

    } catch (error) {
      console.error('Error expiring unpaid orders:', error)
      return {
        expired: 0,
        error: error instanceof Error ? error.message : 'Failed to expire orders'
      }
    }
  }

  static async getOrderReservations(orderId: string): Promise<StockReservation[]> {
    try {
      const { data: reservations, error } = await supabase
        .from('stock_reservations')
        .select('*')
        .eq('order_id', orderId)

      if (error) throw error

      return reservations?.map(r => ({
        id: r.id,
        productId: r.product_id,
        size: r.size,
        quantity: r.quantity,
        sessionId: r.session_id,
        userId: r.user_id,
        orderId: r.order_id,
        expiresAt: r.expires_at,
        createdAt: r.created_at
      })) || []

    } catch (error) {
      console.error('Error getting order reservations:', error)
      return []
    }
  }
}