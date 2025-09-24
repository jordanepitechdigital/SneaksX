'use client'

import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react'
import { supabase as supabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { InventoryService } from '@/services/inventory'
import { useCartStockMonitor } from '@/hooks/useRealTimeStock'
import type { CartItem, Cart, CartActions, CartContextType } from '@/types/cart'
import type { Product } from '@/services/products'

type CartAction =
  | { type: 'ADD_ITEM'; payload: { product: Product; size: string; quantity: number } }
  | { type: 'REMOVE_ITEM'; payload: { itemId: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { itemId: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'LOAD_CART'; payload: { items: CartItem[] } }
  | { type: 'SET_LOADING'; payload: { loading: boolean } }
  | { type: 'SET_STOCK_STATUS'; payload: { productId: string; size: string; available: boolean; availableQuantity: number } }
  | { type: 'SET_STOCK_WARNINGS'; payload: { warnings: Array<{ itemId: string; message: string; severity: 'low' | 'out' }> } }

const STORAGE_KEY = 'sneaksx-cart'

interface CartState {
  items: CartItem[]
  loading: boolean
  stockStatus: Record<string, { available: boolean; availableQuantity: number }>
  stockWarnings: Array<{ itemId: string; message: string; severity: 'low' | 'out' }>
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const { product, size, quantity } = action.payload
      const existingItemIndex = state.items.findIndex(
        item => item.productId === product.id && item.size === size
      )

      if (existingItemIndex >= 0) {
        const newItems = state.items.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
        return { ...state, items: newItems }
      }

      const newItem: CartItem = {
        id: `${product.id}-${size}-${Date.now()}`,
        productId: product.id,
        product,
        size,
        quantity,
        addedAt: new Date().toISOString(),
      }

      return { ...state, items: [...state.items, newItem] }
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload.itemId)
      }

    case 'UPDATE_QUANTITY': {
      const { itemId, quantity } = action.payload
      if (quantity <= 0) {
        return {
          ...state,
          items: state.items.filter(item => item.id !== itemId)
        }
      }
      return {
        ...state,
        items: state.items.map(item =>
          item.id === itemId ? { ...item, quantity } : item
        )
      }
    }

    case 'CLEAR_CART':
      return { ...state, items: [] }

    case 'LOAD_CART':
      return { ...state, items: action.payload.items }

    case 'SET_LOADING':
      return { ...state, loading: action.payload.loading }

    case 'SET_STOCK_STATUS': {
      const { productId, size, available, availableQuantity } = action.payload
      const key = `${productId}-${size}`
      return {
        ...state,
        stockStatus: {
          ...state.stockStatus,
          [key]: { available, availableQuantity }
        }
      }
    }

    case 'SET_STOCK_WARNINGS':
      return {
        ...state,
        stockWarnings: action.payload.warnings
      }

    default:
      return state
  }
}

