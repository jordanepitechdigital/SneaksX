import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

export interface ApiResponse<T> {
  data: T | null
  error: Error | null
  loading?: boolean
}

export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface FilterParams {
  [key: string]: any
}

export abstract class BaseApiService {
  protected tableName: string

  constructor(tableName: string) {
    this.tableName = tableName
  }

  protected async handleApiCall<T>(
    operation: () => Promise<{ data: T | null; error: any }>
  ): Promise<ApiResponse<T>> {
    try {
      const { data, error } = await operation()

      if (error) {
        throw new Error(error.message || 'API call failed')
      }

      return { data, error: null }
    } catch (error) {
      console.error(`API Error in ${this.tableName}:`, error)
      return {
        data: null,
        error: error as Error
      }
    }
  }

  protected buildPaginationQuery(
    query: any,
    params: PaginationParams
  ) {
    const { page = 1, limit = 20, sortBy, sortOrder = 'desc' } = params
    const from = (page - 1) * limit
    const to = from + limit - 1

    let paginatedQuery = query.range(from, to)

    if (sortBy) {
      paginatedQuery = paginatedQuery.order(sortBy, { ascending: sortOrder === 'asc' })
    }

    return paginatedQuery
  }

  protected buildFilterQuery(
    query: any,
    filters: FilterParams
  ) {
    let filteredQuery = query

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          filteredQuery = filteredQuery.in(key, value)
        } else if (typeof value === 'string' && value.includes('%')) {
          filteredQuery = filteredQuery.ilike(key, value)
        } else {
          filteredQuery = filteredQuery.eq(key, value)
        }
      }
    })

    return filteredQuery
  }
}

export default BaseApiService