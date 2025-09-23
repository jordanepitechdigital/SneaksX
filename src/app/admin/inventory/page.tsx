'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface InventoryItem {
  id: string
  product_id: string
  size: string
  quantity: number
  reserved_quantity: number
  available_quantity: number
  size_price: number | null
  external_available: boolean
  external_lowest_ask: number | null
  external_highest_bid: number | null
  external_last_sale: number | null
  external_last_updated: string | null
  created_at: string
  updated_at: string
  product: {
    name: string
    model: string
    colorway: string
    brands: {
      name: string
    }
  }
}

export default function AdminInventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [stockFilter, setStockFilter] = useState<string>('all')
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  useEffect(() => {
    fetchInventory()
  }, [])

  async function fetchInventory() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('product_stock')
        .select(`
          *,
          products (
            name,
            model,
            colorway,
            brands (name)
          )
        `)
        .order('updated_at', { ascending: false })

      if (error) throw error

      const transformedData = data?.map(item => ({
        ...item,
        product: item.products
      })) || []

      setInventory(transformedData)
    } catch (err) {
      console.error('Error fetching inventory:', err)
      setError(err instanceof Error ? err.message : 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  async function updateStock(stockId: string, updates: { quantity: number; reserved_quantity?: number }) {
    try {
      const available_quantity = updates.quantity - (updates.reserved_quantity || 0)

      const { error } = await supabase
        .from('product_stock')
        .update({
          ...updates,
          available_quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', stockId)

      if (error) throw error

      await fetchInventory()
      setIsEditModalOpen(false)
      setSelectedItem(null)
    } catch (err) {
      console.error('Error updating stock:', err)
      alert('Failed to update stock')
    }
  }

  const filteredInventory = inventory.filter(item => {
    const productName = `${item.product?.brands?.name || ''} ${item.product?.name || ''}`.toLowerCase()
    const matchesSearch = productName.includes(searchTerm.toLowerCase()) ||
      item.size.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesStock = true
    if (stockFilter === 'low') {
      matchesStock = item.available_quantity <= 5
    } else if (stockFilter === 'out') {
      matchesStock = item.available_quantity <= 0
    } else if (stockFilter === 'available') {
      matchesStock = item.available_quantity > 0
    }

    return matchesSearch && matchesStock
  })

  const getStockStatus = (available: number) => {
    if (available <= 0) return { text: 'Out of Stock', color: 'bg-red-100 text-red-800' }
    if (available <= 5) return { text: 'Low Stock', color: 'bg-yellow-100 text-yellow-800' }
    return { text: 'In Stock', color: 'bg-green-100 text-green-800' }
  }

  const getTotalValue = () => {
    return inventory.reduce((total, item) => {
      const price = item.size_price || 0
      return total + (price * item.available_quantity)
    }, 0)
  }

  const getLowStockCount = () => {
    return inventory.filter(item => item.available_quantity <= 5 && item.available_quantity > 0).length
  }

  const getOutOfStockCount = () => {
    return inventory.filter(item => item.available_quantity <= 0).length
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded mb-4"></div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-300 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">Error: {error}</p>
          <button
            onClick={fetchInventory}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Total Items</div>
          <div className="text-2xl font-bold text-gray-900">{inventory.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Low Stock Items</div>
          <div className="text-2xl font-bold text-yellow-600">{getLowStockCount()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Out of Stock</div>
          <div className="text-2xl font-bold text-red-600">{getOutOfStockCount()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Total Value</div>
          <div className="text-2xl font-bold text-green-600">€{getTotalValue().toFixed(2)}</div>
        </div>
      </div>

      {/* Main Inventory Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Inventory Management</h1>

          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by product name or size..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Stock Levels</option>
                <option value="available">In Stock</option>
                <option value="low">Low Stock (≤5)</option>
                <option value="out">Out of Stock</option>
              </select>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredInventory.length} of {inventory.length} items
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredInventory.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              {inventory.length === 0 ? 'No inventory items found' : 'No items match your search criteria'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reserved
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Available
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInventory.map((item) => {
                  const stockStatus = getStockStatus(item.available_quantity)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {item.product?.brands?.name} {item.product?.name}
                          </div>
                          {item.product?.model && (
                            <div className="text-sm text-gray-500">
                              {item.product.model}
                              {item.product?.colorway && ` - ${item.product.colorway}`}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.size}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.reserved_quantity || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.available_quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${stockStatus.color}`}>
                          {stockStatus.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.size_price ? `€${parseFloat(item.size_price.toString()).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => {
                            setSelectedItem(item)
                            setIsEditModalOpen(true)
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit Stock
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit Stock Modal */}
      {isEditModalOpen && selectedItem && (
        <EditStockModal
          item={selectedItem}
          onClose={() => {
            setIsEditModalOpen(false)
            setSelectedItem(null)
          }}
          onUpdate={updateStock}
        />
      )}
    </div>
  )
}

function EditStockModal({
  item,
  onClose,
  onUpdate
}: {
  item: InventoryItem
  onClose: () => void
  onUpdate: (stockId: string, updates: { quantity: number; reserved_quantity?: number }) => void
}) {
  const [quantity, setQuantity] = useState(item.quantity)
  const [reservedQuantity, setReservedQuantity] = useState(item.reserved_quantity || 0)

  const availableQuantity = quantity - reservedQuantity

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (quantity < reservedQuantity) {
      alert('Total quantity cannot be less than reserved quantity')
      return
    }
    onUpdate(item.id, { quantity, reserved_quantity: reservedQuantity })
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Edit Stock: {item.product?.brands?.name} {item.product?.name} - Size {item.size}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Quantity
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reserved Quantity
              </label>
              <input
                type="number"
                value={reservedQuantity}
                onChange={(e) => setReservedQuantity(parseInt(e.target.value) || 0)}
                min="0"
                max={quantity}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-md">
              <div className="text-sm font-medium text-gray-700">
                Available Quantity: <span className="text-blue-600">{availableQuantity}</span>
              </div>
              {availableQuantity < 0 && (
                <div className="text-sm text-red-600 mt-1">
                  Warning: Available quantity cannot be negative
                </div>
              )}
            </div>

            <div className="bg-blue-50 p-3 rounded-md">
              <div className="text-sm text-gray-600">
                <strong>Current Status:</strong>
              </div>
              <div className="text-sm text-gray-600">
                Total: {item.quantity} | Reserved: {item.reserved_quantity || 0} | Available: {item.available_quantity}
              </div>
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
                disabled={availableQuantity < 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Update Stock
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}