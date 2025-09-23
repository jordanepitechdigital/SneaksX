import { z } from 'zod'

// Validation schemas
const ProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  brand: z.string().min(1).max(100),
  model: z.string().optional(),
  colorway: z.string().optional(),
  releaseDate: z.string().optional(),
  retailPrice: z.number().positive().optional(),
  currentPrice: z.number().positive().optional(),
  images: z.array(z.string().url()).max(10),
  description: z.string().optional(),
  sku: z.string().optional(),
  gender: z.enum(['men', 'women', 'unisex', 'kids']).optional(),
  category: z.string().optional(),
  sizes: z.array(z.object({
    size: z.string(),
    available: z.boolean(),
    price: z.number().positive().optional(),
    lowestAsk: z.number().positive().optional(),
    highestBid: z.number().positive().optional()
  })).optional()
})

const BrandSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional(),
  logo: z.string().url().optional(),
  productCount: z.number().int().min(0).optional()
})

interface TransformationRule {
  field: string
  transformer: (value: any) => any
  validator?: (value: any) => boolean
}

interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  data?: any
}

interface DeduplicationResult {
  isDuplicate: boolean
  existingId?: string
  similarity?: number
  conflictingFields?: string[]
}

interface TransformationMetrics {
  processed: number
  validated: number
  transformed: number
  deduplicated: number
  errors: number
  warnings: number
  startTime: number
  endTime?: number
}

export class DataTransformer {
  private static transformationRules: Map<string, TransformationRule[]> = new Map()
  private static metrics: TransformationMetrics = {
    processed: 0,
    validated: 0,
    transformed: 0,
    deduplicated: 0,
    errors: 0,
    warnings: 0,
    startTime: Date.now()
  }

  static initializeRules() {
    // Product transformation rules
    this.transformationRules.set('product', [
      {
        field: 'name',
        transformer: (value: string) => this.normalizeText(value),
        validator: (value: string) => value.length > 0 && value.length <= 255
      },
      {
        field: 'brand',
        transformer: (value: string) => this.normalizeBrandName(value),
        validator: (value: string) => value.length > 0 && value.length <= 100
      },
      {
        field: 'model',
        transformer: (value: string) => this.normalizeText(value),
        validator: (value: string) => !value || value.length <= 100
      },
      {
        field: 'colorway',
        transformer: (value: string) => this.normalizeColorway(value),
        validator: (value: string) => !value || value.length <= 100
      },
      {
        field: 'price',
        transformer: (value: any) => this.normalizePrice(value),
        validator: (value: number) => value > 0
      },
      {
        field: 'releaseDate',
        transformer: (value: any) => this.normalizeDate(value),
        validator: (value: string) => !value || this.isValidDate(value)
      },
      {
        field: 'gender',
        transformer: (value: string) => this.normalizeGender(value),
        validator: (value: string) => !value || ['men', 'women', 'unisex', 'kids'].includes(value)
      },
      {
        field: 'images',
        transformer: (value: any[]) => this.normalizeImages(value),
        validator: (value: string[]) => Array.isArray(value) && value.every(url => this.isValidUrl(url))
      },
      {
        field: 'sizes',
        transformer: (value: any[]) => this.normalizeSizes(value),
        validator: (value: any[]) => !value || Array.isArray(value)
      }
    ])

    // Brand transformation rules
    this.transformationRules.set('brand', [
      {
        field: 'name',
        transformer: (value: string) => this.normalizeBrandName(value),
        validator: (value: string) => value.length > 0 && value.length <= 100
      },
      {
        field: 'slug',
        transformer: (value: string) => this.generateSlug(value),
        validator: (value: string) => /^[a-z0-9-]+$/.test(value)
      }
    ])
  }

