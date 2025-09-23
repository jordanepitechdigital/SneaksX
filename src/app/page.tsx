import { SimpleProductGrid } from '@/components/SimpleProductGrid'
import { SimpleFeaturedBrands } from '@/components/SimpleFeaturedBrands'

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Premium Sneakers Collection
        </h1>
        <p className="text-lg text-gray-600">
          Discover the latest and greatest sneakers from top brands
        </p>
      </div>

      <SimpleFeaturedBrands />

      <div className="mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Latest Products
        </h2>
        <SimpleProductGrid />
      </div>
    </div>
  )
}