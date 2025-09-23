'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface MonitorEvent {
  id: string
  product_id: string
  event_type: 'price_change' | 'stock_change' | 'new_product' | 'product_update'
  old_value: any
  new_value: any
  change_amount: number
  platform: 'stockx' | 'goat' | 'internal'
  triggered_by: string
  notification_sent: boolean
  created_at: string
  products?: {
    name: string
    brands: { name: string }
  }
}

interface Product {
  id: string
  name: string
  is_monitored: boolean
  monitor_price_threshold: number
  monitor_stock_threshold: number
  brands: { name: string }
  current_price: number
}

export default function AdminMonitorsPage() {
  const [monitorEvents, setMonitorEvents] = useState<MonitorEvent[]>([])
  const [monitoredProducts, setMonitoredProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'events' | 'products'>('events')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showConfigModal, setShowConfigModal] = useState(false)
  // Using imported supabase client

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // Load recent monitor events
      const { data: events, error: eventsError } = await supabase
        .from('monitor_events')
        .select(`
          *,
          products(name, brands(name))
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (eventsError) throw eventsError

      // Load monitored products
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          is_monitored,
          monitor_price_threshold,
          monitor_stock_threshold,
          current_price,
          brands(name)
        `)
        .eq('is_monitored', true)

      if (productsError) throw productsError

      setMonitorEvents(events || [])
      setMonitoredProducts(products || [])
    } catch (error) {
      console.error('Error loading monitor data:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateProductMonitoring = async (productId: string, updates: {
    is_monitored?: boolean
    monitor_price_threshold?: number
    monitor_stock_threshold?: number
  }) => {
    try {
      const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId)

      if (error) throw error

      await loadData()
      setShowConfigModal(false)
      setSelectedProduct(null)
    } catch (error) {
      console.error('Error updating product monitoring:', error)
      alert('Failed to update monitoring settings')
    }
  }

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'price_change': return 'bg-blue-100 text-blue-800'
      case 'stock_change': return 'bg-green-100 text-green-800'
      case 'new_product': return 'bg-purple-100 text-purple-800'
      case 'product_update': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'stockx': return 'bg-green-100 text-green-800'
      case 'goat': return 'bg-blue-100 text-blue-800'
      case 'internal': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-300 rounded w-1/3 mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white p-4 rounded-lg shadow">
              <div className="h-4 bg-gray-300 rounded w-2/3 mb-2"></div>
              <div className="h-4 bg-gray-300 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Price & Stock Monitors</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('events')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'events'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Recent Events
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'products'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Monitored Products
          </button>
        </div>
      </div>

      {activeTab === 'events' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Monitor Events</h2>
            <p className="text-sm text-gray-600 mt-1">
              Price changes, stock updates, and product modifications
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Event Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notification
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {monitorEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {event.products?.name || 'Unknown Product'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {event.products?.brands?.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getEventTypeColor(event.event_type)}`}>
                        {event.event_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {event.event_type === 'price_change' && event.change_amount && (
                        <span className={`font-medium ${event.change_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {event.change_amount > 0 ? '+' : ''}€{Number(event.change_amount).toFixed(2)}
                        </span>
                      )}
                      {event.event_type === 'stock_change' && (
                        <span className="text-gray-600">
                          Stock updated
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getPlatformColor(event.platform)}`}>
                        {event.platform?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        event.notification_sent ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {event.notification_sent ? 'Sent' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(event.created_at).toLocaleDateString()} {new Date(event.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {monitorEvents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No monitor events found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Monitored Products</h2>
            <p className="text-sm text-gray-600 mt-1">
              Products with active price and stock monitoring
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price Threshold
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock Threshold
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {monitoredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {product.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {product.brands?.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      €{Number(product.current_price || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.monitor_price_threshold ? `€${Number(product.monitor_price_threshold).toFixed(2)}` : 'Not set'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.monitor_stock_threshold || 0} units
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedProduct(product)
                          setShowConfigModal(true)
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Configure
                      </button>
                      <button
                        onClick={() => updateProductMonitoring(product.id, { is_monitored: false })}
                        className="text-red-600 hover:text-red-900"
                      >
                        Stop Monitoring
                      </button>
                    </td>
                  </tr>
                ))}
                {monitoredProducts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No monitored products found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monitor Configuration Modal */}
      {showConfigModal && selectedProduct && (
        <MonitorConfigModal
          product={selectedProduct}
          onClose={() => {
            setShowConfigModal(false)
            setSelectedProduct(null)
          }}
          onUpdate={updateProductMonitoring}
        />
      )}
    </div>
  )
}

function MonitorConfigModal({
  product,
  onClose,
  onUpdate
}: {
  product: Product
  onClose: () => void
  onUpdate: (productId: string, updates: any) => void
}) {
  const [formData, setFormData] = useState({
    monitor_price_threshold: product.monitor_price_threshold || 0,
    monitor_stock_threshold: product.monitor_stock_threshold || 0
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onUpdate(product.id, {
      monitor_price_threshold: formData.monitor_price_threshold,
      monitor_stock_threshold: formData.monitor_stock_threshold
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Configure Monitoring: {product.name}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price Threshold (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.monitor_price_threshold}
                onChange={(e) => setFormData(prev => ({...prev, monitor_price_threshold: Number(e.target.value)}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter price threshold"
              />
              <p className="text-xs text-gray-500 mt-1">
                Alert when price changes by this amount
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock Threshold (units)
              </label>
              <input
                type="number"
                min="0"
                value={formData.monitor_stock_threshold}
                onChange={(e) => setFormData(prev => ({...prev, monitor_stock_threshold: Number(e.target.value)}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter stock threshold"
              />
              <p className="text-xs text-gray-500 mt-1">
                Alert when stock falls below this level
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Save Configuration
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}