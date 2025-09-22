import { createClient } from '@supabase/supabase-js';

export interface StockReservation {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  session_id?: string;
  user_id?: string;
  order_id?: string;
  expires_at: string;
  created_at: string;
}

export interface StockMove {
  product_id: string;
  size: string;
  move_type: 'reserve' | 'commit' | 'release' | 'adjustment' | 'restock';
  quantity: number;
  reference_id?: string;
  reference_type?: string;
  reason?: string;
  user_id?: string;
  session_id?: string;
}

export interface StockLevel {
  product_id: string;
  size: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

export class StockManager {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Reserve stock for checkout process
   * Creates a temporary hold on inventory
   */
  async reserveStock(
    productId: string,
    size: string,
    quantity: number,
    options: {
      sessionId?: string;
      userId?: string;
      orderId?: string;
      ttlMinutes?: number;
    } = {}
  ): Promise<{ success: boolean; reservationId?: string; error?: string }> {
    const { sessionId, userId, orderId, ttlMinutes = 15 } = options;

    try {
      // Start transaction
      const { data, error } = await this.supabase.rpc('reserve_stock', {
        p_product_id: productId,
        p_size: size,
        p_quantity: quantity,
        p_session_id: sessionId,
        p_user_id: userId,
        p_order_id: orderId,
        p_ttl_minutes: ttlMinutes
      });

      if (error) {
        return {
          success: false,
          error: `Failed to reserve stock: ${error.message}`
        };
      }

      if (!data?.success) {
        return {
          success: false,
          error: data?.error || 'Insufficient stock available'
        };
      }

      // Log inventory move
      await this.logInventoryMove({
        product_id: productId,
        size: size,
        move_type: 'reserve',
        quantity: -quantity, // Negative for reservation
        reference_id: orderId || sessionId,
        reference_type: orderId ? 'order' : 'session',
        reason: 'Stock reserved for checkout',
        user_id: userId,
        session_id: sessionId
      });

      return {
        success: true,
        reservationId: data.reservation_id
      };

    } catch (error) {
      console.error('Error reserving stock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Commit reserved stock (complete purchase)
   * Permanently reduces available inventory
   */
  async commitReservedStock(
    reservationId: string,
    orderId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabase.rpc('commit_reserved_stock', {
        p_reservation_id: reservationId,
        p_order_id: orderId
      });

      if (error) {
        return {
          success: false,
          error: `Failed to commit stock: ${error.message}`
        };
      }

      if (!data?.success) {
        return {
          success: false,
          error: data?.error || 'Reservation not found or expired'
        };
      }

      // Log inventory move
      await this.logInventoryMove({
        product_id: data.product_id,
        size: data.size,
        move_type: 'commit',
        quantity: -data.quantity,
        reference_id: orderId,
        reference_type: 'order',
        reason: 'Stock committed for order',
        user_id: data.user_id
      });

      return { success: true };

    } catch (error) {
      console.error('Error committing stock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Release reserved stock (cancel reservation)
   * Returns stock to available inventory
   */
  async releaseReservedStock(
    reservationId: string,
    reason: string = 'Reservation cancelled'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabase.rpc('release_reserved_stock', {
        p_reservation_id: reservationId
      });

      if (error) {
        return {
          success: false,
          error: `Failed to release stock: ${error.message}`
        };
      }

      if (!data?.success) {
        return {
          success: false,
          error: data?.error || 'Reservation not found'
        };
      }

      // Log inventory move
      await this.logInventoryMove({
        product_id: data.product_id,
        size: data.size,
        move_type: 'release',
        quantity: data.quantity, // Positive for release
        reference_id: reservationId,
        reference_type: 'reservation',
        reason,
        user_id: data.user_id,
        session_id: data.session_id
      });

      return { success: true };

    } catch (error) {
      console.error('Error releasing stock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get current stock levels
   */
  async getStockLevel(productId: string, size?: string): Promise<{
    stockLevels: StockLevel[];
    error?: string;
  }> {
    try {
      let query = this.supabase
        .from('product_stock')
        .select('product_id, size, quantity, reserved_quantity, available_quantity')
        .eq('product_id', productId);

      if (size) {
        query = query.eq('size', size);
      }

      const { data, error } = await query;

      if (error) {
        return {
          stockLevels: [],
          error: error.message
        };
      }

      return {
        stockLevels: data || []
      };

    } catch (error) {
      console.error('Error getting stock levels:', error);
      return {
        stockLevels: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if stock is available for purchase
   */
  async isStockAvailable(
    productId: string,
    size: string,
    quantity: number
  ): Promise<{ available: boolean; currentStock?: number; error?: string }> {
    try {
      const { stockLevels, error } = await this.getStockLevel(productId, size);

      if (error) {
        return { available: false, error };
      }

      if (stockLevels.length === 0) {
        return { available: false, currentStock: 0 };
      }

      const stock = stockLevels[0];
      return {
        available: stock.available_quantity >= quantity,
        currentStock: stock.available_quantity
      };

    } catch (error) {
      console.error('Error checking stock availability:', error);
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Adjust stock levels (manual inventory adjustment)
   */
  async adjustStock(
    productId: string,
    size: string,
    adjustment: number,
    reason: string,
    userId?: string
  ): Promise<{ success: boolean; newQuantity?: number; error?: string }> {
    try {
      const { data, error } = await this.supabase.rpc('adjust_stock', {
        p_product_id: productId,
        p_size: size,
        p_adjustment: adjustment,
        p_user_id: userId
      });

      if (error) {
        return {
          success: false,
          error: `Failed to adjust stock: ${error.message}`
        };
      }

      // Log inventory move
      await this.logInventoryMove({
        product_id: productId,
        size: size,
        move_type: 'adjustment',
        quantity: adjustment,
        reference_type: 'manual',
        reason,
        user_id: userId
      });

      return {
        success: true,
        newQuantity: data?.new_quantity
      };

    } catch (error) {
      console.error('Error adjusting stock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Restock inventory (add new stock)
   */
  async restockInventory(
    productId: string,
    size: string,
    quantity: number,
    reason: string = 'Inventory restock',
    userId?: string
  ): Promise<{ success: boolean; newQuantity?: number; error?: string }> {
    try {
      // Ensure we have a product_stock record
      await this.supabase
        .from('product_stock')
        .upsert({
          product_id: productId,
          size: size,
          quantity: 0,
          reserved_quantity: 0
        }, {
          onConflict: 'product_id,size',
          ignoreDuplicates: true
        });

      // Add to existing stock
      const { data, error } = await this.supabase.rpc('adjust_stock', {
        p_product_id: productId,
        p_size: size,
        p_adjustment: quantity,
        p_user_id: userId
      });

      if (error) {
        return {
          success: false,
          error: `Failed to restock: ${error.message}`
        };
      }

      // Log inventory move
      await this.logInventoryMove({
        product_id: productId,
        size: size,
        move_type: 'restock',
        quantity: quantity,
        reference_type: 'restock',
        reason,
        user_id: userId
      });

      return {
        success: true,
        newQuantity: data?.new_quantity
      };

    } catch (error) {
      console.error('Error restocking inventory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get inventory move history
   */
  async getInventoryHistory(
    productId: string,
    size?: string,
    limit: number = 50
  ): Promise<{
    moves: any[];
    error?: string;
  }> {
    try {
      let query = this.supabase
        .from('inventory_moves')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (size) {
        query = query.eq('size', size);
      }

      const { data, error } = await query;

      if (error) {
        return {
          moves: [],
          error: error.message
        };
      }

      return {
        moves: data || []
      };

    } catch (error) {
      console.error('Error getting inventory history:', error);
      return {
        moves: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clean up expired reservations
   */
  async cleanupExpiredReservations(): Promise<{
    released: number;
    error?: string;
  }> {
    try {
      const { data, error } = await this.supabase.rpc('cleanup_expired_reservations');

      if (error) {
        return {
          released: 0,
          error: error.message
        };
      }

      return {
        released: data?.released_count || 0
      };

    } catch (error) {
      console.error('Error cleaning up expired reservations:', error);
      return {
        released: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Log inventory movement
   */
  private async logInventoryMove(move: StockMove): Promise<void> {
    try {
      await this.supabase
        .from('inventory_moves')
        .insert([move]);
    } catch (error) {
      console.error('Error logging inventory move:', error);
      // Don't throw error, as this is logging only
    }
  }

  /**
   * Get low stock alerts
   */
  async getLowStockItems(threshold: number = 5): Promise<{
    items: any[];
    error?: string;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('product_stock')
        .select(`
          product_id,
          size,
          available_quantity,
          products!inner(name, brands(name))
        `)
        .lte('available_quantity', threshold)
        .gt('available_quantity', 0)
        .order('available_quantity', { ascending: true });

      if (error) {
        return {
          items: [],
          error: error.message
        };
      }

      return {
        items: data || []
      };

    } catch (error) {
      console.error('Error getting low stock items:', error);
      return {
        items: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}