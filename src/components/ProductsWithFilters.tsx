'use client'

import { useEffect, useState, useMemo } from 'react'
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

interface Filters {
  search: string
  brands: string[]
  minPrice: number
  maxPrice: number
  sizes: string[]
  inStock: boolean
  sortBy: 'newest' | 'price-low' | 'price-high' | 'name'
}

const initialFilters: Filters = {
  search: '',
  brands: [],
  minPrice: 0,
  maxPrice: 1000,
  sizes: [],
  inStock: false,
  sortBy: 'newest'
}

export function ProductsWithFilters() {
  const [products, setProducts] = useState<Product[]>([])
  const [allBrands, setAllBrands] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [showFilters, setShowFilters] = useState(false)

  const { stockData, isConnected } = useProductStockMonitor(
    products.map(p => p.id)
  )

  // Available sizes (common sneaker sizes)
  const availableSizes = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13']

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch products with proper joins
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select(`
            *,
            brands(name, slug),
            product_stock(size, quantity, reserved_quantity),
            product_images(image_url, is_primary),
            categories(name)
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(100)

        if (productsError) throw productsError

        // Fetch unique brands
        const { data: brandsData, error: brandsError } = await supabase
          .from('brands')
          .select('name')
          .eq('is_active', true)
          .order('name')

        if (brandsError) throw brandsError

        const transformedProducts = productsData?.map(product => {
          const stockEntries = product.product_stock || []
          const totalStock = stockEntries.reduce((sum: number, entry: any) =>
            sum + (entry.quantity - (entry.reserved_quantity || 0)), 0
          )

          const availableSizes = stockEntries
            .filter((entry: any) => (entry.quantity - (entry.reserved_quantity || 0)) > 0)
            .map((entry: any) => entry.size)

          const primaryImage = product.product_images?.find((img: any) => img.is_primary)
          const imageUrl = primaryImage?.image_url || product.product_images?.[0]?.image_url || '/placeholder-product.jpg'

          return {
            id: product.id,
            name: product.name,
            brand: Array.isArray(product.brands) ? product.brands[0]?.name : product.brands?.name || 'Unknown',
            price: product.current_price || product.retail_price || 0,
            imageUrl,
            description: product.description,
            category: Array.isArray(product.categories) ? product.categories[0]?.name : product.categories?.name || 'Sneakers',
            sizes: availableSizes,
            stockCount: totalStock,
            createdAt: product.created_at
          }
        }) || []

        setProducts(transformedProducts)
        setAllBrands(brandsData?.map(b => b.name) || [])
      } catch (error) {
        console.error('Error fetching products:', error)
        setError('Failed to load products')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(product => {
      // Search filter
      if (filters.search && !product.name.toLowerCase().includes(filters.search.toLowerCase()) &&
          !product.brand.toLowerCase().includes(filters.search.toLowerCase())) {
        return false
      }

      // Brand filter
      if (filters.brands.length > 0 && !filters.brands.includes(product.brand)) {
        return false
      }

      // Price filter
      if (product.price < filters.minPrice || product.price > filters.maxPrice) {
        return false
      }

      // Size filter
      if (filters.sizes.length > 0 && !filters.sizes.some(size => product.sizes.includes(size))) {
        return false
      }

      // In stock filter
      if (filters.inStock && product.stockCount <= 0) {
        return false
      }

      return true
    })

    // Sort products
    switch (filters.sortBy) {
      case 'price-low':
        filtered.sort((a, b) => a.price - b.price)
        break
      case 'price-high':
        filtered.sort((a, b) => b.price - a.price)
        break
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'newest':
      default:
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
    }

    return filtered
  }, [products, filters])

  const updateFilter = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters(initialFilters)
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 aspect-square rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search products by name or brand..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          />
          <div className="absolute left-3 top-3.5 text-gray-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Filter Toggle */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z" />
            </svg>
            <span>Filters</span>
          </button>

          <select
            value={filters.sortBy}
            onChange={(e) => updateFilter('sortBy', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          >
            <option value="newest">Newest First</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>

        <div className="text-sm text-gray-600">
          Showing {filteredProducts.length} of {products.length} products
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Brand Filter */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Brands</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {allBrands.map(brand => (
                  <label key={brand} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.brands.includes(brand)}
                      onChange={(e) => {
                        const newBrands = e.target.checked
                          ? [...filters.brands, brand]
                          : filters.brands.filter(b => b !== brand)
                        updateFilter('brands', newBrands)
                      }}
                      className="rounded border-gray-300 text-black focus:ring-black"
                    />
                    <span className="ml-2 text-sm text-gray-700">{brand}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Size Filter */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Sizes</h3>
              <div className="grid grid-cols-3 gap-2">
                {availableSizes.map(size => (
                  <label key={size} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.sizes.includes(size)}
                      onChange={(e) => {
                        const newSizes = e.target.checked
                          ? [...filters.sizes, size]
                          : filters.sizes.filter(s => s !== size)
                        updateFilter('sizes', newSizes)
                      }}
                      className="rounded border-gray-300 text-black focus:ring-black"
                    />
                    <span className="ml-1 text-sm text-gray-700">{size}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price Filter */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Price Range</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Min Price</label>
                  <input
                    type="number"
                    value={filters.minPrice}
                    onChange={(e) => updateFilter('minPrice', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-black focus:border-transparent"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Max Price</label>
                  <input
                    type="number"
                    value={filters.maxPrice}
                    onChange={(e) => updateFilter('maxPrice', parseInt(e.target.value) || 1000)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-black focus:border-transparent"
                    min="0"
                  />
                </div>
              </div>
            </div>

            {/* Other Filters */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Availability</h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  onChange={(e) => updateFilter('inStock', e.target.checked)}
                  className="rounded border-gray-300 text-black focus:ring-black"
                />
                <span className="ml-2 text-sm text-gray-700">In Stock Only</span>
              </label>

              <button
                onClick={clearFilters}
                className="mt-4 text-sm text-black hover:text-gray-700 underline"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">No products found matching your criteria.</p>
          <button
            onClick={clearFilters}
            className="mt-4 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(product => (
            <div key={product.id} className="product-card bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <Link href={`/products/${product.id}`}>
                <div className="aspect-square bg-gray-100">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>
              </Link>

              <div className="p-4">
                <Link href={`/products/${product.id}`}>
                  <h3 className="font-semibold text-gray-900 mb-1 hover:text-black line-clamp-2">
                    {product.name}
                  </h3>
                </Link>

                <p className="text-sm text-gray-600 mb-2">{product.brand}</p>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-gray-900">
                    ${product.price.toFixed(2)}
                  </span>

                  {product.stockCount <= 0 ? (
                    <span className="text-sm text-red-600 font-medium">Out of Stock</span>
                  ) : product.stockCount <= 5 ? (
                    <span className="text-sm text-orange-600 font-medium">Low Stock</span>
                  ) : (
                    <span className="text-sm text-green-600 font-medium">In Stock</span>
                  )}
                </div>

                <AddToCartButton
                  product={{
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    sizes: product.sizes,
                    stockCount: product.stockCount,
                    brand: product.brand,
                    imageUrl: product.imageUrl,
                    category: product.category,
                    createdAt: product.createdAt
                  }}
                  selectedSize=""
                  onSizeRequired={() => {
                    // TODO: Show size selection modal or redirect to product detail page
                    window.location.href = `/products/${product.id}`
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}