  static validateProduct(data: any): ValidationResult {
    this.metrics.processed++

    try {
      const result = ProductSchema.safeParse(data)

      if (result.success) {
        this.metrics.validated++
        return {
          isValid: true,
          errors: [],
          warnings: [],
          data: result.data
        }
      }

      this.metrics.errors++
      return {
        isValid: false,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        warnings: []
      }
    } catch (error) {
      this.metrics.errors++
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      }
    }
  }

  static validateBrand(data: any): ValidationResult {
    this.metrics.processed++

    try {
      const result = BrandSchema.safeParse(data)

      if (result.success) {
        this.metrics.validated++
        return {
          isValid: true,
          errors: [],
          warnings: [],
          data: result.data
        }
      }

      this.metrics.errors++
      return {
        isValid: false,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        warnings: []
      }
    } catch (error) {
      this.metrics.errors++
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      }
    }
  }

  static transformProduct(data: any): ValidationResult {
    this.metrics.processed++

    try {
      const transformed = { ...data }
      const errors: string[] = []
      const warnings: string[] = []

      const rules = this.transformationRules.get('product') || []

      for (const rule of rules) {
        if (data[rule.field] !== undefined) {
          try {
            const transformedValue = rule.transformer(data[rule.field])

            if (rule.validator && !rule.validator(transformedValue)) {
              errors.push(`Invalid value for ${rule.field} after transformation`)
              continue
            }

            transformed[rule.field] = transformedValue
          } catch (error) {
            errors.push(`Failed to transform ${rule.field}: ${error}`)
          }
        }
      }

      // Additional transformations
      if (transformed.name && transformed.brand) {
        transformed.slug = this.generateProductSlug(transformed.name, transformed.brand, transformed.model)
      }

      // Generate meta fields for SEO
      if (transformed.name && transformed.brand) {
        transformed.metaTitle = this.generateMetaTitle(transformed.name, transformed.brand)
        transformed.metaDescription = this.generateMetaDescription(transformed)
      }

      // Normalize tags
      if (transformed.tags) {
        transformed.tags = this.normalizeTags(transformed.tags)
      }

      if (errors.length > 0) {
        this.metrics.errors++
        return {
          isValid: false,
          errors,
          warnings,
          data: transformed
        }
      }

      this.metrics.transformed++
      return {
        isValid: true,
        errors: [],
        warnings,
        data: transformed
      }
    } catch (error) {
      this.metrics.errors++
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      }
    }
  }

  static async checkDuplicateProduct(data: any, existingProducts: any[]): Promise<DeduplicationResult> {
    if (!existingProducts.length) {
      return { isDuplicate: false }
    }

    // Check for exact matches
    const exactMatch = existingProducts.find(p =>
      p.kicksdb_id === data.id ||
      p.sku === data.sku ||
      (p.name === data.name && p.brand_name === data.brand)
    )

    if (exactMatch) {
      this.metrics.deduplicated++
      return {
        isDuplicate: true,
        existingId: exactMatch.id,
        similarity: 1.0,
        conflictingFields: ['exact_match']
      }
    }

    // Check for similar matches using fuzzy comparison
    for (const existing of existingProducts) {
      const similarity = this.calculateSimilarity(data, existing)

      if (similarity > 0.85) { // 85% similarity threshold
        const conflictingFields = this.getConflictingFields(data, existing)

        this.metrics.deduplicated++
        return {
          isDuplicate: true,
          existingId: existing.id,
          similarity,
          conflictingFields
        }
      }
    }

    return { isDuplicate: false }
  }

  // Normalization methods
  private static normalizeText(value: string): string {
    if (!value) return ''

    return value
      .trim()
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/[^\w\s-']/g, '') // Remove special characters except hyphens and apostrophes
  }

  private static normalizeBrandName(value: string): string {
    if (!value) return ''

    const normalized = this.normalizeText(value)

    // Brand name mappings for consistency
    const brandMappings: Record<string, string> = {
      'nike': 'Nike',
      'adidas': 'Adidas',
      'jordan': 'Jordan',
      'new balance': 'New Balance',
      'converse': 'Converse',
      'vans': 'Vans',
      'puma': 'Puma',
      'reebok': 'Reebok',
      'asics': 'ASICS',
      'under armour': 'Under Armour'
    }

    const lowered = normalized.toLowerCase()
    return brandMappings[lowered] || normalized
  }

  private static normalizeColorway(value: string): string {
    if (!value) return ''

    return value
      .trim()
      .split(/[\/\-]/)
      .map(color => color.trim())
      .filter(color => color.length > 0)
      .join('/')
  }

  private static normalizePrice(value: any): number | undefined {
    if (value === null || value === undefined || value === '') return undefined

    const num = typeof value === 'string' ? parseFloat(value.replace(/[^\d.]/g, '')) : Number(value)

    return isNaN(num) || num <= 0 ? undefined : Math.round(num * 100) / 100
  }

  private static normalizeDate(value: any): string | undefined {
    if (!value) return undefined

    try {
      const date = new Date(value)
      return isNaN(date.getTime()) ? undefined : date.toISOString().split('T')[0]
    } catch {
      return undefined
    }
  }

  private static normalizeGender(value: string): string | undefined {
    if (!value) return undefined

    const normalized = value.toLowerCase().trim()

    const genderMappings: Record<string, string> = {
      'm': 'men',
      'male': 'men',
      'mens': 'men',
      "men's": 'men',
      'f': 'women',
      'female': 'women',
      'womens': 'women',
      "women's": 'women',
      'u': 'unisex',
      'uni': 'unisex',
      'k': 'kids',
      'kid': 'kids',
      'child': 'kids',
      'children': 'kids'
    }

    return genderMappings[normalized] || normalized
  }

  private static normalizeImages(value: any[]): string[] {
    if (!Array.isArray(value)) return []

    return value
      .filter(url => typeof url === 'string' && this.isValidUrl(url))
      .slice(0, 10) // Limit to 10 images
      .map(url => url.trim())
  }

  private static normalizeSizes(value: any[]): any[] {
    if (!Array.isArray(value)) return []

    return value
      .filter(size => size && typeof size === 'object')
      .map(size => ({
        size: String(size.size || '').trim(),
        available: Boolean(size.available),
        price: this.normalizePrice(size.price),
        lowestAsk: this.normalizePrice(size.lowestAsk),
        highestBid: this.normalizePrice(size.highestBid)
      }))
      .filter(size => size.size.length > 0)
  }

  private static normalizeTags(value: any): string[] {
    if (!Array.isArray(value)) return []

    return value
      .filter(tag => typeof tag === 'string')
      .map(tag => tag.toLowerCase().trim())
      .filter(tag => tag.length > 0)
      .slice(0, 20) // Limit to 20 tags
  }

  // Utility methods
  private static generateSlug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  private static generateProductSlug(name: string, brand: string, model?: string): string {
    const parts = [brand, name]
    if (model && model !== name) {
      parts.push(model)
    }

    return this.generateSlug(parts.join(' '))
  }

  private static generateMetaTitle(name: string, brand: string): string {
    return `${brand} ${name} - Buy Authentic Sneakers | SneaksX`
  }

  private static generateMetaDescription(product: any): string {
    const parts = []

    if (product.brand && product.name) {
      parts.push(`Shop ${product.brand} ${product.name}`)
    }

    if (product.colorway) {
      parts.push(`in ${product.colorway}`)
    }

    if (product.retailPrice) {
      parts.push(`Retail: $${product.retailPrice}`)
    }

    parts.push('Authentic sneakers with fast shipping.')

    return parts.join(' ').slice(0, 160)
  }

  private static isValidUrl(value: string): boolean {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  private static isValidDate(value: string): boolean {
    const date = new Date(value)
    return !isNaN(date.getTime())
  }

  private static calculateSimilarity(data1: any, data2: any): number {
    let matches = 0
    let total = 0

    // Compare key fields
    const fieldsToCompare = ['name', 'brand', 'model', 'sku', 'colorway']

    for (const field of fieldsToCompare) {
      if (data1[field] && data2[field]) {
        total++

        const similarity = this.stringSimilarity(
          String(data1[field]).toLowerCase(),
          String(data2[field]).toLowerCase()
        )

        matches += similarity
      }
    }

    return total > 0 ? matches / total : 0
  }

  private static stringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1

    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1

    const distance = this.levenshteinDistance(longer, shorter)
    return (longer.length - distance) / longer.length
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }

  private static getConflictingFields(data1: any, data2: any): string[] {
    const conflicts: string[] = []
    const fieldsToCheck = ['name', 'brand', 'model', 'sku', 'colorway', 'retailPrice']

    for (const field of fieldsToCheck) {
      if (data1[field] && data2[field] && data1[field] !== data2[field]) {
        conflicts.push(field)
      }
    }

    return conflicts
  }

  static getMetrics(): TransformationMetrics {
    return {
      ...this.metrics,
      endTime: Date.now()
    }
  }

  static resetMetrics(): void {
    this.metrics = {
      processed: 0,
      validated: 0,
      transformed: 0,
      deduplicated: 0,
      errors: 0,
      warnings: 0,
      startTime: Date.now()
    }
  }

  static async enrichProduct(product: any): Promise<any> {
    const enriched = { ...product }

    // Add computed fields
    if (product.sizes && Array.isArray(product.sizes)) {
      enriched.availableSizes = product.sizes.filter((s: any) => s.available).map((s: any) => s.size)
      enriched.priceRange = this.calculatePriceRange(product.sizes)
    }

    // Add category inference if missing
    if (!enriched.category && enriched.name && enriched.brand) {
      enriched.category = this.inferCategory(enriched.name, enriched.brand)
    }

    // Add search keywords
    enriched.searchKeywords = this.generateSearchKeywords(enriched)

    return enriched
  }

  private static calculatePriceRange(sizes: any[]): { min?: number; max?: number } {
    const prices = sizes
      .map(s => s.price || s.lowestAsk || s.highestBid)
      .filter(p => p && p > 0)

    if (prices.length === 0) return {}

    return {
      min: Math.min(...prices),
      max: Math.max(...prices)
    }
  }

  private static inferCategory(name: string, brand: string): string {
    const nameAndBrand = `${name} ${brand}`.toLowerCase()

    if (nameAndBrand.includes('basketball') || nameAndBrand.includes('jordan')) {
      return 'Basketball'
    }
    if (nameAndBrand.includes('running') || nameAndBrand.includes('run')) {
      return 'Running'
    }
    if (nameAndBrand.includes('lifestyle') || nameAndBrand.includes('casual')) {
      return 'Lifestyle'
    }
    if (nameAndBrand.includes('training') || nameAndBrand.includes('gym')) {
      return 'Training'
    }

    return 'Sneakers'
  }

  private static generateSearchKeywords(product: any): string[] {
    const keywords = new Set<string>()

    // Add basic fields
    if (product.brand) keywords.add(product.brand.toLowerCase())
    if (product.name) {
      product.name.toLowerCase().split(' ').forEach((word: string) => {
        if (word.length > 2) keywords.add(word)
      })
    }
    if (product.model) keywords.add(product.model.toLowerCase())
    if (product.colorway) {
      product.colorway.toLowerCase().split('/').forEach((color: string) => {
        keywords.add(color.trim())
      })
    }
    if (product.category) keywords.add(product.category.toLowerCase())
    if (product.gender) keywords.add(product.gender.toLowerCase())

    return Array.from(keywords).slice(0, 50) // Limit keywords
  }
}

// Initialize transformation rules
DataTransformer.initializeRules()