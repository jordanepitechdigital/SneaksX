import { SimpleProductGrid } from '@/components/SimpleProductGrid'

export default function ProductsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          All Products
        </h1>
        <p className="text-lg text-gray-600">
          Browse our complete collection of premium sneakers. Click on any product to view details.
        </p>
      </div>

      <SimpleProductGrid />
    </div>
  )
}