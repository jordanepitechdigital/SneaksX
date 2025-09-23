import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'

// Custom toast functions with consistent styling
export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      icon: <CheckCircle className="h-5 w-5 text-green-600" />,
      style: {
        background: '#f0fdf4',
        color: '#166534',
        border: '1px solid #bbf7d0',
      },
    })
  },

  error: (message: string) => {
    toast.error(message, {
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      style: {
        background: '#fef2f2',
        color: '#dc2626',
        border: '1px solid #fecaca',
      },
    })
  },

  warning: (message: string) => {
    toast(message, {
      icon: <AlertTriangle className="h-5 w-5 text-orange-600" />,
      style: {
        background: '#fffbeb',
        color: '#d97706',
        border: '1px solid #fed7aa',
      },
    })
  },

  info: (message: string) => {
    toast(message, {
      icon: <Info className="h-5 w-5 text-blue-600" />,
      style: {
        background: '#eff6ff',
        color: '#2563eb',
        border: '1px solid #bfdbfe',
      },
    })
  },

  // E-commerce specific toasts
  addedToCart: (productName: string) => {
    toast.success(`${productName} added to cart`, {
      icon: '🛒',
      style: {
        background: '#f0fdf4',
        color: '#166534',
        border: '1px solid #bbf7d0',
      },
    })
  },

  stockUpdate: (message: string) => {
    toast(message, {
      icon: '📦',
      style: {
        background: '#fffbeb',
        color: '#d97706',
        border: '1px solid #fed7aa',
      },
    })
  },

  priceChange: (message: string) => {
    toast(message, {
      icon: '💰',
      style: {
        background: '#eff6ff',
        color: '#2563eb',
        border: '1px solid #bfdbfe',
      },
    })
  },
}

// Toast provider component with customized settings
export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      gutter={8}
      containerClassName=""
      containerStyle={{}}
      toastOptions={{
        // Global toast options
        duration: 4000,
        style: {
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          padding: '12px 16px',
          maxWidth: '400px',
        },
        // Individual toast type options
        success: {
          duration: 3000,
        },
        error: {
          duration: 5000,
        },
      }}
    />
  )
}