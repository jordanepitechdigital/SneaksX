'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, isLoading } = useAuth()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      // Check if user is authenticated and has admin role
      const userRole = user?.user_metadata?.role || 'user'
      if (!user || userRole !== 'admin') {
        router.push('/login?redirect=/admin')
      } else {
        setIsAuthorized(true)
      }
    }
  }, [user, isLoading, router])

  if (isLoading || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900 text-white min-h-screen">
          <div className="p-6">
            <h2 className="text-2xl font-bold mb-8">Admin Panel</h2>
            <nav className="space-y-2">
              <Link
                href="/admin"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/products"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Products
              </Link>
              <Link
                href="/admin/orders"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Orders
              </Link>
              <Link
                href="/admin/users"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Users
              </Link>
              <Link
                href="/admin/inventory"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Inventory
              </Link>
              <Link
                href="/admin/monitors"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Price Monitors
              </Link>
              <Link
                href="/admin/analytics"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Analytics
              </Link>
              <hr className="my-4 border-gray-700" />
              <Link
                href="/"
                className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                ← Back to Store
              </Link>
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}