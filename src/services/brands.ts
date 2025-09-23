import { supabase } from '@/lib/supabase/client'

export interface Brand {
  id: string
  name: string
  displayName: string
  logoUrl?: string
  description?: string
  productCount: number
}

export class BrandService {
  static async getBrands(): Promise<Brand[]> {
    const { data, error } = await supabase
      .from('brands')
      .select(`
        *,
        products (count)
      `)
      .eq('is_active', true)
      .order('name')

    if (error) {
      throw new Error(`Failed to fetch brands: ${error.message}`)
    }

    return (data || []).map(brand => ({
      id: brand.id,
      name: brand.name,
      displayName: brand.name, // Use name as displayName since there's no separate display_name field
      logoUrl: brand.logo_url,
      description: brand.description,
      productCount: brand.products?.[0]?.count || brand.kicksdb_product_count || 0
    }))
  }

  static async getFeaturedBrands(limit = 6): Promise<Brand[]> {
    const { data, error } = await supabase
      .from('brands')
      .select(`
        *,
        products (count)
      `)
      .eq('is_active', true)
      .order('name')
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch featured brands: ${error.message}`)
    }

    return (data || []).map(brand => ({
      id: brand.id,
      name: brand.name,
      displayName: brand.name, // Use name as displayName since there's no separate display_name field
      logoUrl: brand.logo_url,
      description: brand.description,
      productCount: brand.products?.[0]?.count || brand.kicksdb_product_count || 0
    }))
  }
}