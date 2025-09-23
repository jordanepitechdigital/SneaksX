'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Brand {
  id: string
  name: string
  displayName: string
  logoUrl?: string
  description?: string
  productCount: number
}

export function SimpleFeaturedBrands() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBrands() {
      try {
        // Fetch brands with product count
        const { data: brandsData, error: brandsError } = await supabase
          .from('brands')
          .select(`
            *,
            products(count)
          `)
          .eq('is_active', true)
          .order('name')
          .limit(6)

        if (brandsError) throw brandsError

        const transformedBrands = brandsData?.map(brand => ({
          id: brand.id,
          name: brand.name,
          displayName: brand.name, // Use name as displayName since there's no separate display_name field
          logoUrl: brand.logo_url,
          description: brand.description,
          productCount: brand.products?.[0]?.count || brand.kicksdb_product_count || 0
        })) || []

        setBrands(transformedBrands)
      } catch (err) {
        console.error('Error fetching brands:', err)
        setError(err instanceof Error ? err.message : 'Failed to load brands')
      } finally {
        setLoading(false)
      }
    }

    fetchBrands()
  }, [])

  if (loading) {
    return (
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Featured Brands</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg p-6 shadow-sm animate-pulse">
              <div className="bg-gray-300 h-12 rounded mb-3"></div>
              <div className="bg-gray-300 h-4 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Featured Brands</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {brands.map((brand) => (
          <div key={brand.id} className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow text-center">
            <div className="h-12 flex items-center justify-center mb-3">
              <span className="text-lg font-bold text-gray-700">
                {brand.displayName.charAt(0)}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm mb-1">
              {brand.displayName}
            </h3>
            <p className="text-xs text-gray-500">
              {brand.productCount} product{brand.productCount !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}