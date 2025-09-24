'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useProductStockMonitor } from '@/hooks/useRealTimeStock'
import AddToCartButton from '@/components/AddToCartButton'

interface Product {
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

export function SimpleProductGrid() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { stockData, isConnected } = useProductStockMonitor(
    products.map(p => p.id)
  )

  useEffect(() => {
    async function fetchProducts() {
      try {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select(`
            *,
            brands(name, slug),
            product_stock(size, quantity, reserved_quantity),
            product_images(image_url, is_primary)
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(12)

        if (productsError) throw productsError

        const transformedProducts = productsData?.map(product => {
          const stockEntries = product.product_stock || []
          const totalStock = stockEntries.reduce((sum: number, entry: any) =>
            sum + Math.max(0, (entry.quantity || 0) - (entry.reserved_quantity || 0)), 0
          )

          const availableSizes = stockEntries
            .filter((entry: any) => (entry.quantity - (entry.reserved_quantity || 0)) > 0)
            .map((entry: any) => entry.size)
            .sort()

          const images = product.product_images || []
          const primaryImage = images.find((img: any) => img.is_primary)

          let imageUrl = primaryImage?.image_url || images[0]?.image_url

          if (!imageUrl) {
            const imageVariants = [
              'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop&crop=center',
              'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop&crop=center',
              'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop&crop=center',
              'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&h=400&fit=crop&crop=center',
              'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&h=400&fit=crop&crop=center',
            ]

            const productHash = product.id.split('').reduce((a: number, b: string) => {
              a = ((a << 5) - a) + b.charCodeAt(0)
              return a & a
            }, 0)

            const imageIndex = Math.abs(productHash) % imageVariants.length
            imageUrl = imageVariants[imageIndex]
          }

          return {
            id: product.id,
            name: product.name,
            brand: product.brands?.name || 'Unknown',
            price: parseFloat(product.retail_price || product.current_price || '0'),
            imageUrl,
            description: product.description,
            category: 'Sneakers',
            sizes: availableSizes,
            stockCount: totalStock,
            createdAt: product.created_at
          }
        }) || []

        setProducts(transformedProducts)
      } catch (err) {
        console.error('Error fetching products:', err)
        setError(err instanceof Error ? err.message : 'Failed to load products')
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card loading">
            <div className="loading-skeleton h-48 rounded-lg mb-4"></div>
            <div className="loading-skeleton h-4 rounded mb-2"></div>
            <div className="loading-skeleton h-4 rounded w-2/3 mb-2"></div>
            <div className="loading-skeleton h-6 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Error: {error}</p>
        <RetryButton />
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600">No products found</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-black' : 'bg-gray-400'}`}></div>
          <span className="text-sm text-gray-600">
            {isConnected ? 'Live stock updates active' : 'Stock updates offline'}
          </span>
        </div>
      </div>

      <div className="products-grid">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            stockData={stockData[product.id] || {}}
            isConnected={isConnected}
          />
        ))}
      </div>
    </div>
  )
}

function ProductCard({ product, stockData, isConnected }: {
  product: Product
  stockData: Record<string, any>
  isConnected: boolean
}) {
  const [selectedSize, setSelectedSize] = useState<string>('')
  const [showSizeError, setShowSizeError] = useState(false)
  const [stockUpdated, setStockUpdated] = useState(false)

  const getRealTimeStock = () => {
    let totalAvailable = 0
    const availableSizes: string[] = []

    for (const size of product.sizes) {
      const sizeStock = stockData[size]
      const available = sizeStock?.availableQuantity ?? Math.max(0, (product.stockCount || 0) / product.sizes.length)

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

  const cardClassName = `product-card ${stockUpdated ? 'ring-2 ring-black ring-opacity-20' : ''}`

  return (
    <div className={cardClassName}>
      <Link href={`/products/${product.id}`} className="block relative overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="product-image"
        />

        <div className="absolute top-2 right-2 flex flex-col space-y-1">
          {isConnected && (
            <div className="bg-black text-white text-xs px-2 py-1 rounded flex items-center space-x-1">
              <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
              <span>LIVE</span>
            </div>
          )}

          {totalAvailable <= 5 && totalAvailable > 0 && (
            <div className="bg-gray-600 text-white text-xs px-2 py-1 rounded">
              LOW STOCK
            </div>
          )}

          {stockUpdated && (
            <div className="bg-black text-white text-xs px-2 py-1 rounded">
              UPDATED
            </div>
          )}
        </div>
      </Link>

      <div className="product-info">
        <Link href={`/products/${product.id}`}>
          <h3 className="product-title hover:text-gray-700 transition-colors duration-200">
            {product.name}
          </h3>
        </Link>
        <p className="product-brand">{product.brand}</p>
        <div className="flex justify-between items-center mb-3">
          <span className="product-price">€{product.price.toFixed(2)}</span>
          <div className="flex flex-col items-end">
            <span className={`text-sm transition-colors duration-300 ${totalAvailable > 0 ? 'text-gray-500' : 'text-black'} ${stockUpdated ? 'text-black font-medium' : ''}`}>
              {totalAvailable > 0 ? `${totalAvailable} left` : 'Out of stock'}
            </span>
            {stockUpdated && (
              <span className="text-xs text-black">Just updated</span>
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
                    className={`text-xs px-2 py-1 rounded border transition-all duration-200 relative ${selectedSize === size ? 'bg-black text-white border-black' : isAvailable ? 'bg-slate-100 border-slate-200 hover:bg-slate-200' : 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'}`}
                    title={isAvailable ? `${sizeAvailable} available` : 'Out of stock'}
                  >
                    {size}
                    {sizeAvailable <= 3 && sizeAvailable > 0 && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-black rounded-full"></div>
                    )}
                  </button>
                )
              })}
              {product.sizes.length > 6 && (
                <Link href={`/products/${product.id}`} className="text-xs text-black hover:text-gray-700">
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
            sizes: availableSizes,
            stockCount: totalAvailable,
            brand: product.brand,
            imageUrl: product.imageUrl,
            category: product.category,
            createdAt: product.createdAt
          }}
          selectedSize={selectedSize}
          onSizeRequired={handleSizeRequired}
        />
      </div>
    </div>
  )
}

function RetryButton() {
  const handleRetry = () => {
    window.location.reload()
  }

  return (
    <button
      onClick={handleRetry}
      className="btn btn-primary mt-4"
    >
      Retry
    </button>
  )
}