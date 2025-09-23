'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AnalyticsData {
  totalRevenue: number
  totalOrders: number
  totalProducts: number
  totalUsers: number
  revenueGrowth: number
  orderGrowth: number
  userGrowth: number
  topProducts: Array<{
    product_id: string
    product_name: string
    brand_name: string
    total_quantity: number
    total_revenue: number
  }>
  recentOrders: Array<{
    date: string
    order_count: number
    revenue: number
  }>
  topBrands: Array<{
    brand_name: string
    product_count: number
    total_revenue: number
  }>
  usersByRole: Array<{
    role: string
    count: number
  }>
  ordersByStatus: Array<{
    status: string
    count: number
  }>
  syncStats: Array<{
    platform: string
    last_sync: string
    items_synced: number
    status: string
  }>
}

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalUsers: 0,
    revenueGrowth: 0,
    orderGrowth: 0,
    userGrowth: 0,
    topProducts: [],
    recentOrders: [],
    topBrands: [],
    usersByRole: [],
    ordersByStatus: [],
    syncStats: []
  })
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30') // days
  const supabase = createClient()

  useEffect(() => {
    loadAnalytics()
  }, [dateRange])

  const loadAnalytics = async () => {
    try {
      setLoading(true)

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - parseInt(dateRange))

      // Basic stats
      const { count: totalOrders } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })

      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      // Revenue calculation
      const { data: orders } = await supabase
        .from('orders')
        .select('total_amount, created_at')

      const totalRevenue = orders?.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0

      // Top products by revenue
      const { data: topProducts } = await supabase
        .from('order_items')
        .select(`
          product_id,
          product_name,
          product_brand,
          quantity,
          total_price
        `)
        .gte('created_at', startDate.toISOString())

      // Group and sum by product
      const productStats = topProducts?.reduce((acc: any, item) => {
        const key = item.product_id
        if (!acc[key]) {
          acc[key] = {
            product_id: item.product_id,
            product_name: item.product_name,
            brand_name: item.product_brand,
            total_quantity: 0,
            total_revenue: 0
          }
        }
        acc[key].total_quantity += item.quantity
        acc[key].total_revenue += Number(item.total_price || 0)
        return acc
      }, {})

      const topProductsList = Object.values(productStats || {})
        .sort((a: any, b: any) => b.total_revenue - a.total_revenue)
        .slice(0, 5)

      // Recent orders trend (last 7 days)
      const { data: recentOrdersData } = await supabase
        .from('orders')
        .select('created_at, total_amount')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

      // Group by date
      const ordersByDate = recentOrdersData?.reduce((acc: any, order) => {
        const date = new Date(order.created_at).toISOString().split('T')[0]
        if (!acc[date]) {
          acc[date] = { date, order_count: 0, revenue: 0 }
        }
        acc[date].order_count++
        acc[date].revenue += Number(order.total_amount || 0)
        return acc
      }, {})

      const recentOrders = Object.values(ordersByDate || {}).sort((a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      // Top brands
      const { data: brandData } = await supabase
        .from('products')
        .select(`
          brands(name),
          current_price
        `)
        .eq('is_active', true)

      const brandStats = brandData?.reduce((acc: any, product) => {
        const brandName = product.brands?.name || 'Unknown'
        if (!acc[brandName]) {
          acc[brandName] = {
            brand_name: brandName,
            product_count: 0,
            total_revenue: 0
          }
        }
        acc[brandName].product_count++
        return acc
      }, {})

      const topBrands = Object.values(brandStats || {})
        .sort((a: any, b: any) => b.product_count - a.product_count)
        .slice(0, 5)

      // Users by role
      const { data: userData } = await supabase
        .from('users')
        .select('role')

      const usersByRole = userData?.reduce((acc: any, user) => {
        const role = user.role || 'user'
        const existing = acc.find((item: any) => item.role === role)
        if (existing) {
          existing.count++
        } else {
          acc.push({ role, count: 1 })
        }
        return acc
      }, [])

      // Orders by status
      const { data: orderStatusData } = await supabase
        .from('orders')
        .select('status')

      const ordersByStatus = orderStatusData?.reduce((acc: any, order) => {
        const status = order.status || 'pending'
        const existing = acc.find((item: any) => item.status === status)
        if (existing) {
          existing.count++
        } else {
          acc.push({ status, count: 1 })
        }
        return acc
      }, [])

      // Sync stats
      const { data: syncData } = await supabase
        .from('sync_logs')
        .select('platform, completed_at, items_processed, status')
        .order('completed_at', { ascending: false })
        .limit(10)

      const syncStats = syncData?.map(sync => ({
        platform: sync.platform || 'internal',
        last_sync: sync.completed_at || '',
        items_synced: sync.items_processed || 0,
        status: sync.status || 'unknown'
      })) || []

      setAnalytics({
        totalRevenue,
        totalOrders: totalOrders || 0,
        totalProducts: totalProducts || 0,
        totalUsers: totalUsers || 0,
        revenueGrowth: 0, // TODO: Calculate growth
        orderGrowth: 0,
        userGrowth: 0,
        topProducts: topProductsList as any,
        recentOrders: recentOrders as any,
        topBrands: topBrands as any,
        usersByRole: usersByRole || [],
        ordersByStatus: ordersByStatus || [],
        syncStats
      })

    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-300 rounded w-1/3 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white p-6 rounded-lg shadow">
              <div className="h-4 bg-gray-300 rounded w-2/3 mb-2"></div>
              <div className="h-8 bg-gray-300 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Revenue',
      value: `€${analytics.totalRevenue.toFixed(2)}`,
      growth: analytics.revenueGrowth,
      icon: '💰',
      color: 'bg-green-500'
    },
    {
      title: 'Total Orders',
      value: analytics.totalOrders,
      growth: analytics.orderGrowth,
      icon: '🛒',
      color: 'bg-blue-500'
    },
    {
      title: 'Active Products',
      value: analytics.totalProducts,
      icon: '📦',
      color: 'bg-purple-500'
    },
    {
      title: 'Total Users',
      value: analytics.totalUsers,
      growth: analytics.userGrowth,
      icon: '👥',
      color: 'bg-orange-500'
    }
  ]

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.color} text-white p-3 rounded-lg`}>
                <span className="text-2xl">{stat.icon}</span>
              </div>
              {stat.growth !== undefined && (
                <div className={`text-sm font-semibold ${
                  stat.growth >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.growth >= 0 ? '+' : ''}{stat.growth.toFixed(1)}%
                </div>
              )}
            </div>
            <p className="text-gray-600 text-sm">{stat.title}</p>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Top Products */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Top Products</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analytics.topProducts.map((product, index) => (
                <div key={product.product_id} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                      <span className="text-blue-600 font-semibold text-sm">{index + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{product.product_name}</p>
                      <p className="text-xs text-gray-500">{product.brand_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">€{product.total_revenue.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{product.total_quantity} sold</p>
                  </div>
                </div>
              ))}
              {analytics.topProducts.length === 0 && (
                <p className="text-center text-gray-500 py-4">No data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Top Brands */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Top Brands</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analytics.topBrands.map((brand, index) => (
                <div key={brand.brand_name} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                      <span className="text-purple-600 font-semibold text-sm">{index + 1}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{brand.brand_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{brand.product_count} products</p>
                  </div>
                </div>
              ))}
              {analytics.topBrands.length === 0 && (
                <p className="text-center text-gray-500 py-4">No data available</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Users by Role */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Users by Role</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {analytics.usersByRole.map((userRole) => (
                <div key={userRole.role} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 capitalize">{userRole.role}</span>
                  <span className="text-sm text-gray-600">{userRole.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Orders by Status */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Orders by Status</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {analytics.ordersByStatus.map((orderStatus) => (
                <div key={orderStatus.status} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 capitalize">{orderStatus.status}</span>
                  <span className="text-sm text-gray-600">{orderStatus.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sync Status */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Data Sync Status</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {analytics.syncStats.slice(0, 3).map((sync, index) => (
                <div key={index} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900 uppercase">{sync.platform}</p>
                    <p className="text-xs text-gray-500">{sync.items_synced} items</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    sync.status === 'completed' ? 'bg-green-100 text-green-800' :
                    sync.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {sync.status}
                  </span>
                </div>
              ))}
              {analytics.syncStats.length === 0 && (
                <p className="text-center text-gray-500 py-4">No sync data available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}