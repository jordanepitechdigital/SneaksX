import type { CartItem } from './cart'

export interface ShippingAddress {
  firstName: string
  lastName: string
  address: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
}

export interface PaymentMethod {
  id: string
  type: 'card' | 'paypal' | 'apple_pay' | 'google_pay'
  last4?: string
  brand?: string
  expiryMonth?: number
  expiryYear?: number
}

export interface OrderItem {
  id: string
  productId: string
  productName: string
  productBrand: string
  productImageUrl: string
  size: string
  quantity: number
  price: number
  totalPrice: number
}

export interface Order {
  id: string
  userId: string
  items: OrderItem[]
  subtotal: number
  shipping: number
  tax: number
  total: number
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  shippingAddress: ShippingAddress
  paymentMethod?: PaymentMethod
  trackingNumber?: string
  createdAt: string
  updatedAt: string
}

export interface CheckoutData {
  shippingAddress: ShippingAddress
  paymentMethod: PaymentMethod
  items: CartItem[]
  subtotal: number
  shipping: number
  tax: number
  total: number
}