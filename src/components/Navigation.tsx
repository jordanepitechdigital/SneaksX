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
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center" style={{ height: 'var(--nav-height)' }}>
          <Link href="/" className="text-2xl font-bold text-gradient hover:scale-105 transition-transform duration-200">
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

          <div className="flex items-center space-x-3">
            {/* Cart Icon */}
            <Link href="/cart" className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-200 focus-visible">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5-6M7 13v6a2 2 0 002 2h6a2 2 0 002-2v-6M7 13h6m4 0h2a2 2 0 002 2v2a2 2 0 01-2 2H9a2 2 0 01-2-2v-2a2 2 0 012-2z" />
              </svg>
              {cart.totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-bounce-in">
                  {cart.totalItems > 99 ? '99+' : cart.totalItems}
                </span>
              )}
            </Link>

            {loading ? (
              <div className="loading">
                <div className="h-8 w-16 loading-skeleton"></div>
              </div>
            ) : user ? (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-slate-700 hidden lg:block">
                  Welcome, {user.user_metadata?.full_name || user.email}
                </span>
                <Link
                  href="/profile"
                  className="nav-link text-sm"
                >
                  Profile
                </Link>
                <Link
                  href="/orders"
                  className="nav-link text-sm"
                >
                  Orders
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-slate-600 hover:text-slate-800 px-2 py-1 rounded-md transition-colors duration-200"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href="/login"
                  className="nav-link text-sm"
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
        <div className="md:hidden border-t border-slate-200 pt-4 pb-3">
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