const CartContext = createContext<CartContextType>({
  cart: {
    items: [],
    totalItems: 0,
    totalPrice: 0,
    updatedAt: new Date().toISOString(),
  },
  loading: true,
  actions: {
    addItem: async () => {},
    removeItem: () => {},
    updateQuantity: async () => {},
    clearCart: () => {},
    getItemByProductAndSize: () => undefined,
    getStockStatus: () => ({ available: false, availableQuantity: 0 }),
    validateCart: async () => {},
  },
  stockWarnings: [],
  stockConnected: false,
  hasStockIssues: false,
})

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    loading: true,
    stockStatus: {},
    stockWarnings: []
  })
  const { user } = useAuth()
  const supabase = supabaseClient

  // Real-time cart stock monitoring
  const cartItems = state.items.map(item => ({
    productId: item.productId,
    size: item.size,
    quantity: item.quantity
  }))

  const {
    getCartItemAvailability,
    hasUnavailableItems,
    getUnavailableItems,
    isConnected: stockConnected
  } = useCartStockMonitor(cartItems)

  // Monitor cart stock changes and update warnings
  useEffect(() => {
    if (state.items.length > 0 && stockConnected) {
      const availability = getCartItemAvailability()
      const warnings: Array<{ itemId: string; message: string; severity: 'low' | 'out' }> = []

      availability.forEach(item => {
        const cartItem = state.items.find(ci => ci.productId === item.productId && ci.size === item.size)
        if (cartItem) {
          if (!item.isAvailable) {
            warnings.push({
              itemId: cartItem.id,
              message: `${cartItem.product.name} (${item.size}) is now out of stock`,
              severity: 'out'
            })
          } else if (item.availableQuantity < item.quantity) {
            warnings.push({
              itemId: cartItem.id,
              message: `Only ${item.availableQuantity} available for ${cartItem.product.name} (${item.size})`,
              severity: 'low'
            })
          } else if (item.availableQuantity <= 3) {
            warnings.push({
              itemId: cartItem.id,
              message: `Low stock: ${item.availableQuantity} left for ${cartItem.product.name} (${item.size})`,
              severity: 'low'
            })
          }
        }
      })

      dispatch({ type: 'SET_STOCK_WARNINGS', payload: { warnings } })
    }
  }, [state.items, stockConnected, getCartItemAvailability])

  // Load cart from localStorage and Supabase on mount
  useEffect(() => {
    async function loadCart() {
      dispatch({ type: 'SET_LOADING', payload: { loading: true } })

      try {
        // Load from localStorage first for immediate display
        const savedCart = localStorage.getItem(STORAGE_KEY)
        if (savedCart) {
          const parsedCart = JSON.parse(savedCart)
          dispatch({ type: 'LOAD_CART', payload: { items: parsedCart } })
        }

        // Then sync with Supabase if user is logged in
        if (user) {
          await syncCartFromSupabase()
        }
      } catch (error) {
        console.error('Failed to load cart:', error)
      } finally {
        dispatch({ type: 'SET_LOADING', payload: { loading: false } })
      }
    }

    loadCart()
  }, [user])

  // Save cart to localStorage and Supabase when items change
  useEffect(() => {
    if (!state.loading && state.items.length > 0) {
      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
      } catch (error) {
        console.error('Failed to save cart to localStorage:', error)
      }

      // Sync to Supabase if user is logged in
      if (user) {
        syncCartToSupabase()
      }
    }
  }, [state.items, state.loading, user])

  // Sync cart from Supabase
  async function syncCartFromSupabase() {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('shopping_cart')
        .select(`
          id,
          product_id,
          size,
          quantity,
          added_at,
          products (
            id,
            name,
            slug,
            description,
            current_price,
            retail_price,
            brand_id,
            brands (name)
          )
        `)
        .eq('user_id', user.id)
        .order('added_at', { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        const cartItems: CartItem[] = data.map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          product: {
            id: item.products.id,
            name: item.products.name,
            slug: item.products.slug,
            description: item.products.description,
            price: item.products.current_price || item.products.retail_price,
            brand: item.products.brands?.name || 'Unknown',
            sizes: [], // Will be populated when needed
            stockCount: 0, // Will be updated by stock validation
            imageUrl: item.products.image_urls?.[0] || '',
            category: item.products.category || 'Sneakers',
            createdAt: item.products.created_at || new Date().toISOString(),
          },
          size: item.size,
          quantity: item.quantity,
          addedAt: item.added_at,
        }))

        dispatch({ type: 'LOAD_CART', payload: { items: cartItems } })

        // Validate stock for all items
        await validateCartStock(cartItems)
      }
    } catch (error) {
      console.error('Failed to sync cart from Supabase:', error)
    }
  }

  // Sync cart to Supabase
  async function syncCartToSupabase() {
    if (!user || state.items.length === 0) return

    try {
      // Delete existing cart items for this user
      await supabase
        .from('shopping_cart')
        .delete()
        .eq('user_id', user.id)

      // Insert current cart items
      const cartData = state.items.map(item => ({
        user_id: user.id,
        product_id: item.productId,
        size: item.size,
        quantity: item.quantity,
        added_at: item.addedAt,
      }))

      const { error } = await supabase
        .from('shopping_cart')
        .insert(cartData)

      if (error) throw error
    } catch (error) {
      console.error('Failed to sync cart to Supabase:', error)
    }
  }

  // Validate stock for cart items
  async function validateCartStock(items: CartItem[]) {
    try {
      const stockItems = items.map(item => ({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity
      }))

      const availability = await InventoryService.checkStockAvailability(stockItems)

      availability.forEach(stock => {
        dispatch({
          type: 'SET_STOCK_STATUS',
          payload: {
            productId: stock.productId,
            size: stock.size,
            available: stock.isAvailable,
            availableQuantity: stock.availableQuantity
          }
        })
      })
    } catch (error) {
      console.error('Failed to validate cart stock:', error)
    }
  }

  const cart = useMemo((): Cart => {
    const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0)
    const totalPrice = state.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)

    return {
      items: state.items,
      totalItems,
      totalPrice,
      updatedAt: new Date().toISOString(),
    }
  }, [state.items])

  const actions = useMemo((): CartActions => ({
    addItem: async (product: Product, size: string, quantity = 1) => {
      try {
        // Check stock availability first
        const availability = await InventoryService.checkStockAvailability([
          { productId: product.id, size, quantity }
        ])

        const stockInfo = availability[0]
        if (!stockInfo.isAvailable) {
          throw new Error(`Only ${stockInfo.availableQuantity} items available in size ${size}`)
        }

        // Check if item already exists in cart
        const existingItem = state.items.find(
          item => item.productId === product.id && item.size === size
        )

        if (existingItem) {
          const newQuantity = existingItem.quantity + quantity
          // Validate total quantity after addition
          const totalAvailability = await InventoryService.checkStockAvailability([
            { productId: product.id, size, quantity: newQuantity }
          ])

          if (!totalAvailability[0].isAvailable) {
            throw new Error(`Only ${stockInfo.availableQuantity} items available in size ${size}`)
          }
        }

        dispatch({
          type: 'ADD_ITEM',
          payload: { product, size, quantity }
        })

        // Update stock status
        dispatch({
          type: 'SET_STOCK_STATUS',
          payload: {
            productId: product.id,
            size,
            available: stockInfo.isAvailable,
            availableQuantity: stockInfo.availableQuantity
          }
        })
      } catch (error) {
        throw error
      }
    },

    removeItem: (itemId: string) => {
      dispatch({ type: 'REMOVE_ITEM', payload: { itemId } })
    },

    updateQuantity: async (itemId: string, quantity: number) => {
      try {
        const item = state.items.find(i => i.id === itemId)
        if (!item) throw new Error('Item not found')

        if (quantity > 0) {
          // Validate new quantity
          const availability = await InventoryService.checkStockAvailability([
            { productId: item.productId, size: item.size, quantity }
          ])

          if (!availability[0].isAvailable) {
            throw new Error(`Only ${availability[0].availableQuantity} items available`)
          }
        }

        dispatch({ type: 'UPDATE_QUANTITY', payload: { itemId, quantity } })
      } catch (error) {
        throw error
      }
    },

    clearCart: () => {
      dispatch({ type: 'CLEAR_CART' })
    },

    getItemByProductAndSize: (productId: string, size: string) => {
      return state.items.find(item => item.productId === productId && item.size === size)
    },

    // New method to get stock status
    getStockStatus: (productId: string, size: string) => {
      const key = `${productId}-${size}`
      return state.stockStatus[key] || { available: false, availableQuantity: 0 }
    },

    // Method to validate entire cart
    validateCart: async () => {
      await validateCartStock(state.items)
    },
  }), [state.items, state.stockStatus, validateCartStock])

  const value = useMemo(() => ({
    cart,
    loading: state.loading,
    actions,
    stockWarnings: state.stockWarnings,
    stockConnected,
    hasStockIssues: hasUnavailableItems(),
  }), [cart, state.loading, actions, state.stockWarnings, stockConnected, hasUnavailableItems])

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}