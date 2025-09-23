'use client'

import { useEffect, useState } from 'react'
import { useRealTimeStock } from '@/hooks/useRealTimeStock'

interface PriceChangeToast {
  id: string
  productId: string
  productName: string
  oldPrice: number
  newPrice: number
  changePercentage: number
  timestamp: string
}

export function PriceChangeNotification() {
  const { priceUpdates, isConnected } = useRealTimeStock()
  const [toasts, setToasts] = useState<PriceChangeToast[]>([])

  useEffect(() => {
    if (priceUpdates.length > 0) {
      const latestUpdate = priceUpdates[0]

      // Fetch product name for the toast
      const fetchProductName = async () => {
        try {
          const { supabase } = await import('@/lib/supabase/client')
          const { data: product } = await supabase
            .from('products')
            .select('name')
            .eq('id', latestUpdate.productId)
            .single()

          if (product) {
            const newToast: PriceChangeToast = {
              id: `${latestUpdate.productId}-${latestUpdate.timestamp}`,
              productId: latestUpdate.productId,
              productName: product.name,
              oldPrice: latestUpdate.oldPrice,
              newPrice: latestUpdate.newPrice,
              changePercentage: latestUpdate.changePercentage,
              timestamp: latestUpdate.timestamp
            }

            setToasts(prev => [newToast, ...prev.slice(0, 4)]) // Keep max 5 toasts

            // Auto-remove toast after 5 seconds
            setTimeout(() => {
              setToasts(prev => prev.filter(toast => toast.id !== newToast.id))
            }, 5000)
          }
        } catch (error) {
          console.error('Error fetching product for price notification:', error)
        }
      }

      fetchProductName()
    }
  }, [priceUpdates])

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  if (!isConnected || toasts.length === 0) {
    return null
  }

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm animate-slide-in-right"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${
                  toast.changePercentage > 0 ? 'bg-red-500' : 'bg-green-500'
                }`}></div>
                <h4 className="text-sm font-medium text-gray-900">Price Update</h4>
              </div>

              <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                {toast.productName}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500 line-through">
                    €{toast.oldPrice.toFixed(2)}
                  </span>
                  <span className={`text-sm font-medium ${
                    toast.changePercentage > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    €{toast.newPrice.toFixed(2)}
                  </span>
                </div>

                <span className={`text-xs px-2 py-1 rounded-full ${
                  toast.changePercentage > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {toast.changePercentage > 0 ? '+' : ''}{toast.changePercentage.toFixed(1)}%
                </span>
              </div>

              <p className="text-xs text-gray-400 mt-2">
                {new Date(toast.timestamp).toLocaleTimeString()}
              </p>
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="ml-2 text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// Add this to your global CSS for the animation
const styles = `
  @keyframes slide-in-right {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .animate-slide-in-right {
    animation: slide-in-right 0.3s ease-out;
  }
`

// Export styles for easy import
export const priceNotificationStyles = styles