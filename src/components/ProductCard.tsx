'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AddToCartButton from '@/components/AddToCartButton'
import { Badge } from '@/components/ui/badge'

export interface Product {
  id: string
  name: string
  brand: string
  price: number
  imageUrl: string
  description?: string
  category: string
  sizes: string[]
  stockCount: number
  createdAt: string
}

interface ProductCardProps {
  product: Product
  stockData?: Record<string, any>
  isConnected?: boolean
  className?: string
  showBadges?: boolean
  badgeVariants?: {
    lowStock?: number
    featured?: boolean
    sale?: boolean
    new?: boolean
  }
}

export function ProductCard({
  product,
  stockData = {},
  isConnected = false,
  className = '',
  showBadges = true,
  badgeVariants = { lowStock: 5 }
}: ProductCardProps) {
  const [selectedSize, setSelectedSize] = useState<string>('')
  const [showSizeError, setShowSizeError] = useState(false)
  const [stockUpdated, setStockUpdated] = useState(false)

  // Calculate real-time stock information
  const getRealTimeStock = () => {
    let totalAvailable = 0
    const availableSizes = []

    for (const size of product.sizes) {
      const sizeStock = stockData[size]
      const available = sizeStock?.availableQuantity ??
        Math.max(0, (product.stockCount || 0) / product.sizes.length) // Fallback estimate

      if (available > 0) {
        availableSizes.push(size)
        totalAvailable += available
      }
    }

    return {
      totalAvailable: Math.floor(totalAvailable),
      availableSizes,
      hasRecentUpdate: Object.values(stockData).some((stock: any) =>
        stock?.timestamp && Date.now() - new Date(stock.timestamp).getTime() < 10000
      )
    }
  }

  const { totalAvailable, availableSizes, hasRecentUpdate } = getRealTimeStock()

  // Show visual feedback for recent updates
  useEffect(() => {
    if (hasRecentUpdate) {
      setStockUpdated(true)
      const timer = setTimeout(() => setStockUpdated(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [hasRecentUpdate])

  const handleSizeRequired = () => {
    setShowSizeError(true)
    setTimeout(() => setShowSizeError(false), 3000)
  }

  // Generate fallback image if needed
  const getProductImage = () => {
    if (product.imageUrl) return product.imageUrl

    // Create diverse sneaker images based on product characteristics
    const imageVariants = [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=400&fit=crop&crop=center',
      'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=400&h=400&fit=crop&crop=center',
    ]

    // Create a simple hash from product ID to ensure consistency
    const productHash = product.id.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)

    const imageIndex = Math.abs(productHash) % imageVariants.length
    return imageVariants[imageIndex]
  }

  return (
    <div className={`product-card ${
      stockUpdated ? 'ring-2 ring-blue-500 ring-opacity-50 animate-scale-in' : ''
    } ${className}`}>
      <Link href={`/products/${product.id}`} className="block relative overflow-hidden">
        <div className="aspect-square bg-slate-100 p-4">
          <img
            src={getProductImage()}
            alt={product.name}
            className="product-image w-full h-full object-contain"
            onError={(e) => {
              const imageVariants = [
                'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop&crop=center',
                'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop&crop=center',
                'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop&crop=center',
              ]
              const randomIndex = Math.floor(Math.random() * imageVariants.length)
              e.currentTarget.src = imageVariants[randomIndex]
            }}
          />
        </div>

        {/* Badges */}
        {showBadges && (
          <div className="absolute top-2 right-2 flex flex-col space-y-1">
            {isConnected && (
              <Badge variant="success" className="text-xs px-1.5 py-0.5">
                <div className="w-1 h-1 bg-white rounded-full animate-pulse mr-1"></div>
                LIVE
              </Badge>
            )}

            {badgeVariants.featured && (
              <Badge variant="featured" className="text-xs px-1.5 py-0.5">
                FEATURED
              </Badge>
            )}

            {badgeVariants.sale && (
              <Badge variant="sale" className="text-xs px-1.5 py-0.5">
                SALE
              </Badge>
            )}

            {badgeVariants.new && (
              <Badge variant="new" className="text-xs px-1.5 py-0.5">
                NEW
              </Badge>
            )}

            {totalAvailable <= (badgeVariants.lowStock || 5) && totalAvailable > 0 && (
              <Badge variant="lowStock" className="text-xs px-1.5 py-0.5">
                LOW STOCK
              </Badge>
            )}

            {totalAvailable === 0 && (
              <Badge variant="outOfStock" className="text-xs px-1.5 py-0.5">
                OUT OF STOCK
              </Badge>
            )}

            {stockUpdated && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 animate-pulse">
                UPDATED
              </Badge>
            )}
          </div>
        )}
      </Link>

      <div className="p-4">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2 hover:text-primary-600 transition-colors duration-200">
            {product.name}
          </h3>
        </Link>
        <p className="text-sm text-slate-600 mb-2">{product.brand}</p>
        <div className="flex justify-between items-center mb-3">
          <span className="price text-lg">
            €{product.price.toFixed(2)}
          </span>
          <div className="flex flex-col items-end">
            <span className={`text-sm transition-colors duration-300 ${
              totalAvailable > 0 ? 'text-slate-500' : 'text-red-500'
            } ${stockUpdated ? 'text-primary-600 font-medium' : ''}`}>
              {totalAvailable > 0 ? `${totalAvailable} left` : 'Out of stock'}
            </span>
            {stockUpdated && (
              <span className="text-xs text-primary-600 animate-bounce-in">Just updated</span>
            )}
          </div>
        </div>

        {product.sizes.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-slate-500 mb-2">Size:</p>
            <div className="flex flex-wrap gap-1">
              {product.sizes.slice(0, 6).map((size) => {
                const isAvailable = availableSizes.includes(size)
                const sizeStock = stockData[size]
                const sizeAvailable = sizeStock?.availableQuantity ?? 0

                return (
                  <button
                    key={size}
                    disabled={!isAvailable}
                    onClick={(e) => {
                      e.preventDefault()
                      if (isAvailable) {
                        setSelectedSize(selectedSize === size ? '' : size)
                        setShowSizeError(false)
                      }
                    }}
                    className={`text-xs px-2 py-1 rounded border transition-all duration-200 relative ${
                      selectedSize === size
                        ? 'bg-primary-600 text-white border-primary-600'
                        : isAvailable
                        ? 'bg-slate-100 border-slate-200 hover:bg-slate-200'
                        : 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                    } ${sizeStock?.timestamp && Date.now() - new Date(sizeStock.timestamp).getTime() < 10000 ? 'ring-1 ring-primary-300' : ''}`}
                    title={isAvailable ? `${sizeAvailable} available` : 'Out of stock'}
                  >
                    {size}
                    {sizeAvailable <= 3 && sizeAvailable > 0 && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full"></div>
                    )}
                  </button>
                )
              })}
              {product.sizes.length > 6 && (
                <Link href={`/products/${product.id}`} className="text-xs text-primary-600 hover:text-primary-800">
                  +{product.sizes.length - 6} more
                </Link>
              )}
            </div>
            {showSizeError && (
              <p className="text-xs text-red-600 mt-1">Please select a size</p>
            )}
          </div>
        )}

        <AddToCartButton
          product={{
            id: product.id,
            name: product.name,
            price: product.price,
            sizes: availableSizes, // Use real-time available sizes
            stockCount: totalAvailable, // Use real-time stock count
            brand: product.brand,
            imageUrl: getProductImage()
          }}
          selectedSize={selectedSize}
          onSizeRequired={handleSizeRequired}
        />
      </div>
    </div>
  )
}