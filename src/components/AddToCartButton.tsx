'use client'

import { useState } from 'react'
import { useCart } from '@/contexts/CartContext'
import type { Product } from '@/services/products'

interface AddToCartButtonProps {
  product: Product
  selectedSize?: string
  onSizeRequired?: () => void
  className?: string
  disabled?: boolean
}

export default function AddToCartButton({
  product,
  selectedSize,
  onSizeRequired,
  className = '',
  disabled = false
}: AddToCartButtonProps) {
  const { actions } = useCart()
  const [isAdding, setIsAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleAddToCart = async () => {
    if (!selectedSize) {
      onSizeRequired?.()
      return
    }

    if (disabled || isAdding) return

    setIsAdding(true)
    setMessage(null)

    try {
      actions.addItem(product, selectedSize)
      setMessage('Added to cart!')

      // Clear success message after 2 seconds
      setTimeout(() => setMessage(null), 2000)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add to cart'
      setMessage(errorMessage)

      // Clear error message after 3 seconds
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setIsAdding(false)
    }
  }

  const isOutOfStock = product.stockCount <= 0
  const buttonDisabled = disabled || isAdding || isOutOfStock

  return (
    <div className="space-y-2">
      <button
        onClick={handleAddToCart}
        disabled={buttonDisabled}
        className={`
          w-full px-4 py-2 rounded-md text-sm font-medium transition-colors
          ${buttonDisabled
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }
          ${className}
        `}
      >
        {isAdding
          ? 'Adding...'
          : isOutOfStock
          ? 'Out of Stock'
          : selectedSize
          ? 'Add to Cart'
          : 'Select Size'
        }
      </button>

      {message && (
        <div className={`text-xs p-2 rounded ${
          message.includes('Added')
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}