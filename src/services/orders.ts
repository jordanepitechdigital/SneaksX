import { supabase } from '@/lib/supabase/client'
import type { Order, OrderItem, CheckoutData } from '@/types/order'

export class OrderService {
  static async createOrder(userId: string, checkoutData: CheckoutData): Promise<Order> {
    try {
      const orderId = crypto.randomUUID()

      // Create order in database
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          id: orderId,
          user_id: userId,
          order_number: `ORD-${Date.now()}`,
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

      // Create order items
      const orderItems = checkoutData.items.map(item => ({
        id: crypto.randomUUID(),
        order_id: orderId,
        product_id: item.product.id,
        size: item.size,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_price: item.product.price * item.quantity,
        created_at: new Date().toISOString(),
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

      if (itemsError) throw itemsError

      // Create shipping address if provided
      if (checkoutData.shippingAddress) {
        const { error: addressError } = await supabase
          .from('addresses')
          .insert({
            id: crypto.randomUUID(),
            user_id: userId,
            type: 'shipping',
            full_name: checkoutData.shippingAddress.name,
            address_line_1: checkoutData.shippingAddress.address,
            city: checkoutData.shippingAddress.city,
            postal_code: checkoutData.shippingAddress.postalCode,
            country: checkoutData.shippingAddress.country,
            created_at: new Date().toISOString(),
          })

        if (addressError) console.warn('Failed to save address:', addressError)
      }

      // Return formatted order
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

      return order
    } catch (error) {
      console.error('Error creating order:', error)
      throw new Error('Failed to create order')
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
    return await this.updateOrderStatus(userId, orderId, 'cancelled')
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
}