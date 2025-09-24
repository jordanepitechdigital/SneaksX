'use client'

export function SearchForm() {
  return (
    <div className="max-w-2xl mx-auto mb-8">
      <form onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.target as HTMLFormElement)
        const query = formData.get('search') as string
        if (query.trim()) {
          window.location.href = `/products?search=${encodeURIComponent(query.trim())}`
        }
      }}>
        <div className="relative">
          <input
            type="text"
            name="search"
            placeholder="Search for sneakers, brands, or styles..."
            className="w-full pl-4 pr-4 py-1 text-sm border-2 border-gray-300 rounded-full focus:ring-2 focus:ring-black focus:border-black transition-all"
            style={{ height: '24px' }}
          />
          <div className="absolute left-4 top-4 text-gray-400" style={{ display: 'none' }}>
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </form>
    </div>
  )
}