import { supabase as supabaseClient } from '@/lib/supabase/client'

export interface StockAvailability {
  productId: string
  size: string
  quantity: number
  reservedQuantity: number
  availableQuantity: number
  isAvailable: boolean
}

export interface StockReservation {
  id: string
  productId: string
  size: string
  quantity: number
  sessionId?: string
  userId?: string
  orderId?: string
  expiresAt: string
  createdAt: string
}

export interface InventoryMove {
  id: string
  productId: string
  size: string
  moveType: 'reserve' | 'commit' | 'release' | 'adjustment' | 'restock'
  quantity: number
  referenceId?: string
  referenceType?: string
  reason?: string
  userId?: string
  sessionId?: string
  createdAt: string
}

export class InventoryService {
  private static supabase = supabaseClient

  // Check if products and sizes are available
  static async checkStockAvailability(
    items: Array<{ productId: string; size: string; quantity: number }>
  ): Promise<StockAvailability[]> {
    try {
      const productIds = [...new Set(items.map(item => item.productId))]

      const { data: stockData, error } = await this.supabase
        .from('product_stock')
        .select(`
          product_id,
          size,
          quantity,
          reserved_quantity,
          available_quantity
        `)
        .in('product_id', productIds)

      if (error) throw error

      const availability: StockAvailability[] = items.map(item => {
        const stock = stockData?.find(
          s => s.product_id === item.productId && s.size === item.size
        )

        if (!stock) {
          return {
            productId: item.productId,
            size: item.size,
            quantity: 0,
            reservedQuantity: 0,
            availableQuantity: 0,
            isAvailable: false
          }
        }

        return {
          productId: item.productId,
          size: item.size,
          quantity: stock.quantity,
          reservedQuantity: stock.reserved_quantity,
          availableQuantity: stock.available_quantity,
          isAvailable: stock.available_quantity >= item.quantity
        }
      })

      return availability
    } catch (error) {
      console.error('Error checking stock availability:', error)
      throw error
    }
  }

