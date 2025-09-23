'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSyncImages = async () => {
    setSyncing(true)
    setError(null)
    setSyncResult(null)

    try {
      const response = await fetch('/api/kicks/sync-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed')
      }

      setSyncResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Back to Admin
        </button>
      </div>

      <h1 className="text-3xl font-bold mb-8">Data Sync Management</h1>

      {/* Image Sync Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Product Image Sync</h2>
        <p className="text-gray-600 mb-4">
          Sync product images from the Kicks API. This will fetch up to 2 images per product.
        </p>

        <button
          onClick={handleSyncImages}
          disabled={syncing}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            syncing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-black text-white hover:bg-gray-800'
          }`}
        >
          {syncing ? 'Syncing Images...' : 'Start Image Sync'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {syncResult && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">Sync Complete!</h3>
            <div className="text-sm text-green-700 space-y-1">
              <p>Total products: {syncResult.total_products}</p>
              <p>Products needing images: {syncResult.products_needing_images}</p>
              <p>Successfully synced: {syncResult.synced}</p>
              {syncResult.failed > 0 && (
                <p className="text-red-600">Failed: {syncResult.failed}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Additional Sync Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Product Data Sync</h3>
          <p className="text-gray-600 text-sm mb-4">
            Update product information, prices, and availability
          </p>
          <button
            disabled
            className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Inventory Sync</h3>
          <p className="text-gray-600 text-sm mb-4">
            Synchronize stock levels and size availability
          </p>
          <button
            disabled
            className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Price Monitor</h3>
          <p className="text-gray-600 text-sm mb-4">
            Track price changes and market trends
          </p>
          <button
            disabled
            className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Cleanup Old Data</h3>
          <p className="text-gray-600 text-sm mb-4">
            Remove expired reservations and old logs
          </p>
          <button
            disabled
            className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>
      </div>
    </div>
  )
}