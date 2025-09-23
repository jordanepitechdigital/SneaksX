import type { Product } from '@/services/products'

export interface CartItem {
  id: string
  productId: string
  product: Product
  size: string
  quantity: number
  addedAt: string
}

export interface Cart {
  items: CartItem[]
  totalItems: number
  totalPrice: number
  updatedAt: string
}

export interface CartActions {
  addItem: (product: Product, size: string, quantity?: number) => void
  removeItem: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
  getItemByProductAndSize: (productId: string, size: string) => CartItem | undefined
}

export interface CartContextType {
  cart: Cart
  loading: boolean
  actions: CartActions
}