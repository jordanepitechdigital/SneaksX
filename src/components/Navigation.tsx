'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'

export default function Navigation() {
  const { user, loading, signOut } = useAuth()
  const { cart } = useCart()

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-2xl font-bold text-gray-900">
            SneaksX
          </Link>

          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-600 hover:text-gray-900">
              Home
            </Link>
            <Link href="/products" className="text-gray-600 hover:text-gray-900">
              Products
            </Link>
            <Link href="/brands" className="text-gray-600 hover:text-gray-900">
              Brands
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            {/* Cart Icon */}
            <Link href="/cart" className="relative p-2 text-gray-600 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5-6M7 13v6a2 2 0 002 2h6a2 2 0 002-2v-6M7 13h6m4 0h2a2 2 0 002 2v2a2 2 0 01-2 2H9a2 2 0 01-2-2v-2a2 2 0 012-2z" />
              </svg>
              {cart.totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {cart.totalItems > 99 ? '99+' : cart.totalItems}
                </span>
              )}
            </Link>

            {loading ? (
              <div className="animate-pulse">
                <div className="h-8 w-16 bg-gray-200 rounded"></div>
              </div>
            ) : user ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  Welcome, {user.user_metadata?.full_name || user.email}
                </span>
                <Link
                  href="/profile"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Profile
                </Link>
                <Link
                  href="/orders"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Orders
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  href="/login"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        <div className="md:hidden border-t border-gray-200 pt-4 pb-3">
          <nav className="flex flex-col space-y-2">
            <Link href="/" className="text-gray-600 hover:text-gray-900 px-3 py-2">
              Home
            </Link>
            <Link href="/products" className="text-gray-600 hover:text-gray-900 px-3 py-2">
              Products
            </Link>
            <Link href="/brands" className="text-gray-600 hover:text-gray-900 px-3 py-2">
              Brands
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}