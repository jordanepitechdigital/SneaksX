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
          btn w-full text-sm font-medium
          ${buttonDisabled
            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
            : !selectedSize
            ? 'btn-secondary'
            : 'btn-primary'
          }
          ${isAdding ? 'animate-pulse' : ''}
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
        <div className={`text-xs p-2 rounded animate-bounce-in ${
          message.includes('Added')
            ? 'bg-success-50 text-success-700 border border-success-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}