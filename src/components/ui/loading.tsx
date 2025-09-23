import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ size = 'md', className, ...props }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }

  return (
    <div
      className={cn('animate-spin rounded-full border-2 border-gray-300 border-t-blue-600', sizeClasses[size], className)}
      {...props}
    />
  )
}

interface LoadingDotsProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingDots({ size = 'md', className, ...props }: LoadingDotsProps) {
  const sizeClasses = {
    sm: 'h-1 w-1',
    md: 'h-2 w-2',
    lg: 'h-3 w-3'
  }

  return (
    <div className={cn('flex space-x-1', className)} {...props}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'bg-blue-600 rounded-full animate-pulse',
            sizeClasses[size]
          )}
          style={{
            animationDelay: `${i * 0.15}s`,
            animationDuration: '0.6s'
          }}
        />
      ))}
    </div>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 animate-pulse">
      <Skeleton className="aspect-square rounded-lg mb-4" />
      <Skeleton className="h-4 rounded mb-2" />
      <Skeleton className="h-4 rounded w-2/3 mb-2" />
      <Skeleton className="h-6 rounded w-1/3 mb-3" />
      <div className="flex flex-wrap gap-1 mb-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-8 rounded" />
        ))}
      </div>
      <Skeleton className="h-9 rounded" />
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className="h-4 rounded" />
        </td>
      ))}
    </tr>
  )
}

export function FormSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-4 w-20 rounded mb-2" />
        <Skeleton className="h-10 w-full rounded" />
      </div>
      <div>
        <Skeleton className="h-4 w-24 rounded mb-2" />
        <Skeleton className="h-10 w-full rounded" />
      </div>
      <div>
        <Skeleton className="h-4 w-28 rounded mb-2" />
        <Skeleton className="h-20 w-full rounded" />
      </div>
      <Skeleton className="h-10 w-32 rounded" />
    </div>
  )
}

interface PageLoadingProps {
  title?: string
  description?: string
}

export function PageLoading({ title = "Loading...", description }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <LoadingSpinner size="lg" />
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
    </div>
  )
}