import { supabaseServer } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const KICKS_API_KEY = 'KICKS-97EF-725F-A605-58232DC70EED'
const KICKS_API_BASE = 'https://kicks.dev/api'

interface KicksProduct {
  id: string
  name: string
  images: string[]
  brand?: string
  model?: string
}

export async function POST(request: Request) {
  try {
    const supabase = supabaseServer

    // Check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get all products that need images
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, kicksdb_id, name, model')
      .order('created_at', { ascending: false })

    if (productsError) {
      console.error('Error fetching products:', productsError)
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ message: 'No products found' }, { status: 200 })
    }

    // Check which products already have images
    const { data: existingImages } = await supabase
      .from('product_images')
      .select('product_id')
      .in('product_id', products.map(p => p.id))

    const productsWithImages = new Set(existingImages?.map(img => img.product_id) || [])
    const productsNeedingImages = products.filter(p => !productsWithImages.has(p.id))

    console.log(`Found ${productsNeedingImages.length} products without images`)

    let syncedCount = 0
    let failedCount = 0
    const errors: any[] = []

    // Process products in batches to avoid rate limiting
    const batchSize = 10
    for (let i = 0; i < productsNeedingImages.length; i += batchSize) {
      const batch = productsNeedingImages.slice(i, i + batchSize)

      await Promise.all(batch.map(async (product) => {
        try {
          // If we have a kicksdb_id, use it to fetch from the API
          if (product.kicksdb_id) {
            const response = await fetch(`${KICKS_API_BASE}/products/${product.kicksdb_id}`, {
              headers: {
                'X-API-Key': KICKS_API_KEY,
                'Accept': 'application/json'
              }
            })

            if (response.ok) {
              const kicksProduct = await response.json()

              // Extract images (max 2 as per requirements)
              const images = kicksProduct.images?.slice(0, 2) || []

              if (images.length > 0) {
                // Insert images into database
                const imageRecords = images.map((url: string, index: number) => ({
                  product_id: product.id,
                  image_url: url,
                  alt_text: `${product.name} - Image ${index + 1}`,
                  sort_order: index,
                  is_primary: index === 0
                }))

                const { error: insertError } = await supabase
                  .from('product_images')
                  .insert(imageRecords)

                if (insertError) {
                  console.error(`Failed to insert images for product ${product.id}:`, insertError)
                  errors.push({ product_id: product.id, error: insertError })
                  failedCount++
                } else {
                  syncedCount++
                }
              }
            } else if (response.status === 404) {
              // Product not found in Kicks API, try to generate placeholder images
              await createPlaceholderImages(supabase, product)
              syncedCount++
            }
          } else {
            // No kicksdb_id, create placeholder images
            await createPlaceholderImages(supabase, product)
            syncedCount++
          }
        } catch (error) {
          console.error(`Error syncing images for product ${product.id}:`, error)
          errors.push({ product_id: product.id, error: String(error) })
          failedCount++
        }
      }))

      // Small delay between batches to respect rate limits
      if (i + batchSize < productsNeedingImages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Log sync activity
    await supabase.from('sync_logs').insert({
      sync_type: 'product_images',
      platform: 'internal',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: failedCount === 0 ? 'completed' : 'completed',
      items_processed: productsNeedingImages.length,
      items_created: syncedCount,
      items_failed: failedCount,
      error_details: errors.length > 0 ? { errors } : null
    })

    return NextResponse.json({
      message: 'Image sync completed',
      total_products: products.length,
      products_needing_images: productsNeedingImages.length,
      synced: syncedCount,
      failed: failedCount,
      errors: errors.slice(0, 5) // Return first 5 errors for debugging
    })

  } catch (error) {
    console.error('Image sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync images', details: String(error) },
      { status: 500 }
    )
  }
}

async function createPlaceholderImages(supabase: any, product: any) {
  // Create placeholder images using a service like Unsplash or a placeholder service
  const placeholderUrls = [
    `https://via.placeholder.com/600x400/000000/FFFFFF?text=${encodeURIComponent(product.name || 'Sneaker')}`,
    `https://via.placeholder.com/600x400/333333/FFFFFF?text=${encodeURIComponent(product.model || 'Model')}`
  ]

  const imageRecords = placeholderUrls.map((url, index) => ({
    product_id: product.id,
    image_url: url,
    alt_text: `${product.name} - Placeholder ${index + 1}`,
    sort_order: index,
    is_primary: index === 0
  }))

  await supabase.from('product_images').insert(imageRecords)
}

// GET endpoint to check sync status
export async function GET(request: Request) {
  try {
    const supabase = supabaseServer

    // Get image statistics
    const { data: stats } = await supabase.rpc('get_image_sync_stats', {})

    // Get recent sync logs
    const { data: logs } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('sync_type', 'product_images')
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      stats: stats || {
        total_products: 0,
        products_with_images: 0,
        products_without_images: 0,
        total_images: 0
      },
      recent_syncs: logs || []
    })
  } catch (error) {
    console.error('Error getting sync status:', error)
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}