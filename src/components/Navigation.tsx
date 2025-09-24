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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-2xl font-bold text-black hover:text-gray-800 transition-colors duration-200">
            SneaksX
          </Link>

          <nav className="hidden md:flex items-center space-x-1">
            <Link href="/" className="nav-link">
              Home
            </Link>
            <Link href="/products" className="nav-link">
              Products
            </Link>
            <Link href="/brands" className="nav-link">
              Brands
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            {/* SneakX cart icon - minimalist shopping bag */}
            <Link
              href="/cart"
              className="relative text-gray-600 hover:text-black transition-colors duration-200"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12l-1 10H7L6 7zM6 7L5 4H3"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V5a2 2 0 0 1 4 0v2"/>
              </svg>
              {cart.totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-black text-white text-xs rounded-full h-4 w-4 flex items-center justify-center min-w-[16px] text-[10px] font-medium">
                  {cart.totalItems > 9 ? '9+' : cart.totalItems}
                </span>
              )}
            </Link>

            {loading ? (
              <div className="loading">
                <div className="h-8 w-16 loading-skeleton"></div>
              </div>
            ) : user ? (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-700 hidden lg:block">
                  Welcome, {user.user_metadata?.full_name || user.email}
                </span>
                <Link
                  href="/profile"
                  className="text-sm text-gray-600 hover:text-black px-3 py-2 rounded-md transition-colors duration-200"
                >
                  Profile
                </Link>
                <Link
                  href="/orders"
                  className="text-sm text-gray-600 hover:text-black px-3 py-2 rounded-md transition-colors duration-200"
                >
                  Orders
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-gray-600 hover:text-black px-2 py-1 rounded-md transition-colors duration-200"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href="/login"
                  className="text-sm text-gray-600 hover:text-black px-3 py-2 rounded-md transition-colors duration-200"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="btn btn-primary text-sm"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        <div className="md:hidden border-t border-gray-200 pt-4 pb-3">
          <nav className="flex flex-col space-y-1">
            <Link href="/" className="nav-link">
              Home
            </Link>
            <Link href="/products" className="nav-link">
              Products
            </Link>
            <Link href="/brands" className="nav-link">
              Brands
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}