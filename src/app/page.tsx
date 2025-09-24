import Link from 'next/link'
import { SimpleProductGrid } from '@/components/SimpleProductGrid'
import { SimpleFeaturedBrands } from '@/components/SimpleFeaturedBrands'
import { SearchForm } from '@/components/SearchForm'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section - PRD Compliant */}
      <section className="py-20 px-6 text-center bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-black mb-6 animate-fade-in">
            Premium Sneakers Collection
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
            Discover the latest and greatest sneakers from top brands with real-time inventory updates
          </p>

          {/* Search Bar */}
          <SearchForm />

          <Link
            href="/products"
            className="inline-block bg-black text-white px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Browse All Products
          </Link>
        </div>
      </section>

      {/* Featured Brands Section */}
      <section className="brands bg-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <SimpleFeaturedBrands />
        </div>
      </section>

      {/* Products Section */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-black mb-12 text-center">
            Latest Products
          </h2>
          <SimpleProductGrid />
        </div>
      </section>
    </div>
  )
}