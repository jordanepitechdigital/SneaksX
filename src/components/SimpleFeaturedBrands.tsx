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
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">Featured Brands</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card loading">
              <div className="loading-skeleton h-12 rounded mb-3"></div>
              <div className="loading-skeleton h-4 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">Featured Brands</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {brands.map((brand, index) => (
          <div key={brand.id} className="card card-hover text-center animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
            <div className="h-12 flex items-center justify-center mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-white">
                  {brand.displayName.charAt(0)}
                </span>
              </div>
            </div>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">
              {brand.displayName}
            </h3>
            <p className="text-xs text-slate-500">
              {brand.productCount} product{brand.productCount !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}