  // Reserve stock for checkout (15 minute expiration)
  static async reserveStock(
    items: Array<{ productId: string; size: string; quantity: number }>,
    options: {
      sessionId?: string
      userId?: string
      orderId?: string
      expirationMinutes?: number
    } = {}
  ): Promise<{ success: boolean; reservations?: StockReservation[]; errors?: string[] }> {
    try {
      const { sessionId, userId, orderId, expirationMinutes = 15 } = options
      const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()

      // First check availability
      const availability = await this.checkStockAvailability(items)
      const unavailableItems = availability.filter(item => !item.isAvailable)

      if (unavailableItems.length > 0) {
        return {
          success: false,
          errors: unavailableItems.map(
            item => `${item.size} not available (requested: ${items.find(i => i.productId === item.productId && i.size === item.size)?.quantity}, available: ${item.availableQuantity})`
          )
        }
      }

      // Create reservations
      const reservationData = items.map(item => ({
        product_id: item.productId,
        size: item.size,
        quantity: item.quantity,
        session_id: sessionId,
        user_id: userId,
        order_id: orderId,
        expires_at: expiresAt
      }))

      const { data: reservations, error: reservationError } = await this.supabase
        .from('stock_reservations')
        .insert(reservationData)
        .select()

      if (reservationError) throw reservationError

      // Update reserved quantities in product_stock
      for (const item of items) {
        // Get current reserved quantity first
        const { data: currentStock, error: fetchError } = await this.supabase
          .from('product_stock')
          .select('reserved_quantity')
          .eq('product_id', item.productId)
          .eq('size', item.size)
          .single()

        if (fetchError) throw fetchError

        // Update with new reserved quantity
        const { error: updateError } = await this.supabase
          .from('product_stock')
          .update({
            reserved_quantity: currentStock.reserved_quantity + item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('product_id', item.productId)
          .eq('size', item.size)

        if (updateError) throw updateError

        // Log inventory move
        await this.logInventoryMove({
          productId: item.productId,
          size: item.size,
          moveType: 'reserve',
          quantity: -item.quantity,
          referenceId: reservations?.[0]?.id,
          referenceType: 'reservation',
          reason: 'Stock reserved for checkout',
          userId,
          sessionId
        })
      }

      return {
        success: true,
        reservations: reservations?.map(r => ({
          id: r.id,
          productId: r.product_id,
          size: r.size,
          quantity: r.quantity,
          sessionId: r.session_id,
          userId: r.user_id,
          orderId: r.order_id,
          expiresAt: r.expires_at,
          createdAt: r.created_at
        }))
      }
    } catch (error) {
      console.error('Error reserving stock:', error)
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Failed to reserve stock']
      }
    }
  }

  // Commit reserved stock (move to order)
  static async commitReservedStock(
    reservationIds: string[],
    orderId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get reservation details
      const { data: reservations, error: fetchError } = await this.supabase
        .from('stock_reservations')
        .select('*')
        .in('id', reservationIds)

      if (fetchError) throw fetchError
      if (!reservations?.length) throw new Error('No reservations found')

      // Update product_stock: decrease quantity, decrease reserved_quantity
      for (const reservation of reservations) {
        // Get current stock first
        const { data: currentStock, error: fetchError } = await this.supabase
          .from('product_stock')
          .select('quantity, reserved_quantity')
          .eq('product_id', reservation.product_id)
          .eq('size', reservation.size)
          .single()

        if (fetchError) throw fetchError

        // Update with decremented values
        const { error: updateError } = await this.supabase
          .from('product_stock')
          .update({
            quantity: currentStock.quantity - reservation.quantity,
            reserved_quantity: currentStock.reserved_quantity - reservation.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('product_id', reservation.product_id)
          .eq('size', reservation.size)

        if (updateError) throw updateError

        // Log inventory move
        await this.logInventoryMove({
          productId: reservation.product_id,
          size: reservation.size,
          moveType: 'commit',
          quantity: -reservation.quantity,
          referenceId: orderId,
          referenceType: 'order',
          reason: 'Stock committed to order',
          userId: reservation.user_id,
          sessionId: reservation.session_id
        })
      }

      // Delete reservations
      const { error: deleteError } = await this.supabase
        .from('stock_reservations')
        .delete()
        .in('id', reservationIds)

      if (deleteError) throw deleteError

      return { success: true }
    } catch (error) {
      console.error('Error committing reserved stock:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to commit stock'
      }
    }
  }

  // Release expired or cancelled reservations
  static async releaseReservations(
    reservationIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get reservation details
      const { data: reservations, error: fetchError } = await this.supabase
        .from('stock_reservations')
        .select('*')
        .in('id', reservationIds)

      if (fetchError) throw fetchError
      if (!reservations?.length) return { success: true }

      // Update product_stock: decrease reserved_quantity
      for (const reservation of reservations) {
        // Get current reserved quantity first
        const { data: currentStock, error: fetchError } = await this.supabase
          .from('product_stock')
          .select('reserved_quantity')
          .eq('product_id', reservation.product_id)
          .eq('size', reservation.size)
          .single()

        if (fetchError) throw fetchError

        // Update with decreased reserved quantity
        const { error: updateError } = await this.supabase
          .from('product_stock')
          .update({
            reserved_quantity: Math.max(0, currentStock.reserved_quantity - reservation.quantity),
            updated_at: new Date().toISOString()
          })
          .eq('product_id', reservation.product_id)
          .eq('size', reservation.size)

        if (updateError) throw updateError

        // Log inventory move
        await this.logInventoryMove({
          productId: reservation.product_id,
          size: reservation.size,
          moveType: 'release',
          quantity: reservation.quantity,
          referenceId: reservation.id,
          referenceType: 'reservation',
          reason: 'Reservation released',
          userId: reservation.user_id,
          sessionId: reservation.session_id
        })
      }

      // Delete reservations
      const { error: deleteError } = await this.supabase
        .from('stock_reservations')
        .delete()
        .in('id', reservationIds)

      if (deleteError) throw deleteError

      return { success: true }
    } catch (error) {
      console.error('Error releasing reservations:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to release reservations'
      }
    }
  }

  // Clean up expired reservations (background task)
  static async cleanupExpiredReservations(): Promise<{ cleaned: number; error?: string }> {
    try {
      const now = new Date().toISOString()

      // Get expired reservations
      const { data: expiredReservations, error: fetchError } = await this.supabase
        .from('stock_reservations')
        .select('*')
        .lt('expires_at', now)

      if (fetchError) throw fetchError
      if (!expiredReservations?.length) return { cleaned: 0 }

      const reservationIds = expiredReservations.map(r => r.id)
      const result = await this.releaseReservations(reservationIds)

      if (!result.success) throw new Error(result.error)

      return { cleaned: expiredReservations.length }
    } catch (error) {
      console.error('Error cleaning expired reservations:', error)
      return {
        cleaned: 0,
        error: error instanceof Error ? error.message : 'Cleanup failed'
      }
    }
  }

  // Get user's active reservations
  static async getUserReservations(userId: string): Promise<StockReservation[]> {
    try {
      const { data, error } = await this.supabase
        .from('stock_reservations')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error

      return data?.map(r => ({
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
      console.error('Error getting user reservations:', error)
      return []
    }
  }

  // Log inventory movements for audit trail
  private static async logInventoryMove(move: {
    productId: string
    size: string
    moveType: 'reserve' | 'commit' | 'release' | 'adjustment' | 'restock'
    quantity: number
    referenceId?: string
    referenceType?: string
    reason?: string
    userId?: string
    sessionId?: string
  }): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('inventory_moves')
        .insert({
          product_id: move.productId,
          size: move.size,
          move_type: move.moveType,
          quantity: move.quantity,
          reference_id: move.referenceId,
          reference_type: move.referenceType,
          reason: move.reason,
          user_id: move.userId,
          session_id: move.sessionId
        })

      if (error) throw error
    } catch (error) {
      console.error('Error logging inventory move:', error)
      // Don't throw - logging failure shouldn't break the main operation
    }
  }

  // Get low stock alerts
  static async getLowStockItems(threshold = 5): Promise<Array<{
    productId: string
    productName: string
    size: string
    quantity: number
    availableQuantity: number
  }>> {
    try {
      const { data, error } = await this.supabase
        .from('product_stock')
        .select(`
          product_id,
          size,
          quantity,
          available_quantity,
          products:product_id (
            name
          )
        `)
        .lte('available_quantity', threshold)
        .order('available_quantity', { ascending: true })

      if (error) throw error

      return data?.map(item => ({
        productId: item.product_id,
        productName: (item.products as any)?.name || 'Unknown Product',
        size: item.size,
        quantity: item.quantity,
        availableQuantity: item.available_quantity
      })) || []
    } catch (error) {
      console.error('Error getting low stock items:', error)
      return []
    }
  }
}

export default InventoryService