'use client'

import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react'
import type { CartItem, Cart, CartActions, CartContextType } from '@/types/cart'
import type { Product } from '@/services/products'

type CartAction =
  | { type: 'ADD_ITEM'; payload: { product: Product; size: string; quantity: number } }
  | { type: 'REMOVE_ITEM'; payload: { itemId: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { itemId: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'LOAD_CART'; payload: { items: CartItem[] } }

const STORAGE_KEY = 'sneaksx-cart'

function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'ADD_ITEM': {
      const { product, size, quantity } = action.payload
      const existingItemIndex = state.findIndex(
        item => item.productId === product.id && item.size === size
      )

      if (existingItemIndex >= 0) {
        return state.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }

      const newItem: CartItem = {
        id: `${product.id}-${size}-${Date.now()}`,
        productId: product.id,
        product,
        size,
        quantity,
        addedAt: new Date().toISOString(),
      }

      return [...state, newItem]
    }

    case 'REMOVE_ITEM':
      return state.filter(item => item.id !== action.payload.itemId)

    case 'UPDATE_QUANTITY': {
      const { itemId, quantity } = action.payload
      if (quantity <= 0) {
        return state.filter(item => item.id !== itemId)
      }
      return state.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      )
    }

    case 'CLEAR_CART':
      return []

    case 'LOAD_CART':
      return action.payload.items

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
    addItem: () => {},
    removeItem: () => {},
    updateQuantity: () => {},
    clearCart: () => {},
    getItemByProductAndSize: () => undefined,
  },
})

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, [])
  const [loading, setLoading] = React.useState(true)

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(STORAGE_KEY)
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart)
        dispatch({ type: 'LOAD_CART', payload: { items: parsedCart } })
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Save cart to localStorage when items change
  useEffect(() => {
    if (!loading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      } catch (error) {
        console.error('Failed to save cart to localStorage:', error)
      }
    }
  }, [items, loading])

  const cart = useMemo((): Cart => {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
    const totalPrice = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)

    return {
      items,
      totalItems,
      totalPrice,
      updatedAt: new Date().toISOString(),
    }
  }, [items])

  const actions = useMemo((): CartActions => ({
    addItem: (product: Product, size: string, quantity = 1) => {
      // Validate size is available
      if (!product.sizes.includes(size)) {
        throw new Error(`Size ${size} is not available for ${product.name}`)
      }

      // Check stock availability
      if (product.stockCount <= 0) {
        throw new Error(`${product.name} is out of stock`)
      }

      dispatch({
        type: 'ADD_ITEM',
        payload: { product, size, quantity }
      })
    },

    removeItem: (itemId: string) => {
      dispatch({ type: 'REMOVE_ITEM', payload: { itemId } })
    },

    updateQuantity: (itemId: string, quantity: number) => {
      dispatch({ type: 'UPDATE_QUANTITY', payload: { itemId, quantity } })
    },

    clearCart: () => {
      dispatch({ type: 'CLEAR_CART' })
    },

    getItemByProductAndSize: (productId: string, size: string) => {
      return items.find(item => item.productId === productId && item.size === size)
    },
  }), [items])

  const value = useMemo(() => ({
    cart,
    loading,
    actions,
  }), [cart, loading, actions])

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