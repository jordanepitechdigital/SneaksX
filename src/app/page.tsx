import { SimpleProductGrid } from '@/components/SimpleProductGrid'
import { SimpleFeaturedBrands } from '@/components/SimpleFeaturedBrands'

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-12 text-center animate-fade-in">
        <h1 className="text-5xl font-bold text-gradient mb-6 animate-slide-in-up">
          Premium Sneakers Collection
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          Discover the latest and greatest sneakers from top brands with real-time inventory updates
        </p>
      </div>

      <div className="animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
        <SimpleFeaturedBrands />
      </div>

      <div className="mt-16 animate-slide-in-up" style={{ animationDelay: '0.4s' }}>
        <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">
          Latest Products
        </h2>
        <SimpleProductGrid />
      </div>
    </div>
  )
}