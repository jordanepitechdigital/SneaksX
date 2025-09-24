'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import AddToCartButton from '@/components/AddToCartButton'
import type { Product as CartProduct } from '@/services/products'

interface Product {
  id: string
  name: string
  brand: string
  price: number
  imageUrl: string
  description?: string
  category: string
  sizes: Array<{ size: string; quantity: number; available: boolean }>
  stockCount: number
  createdAt: string
  retailPrice: number
  colorway?: string
  releaseDate?: string
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [cartProduct, setCartProduct] = useState<CartProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string>('')
  const [sizeError, setSizeError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProduct() {
      if (!params.id) return

      try {
        const { data: productData, error: productError } = await supabase
          .from('products')
          .select(`
            *,
            brands(name, display_name),
            stock_entries(size, quantity, reserved_quantity)
          `)
          .eq('id', params.id)
          .eq('is_active', true)
          .single()

        if (productError) throw productError
        if (!productData) throw new Error('Product not found')

        const stockEntries = productData.stock_entries || []
        const totalStock = stockEntries.reduce((sum: number, entry: any) =>
          sum + Math.max(0, (entry.quantity || 0) - (entry.reserved_quantity || 0)), 0
        )

        const availableSizes = stockEntries
          .map((entry: any) => ({
            size: entry.size,
            quantity: Math.max(0, (entry.quantity || 0) - (entry.reserved_quantity || 0)),
            available: (entry.quantity - entry.reserved_quantity) > 0
          }))
          .sort((a: any, b: any) => parseFloat(a.size) - parseFloat(b.size))

        const imageUrl = productData.image_urls?.[0] ||
                        'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=800&fit=crop&crop=center'

        const transformedProduct: Product = {
          id: productData.id,
          name: productData.name,
          brand: productData.brands?.display_name || productData.brands?.name || 'Unknown',
          price: productData.retail_price || 0,
          imageUrl,
          description: productData.description,
          category: productData.category || 'Sneakers',
          sizes: availableSizes,
          stockCount: totalStock,
          createdAt: productData.created_at,
          retailPrice: productData.retail_price || 0,
          colorway: productData.colorway,
          releaseDate: productData.release_date
        }

        setProduct(transformedProduct)

        // Create cart-compatible product
        const cartProductData: CartProduct = {
          id: productData.id,
          name: productData.name,
          brand: productData.brands?.display_name || productData.brands?.name || 'Unknown',
          price: productData.retail_price || 0,
          imageUrl,
          description: productData.description,
          category: productData.category || 'Sneakers',
          sizes: availableSizes.filter((s: any) => s.available).map((s: any) => s.size),
          stockCount: totalStock,
          createdAt: productData.created_at
        }
        setCartProduct(cartProductData)
      } catch (err) {
        console.error('Error fetching product:', err)
        setError(err instanceof Error ? err.message : 'Failed to load product')
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [params.id])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-gray-300 aspect-square rounded-lg"></div>
            <div className="space-y-4">
              <div className="bg-gray-300 h-8 rounded"></div>
              <div className="bg-gray-300 h-6 rounded w-2/3"></div>
              <div className="bg-gray-300 h-10 rounded w-1/3"></div>
              <div className="bg-gray-300 h-24 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The product you are looking for does not exist.'}</p>
          <button
            onClick={() => router.back()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => router.back()}
        className="mb-6 text-blue-600 hover:text-blue-800 flex items-center"
      >
        ← Back to Products
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Product Image */}
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-contain"
            onError={(e) => {
              e.currentTarget.src = 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=800&fit=crop&crop=center'
            }}
          />
        </div>

        {/* Product Details */}
        <div className="space-y-6">
          <div>
            <p className="text-lg text-gray-600 mb-2">{product.brand}</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>
            <div className="text-3xl font-bold text-gray-900">
              €{product.price.toFixed(2)}
            </div>
          </div>

          {product.colorway && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Colorway</h3>
              <p className="text-gray-600">{product.colorway}</p>
            </div>
          )}

          {product.description && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600">{product.description}</p>
            </div>
          )}

          {/* Size Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Size</h3>
            <div className="grid grid-cols-4 gap-2">
              {product.sizes.map((sizeOption) => (
                <button
                  key={sizeOption.size}
                  onClick={() => {
                    if (sizeOption.available) {
                      setSelectedSize(sizeOption.size)
                      setSizeError(null)
                    }
                  }}
                  disabled={!sizeOption.available}
                  className={`
                    p-3 border rounded-lg text-center transition-colors
                    ${selectedSize === sizeOption.size
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : sizeOption.available
                      ? 'border-gray-300 hover:border-gray-400'
                      : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    }
                  `}
                >
                  <div className="font-medium">{sizeOption.size}</div>
                  {!sizeOption.available && (
                    <div className="text-xs">Out of Stock</div>
                  )}
                </button>
              ))}
            </div>
            {product.sizes.length === 0 && (
              <p className="text-gray-500 text-sm">No sizes available</p>
            )}
          </div>

          {/* Stock Info */}
          <div className="text-sm text-gray-600">
            {product.stockCount > 0 ? (
              <span className="text-green-600">✓ {product.stockCount} in stock</span>
            ) : (
              <span className="text-red-600">✗ Out of stock</span>
            )}
          </div>

          {/* Add to Cart Button */}
          {cartProduct && (
            <AddToCartButton
              product={cartProduct}
              selectedSize={selectedSize}
              onSizeRequired={() => setSizeError('Please select a size first')}
              className="py-3 px-6 text-base"
            />
          )}

          {sizeError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
              {sizeError}
            </div>
          )}

          {/* Product Info */}
          <div className="border-t pt-6 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Category:</span>
              <span className="font-medium">{product.category}</span>
            </div>
            {product.releaseDate && (
              <div className="flex justify-between">
                <span className="text-gray-600">Release Date:</span>
                <span className="font-medium">
                  {new Date(product.releaseDate).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Product ID:</span>
              <span className="font-medium font-mono text-xs">{product.id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}