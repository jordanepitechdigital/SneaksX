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

  // Monitor real-time stock updates for all products
  const { stockData, isConnected } = useProductStockMonitor(
    products.map(p => p.id)
  )

  useEffect(() => {
    async function fetchProducts() {
      try {
        // Fetch products with brand info and stock
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

          // Get primary image or first available image
          const images = product.product_images || []
          const primaryImage = images.find((img: any) => img.is_primary)

          // If no real image, generate a diverse placeholder based on product data
          let imageUrl = primaryImage?.image_url || images[0]?.image_url

          if (!imageUrl) {
            // Create diverse sneaker images based on product characteristics
            const brandName = product.brands?.name?.toLowerCase() || 'sneaker'
            const model = product.model?.toLowerCase() || ''
            const colorway = product.colorway?.toLowerCase() || ''

            // Map different combinations to different Unsplash sneaker images
            const imageVariants = [
              'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop&crop=center', // Classic sneaker
              'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop&crop=center', // White sneaker
              'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop&crop=center', // Red sneaker
              'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&h=400&fit=crop&crop=center', // Black sneaker
              'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&h=400&fit=crop&crop=center', // Blue sneaker
              'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center', // Green sneaker
              'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&h=400&fit=crop&crop=center', // Running shoe
              'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=400&h=400&fit=crop&crop=center', // High-top sneaker
              'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=400&fit=crop&crop=center', // Modern sneaker
              'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=400&h=400&fit=crop&crop=center', // Athletic shoe
            ]

            // Create a simple hash from product ID to ensure consistency
            const productHash = product.id.split('').reduce((a, b) => {
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
        <button
          onClick={() => window.location.reload()}
          className="btn btn-primary mt-4"
        >
          Retry
        </button>
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
      {/* Real-time connection indicator */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full animate-bounce-in ${isConnected ? 'bg-success-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-slate-600">
            {isConnected ? 'Live stock updates active' : 'Stock updates offline'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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

function ProductCard({
  product,
  stockData,
  isConnected
}: {
  product: Product
  stockData: Record<string, any>
  isConnected: boolean
}) {
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

  return (
    <div className={`product-card ${
      stockUpdated ? 'ring-2 ring-primary-500 ring-opacity-50 animate-scale-in' : ''
    }`}>
      <Link href={`/products/${product.id}`} className="block relative overflow-hidden">
        <div className="aspect-square bg-slate-100 p-4">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="product-image w-full h-full object-contain"
            onError={(e) => {
              // Use the same fallback logic as above for consistency
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

        {/* Real-time stock indicator badges */}
        <div className="absolute top-2 right-2 flex flex-col space-y-1">
          {isConnected && (
            <div className="badge badge-success flex items-center space-x-1">
              <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
              <span>LIVE</span>
            </div>
          )}

          {totalAvailable <= 5 && totalAvailable > 0 && (
            <div className="badge badge-warning">
              LOW STOCK
            </div>
          )}

          {stockUpdated && (
            <div className="badge badge-info animate-bounce-in">
              UPDATED
            </div>
          )}
        </div>
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
            imageUrl: product.imageUrl
          }}
          selectedSize={selectedSize}
          onSizeRequired={handleSizeRequired}
        />
      </div>
    </div>
  )
}