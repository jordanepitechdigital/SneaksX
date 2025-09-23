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
  addItem: (product: Product, size: string, quantity?: number) => Promise<void>
  removeItem: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => Promise<void>
  clearCart: () => void
  getItemByProductAndSize: (productId: string, size: string) => CartItem | undefined
  getStockStatus: (productId: string, size: string) => { available: boolean; availableQuantity: number }
  validateCart: () => Promise<void>
}

export interface CartStockWarning {
  itemId: string
  message: string
  severity: 'low' | 'out'
}

export interface CartContextType {
  cart: Cart
  loading: boolean
  actions: CartActions
  stockWarnings: CartStockWarning[]
  stockConnected: boolean
  hasStockIssues: boolean
}