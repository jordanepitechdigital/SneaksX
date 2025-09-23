import { supabase } from '@/lib/supabase/client'
import type { DBProduct } from '@/types/database'

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

export class ProductService {
  static async getProducts(limit = 20): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        brands (
          name,
          slug
        ),
        product_stock (
          size,
          quantity,
          reserved_quantity
        ),
        product_images (
          image_url,
          is_primary
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch products: ${error.message}`)
    }

    return (data || []).map(this.transformProduct)
  }

  static async getFeaturedProducts(limit = 8): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        brands (
          name,
          slug
        ),
        product_stock (
          size,
          quantity,
          reserved_quantity
        ),
        product_images (
          image_url,
          is_primary
        )
      `)
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch featured products: ${error.message}`)
    }

    return (data || []).map(this.transformProduct)
  }

  static async getProductsByBrand(brandName: string, limit = 20): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        brands!inner (
          name,
          slug
        ),
        product_stock (
          size,
          quantity,
          reserved_quantity
        ),
        product_images (
          image_url,
          is_primary
        )
      `)
      .eq('brands.name', brandName)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch products by brand: ${error.message}`)
    }

    return (data || []).map(this.transformProduct)
  }

  static async searchProducts(query: string, limit = 20): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        brands (
          name,
          slug
        ),
        product_stock (
          size,
          quantity,
          reserved_quantity
        ),
        product_images (
          image_url,
          is_primary
        )
      `)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to search products: ${error.message}`)
    }

    return (data || []).map(this.transformProduct)
  }

  private static transformProduct(dbProduct: any): Product {
    const stockEntries = dbProduct.product_stock || []
    const totalStock = stockEntries.reduce((sum: number, entry: any) =>
      sum + Math.max(0, (entry.quantity || 0) - (entry.reserved_quantity || 0)), 0
    )

    const availableSizes = stockEntries
      .filter((entry: any) => (entry.quantity - (entry.reserved_quantity || 0)) > 0)
      .map((entry: any) => entry.size)
      .sort()

    // Get primary image or first available image
    const images = dbProduct.product_images || []
    const primaryImage = images.find((img: any) => img.is_primary)
    let imageUrl = primaryImage?.image_url || images[0]?.image_url

    if (!imageUrl) {
      // Create diverse sneaker images based on product characteristics
      const imageVariants = [
        'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=800&fit=crop&crop=center', // Classic sneaker
        'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&h=800&fit=crop&crop=center', // White sneaker
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&h=800&fit=crop&crop=center', // Red sneaker
        'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&h=800&fit=crop&crop=center', // Black sneaker
        'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&h=800&fit=crop&crop=center', // Blue sneaker
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop&crop=center', // Green sneaker
        'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&h=800&fit=crop&crop=center', // Running shoe
        'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=800&h=800&fit=crop&crop=center', // High-top sneaker
        'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=800&fit=crop&crop=center', // Modern sneaker
        'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=800&h=800&fit=crop&crop=center', // Athletic shoe
      ]

      // Create a simple hash from product ID to ensure consistency
      const productHash = dbProduct.id.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0)
        return a & a
      }, 0)

      const imageIndex = Math.abs(productHash) % imageVariants.length
      imageUrl = imageVariants[imageIndex]
    }

    return {
      id: dbProduct.id,
      name: dbProduct.name,
      brand: dbProduct.brands?.name || 'Unknown',
      price: parseFloat(dbProduct.retail_price || dbProduct.current_price || '0'),
      imageUrl,
      description: dbProduct.description,
      category: 'Sneakers', // Could be enhanced with actual category data
      sizes: availableSizes,
      stockCount: totalStock,
      createdAt: dbProduct.created_at
    }
  }
}