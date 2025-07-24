"use client"

import { useEffect, useState } from "react"
import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductPreview from "@modules/products/components/product-preview"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

export default function PaginatedProducts({
  sortBy,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
}: {
  sortBy?: SortOptions
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
}) {
  const [columns, setColumns] = useState(1)
  const [products, setProducts] = useState<any[]>([])
  const [region, setRegion] = useState<any>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mobile = window.innerWidth < 640
      setIsMobile(mobile)
      setColumns(mobile ? 1 : 2)
    }
  }, [])

  const columnOptions = isMobile ? [1, 2] : [1, 2, 3, 4]

  useEffect(() => {
    const fetchAllProducts = async () => {
      try {
        const regionData = await getRegion(countryCode)
        if (!regionData) return
        setRegion(regionData)

        const queryParams: any = {
          limit: 24,
          offset: 0,
        }

        if (collectionId) queryParams.collection_id = [collectionId]
        if (categoryId) queryParams.category_id = [categoryId]
        if (productsIds) queryParams.id = productsIds
        if (sortBy === "created_at") queryParams.order = "created_at"

        const { response } = await getProductsListWithSort({
          page: 1,
          queryParams,
          sortBy,
          countryCode,
        })

        const allProducts = response?.products || []
        setProducts(allProducts)
      } catch (err) {
        console.error("Fetch all products error:", err)
      }
    }

    fetchAllProducts()
  }, [sortBy, collectionId, categoryId, productsIds, countryCode])

  const gridColsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
      ? "grid-cols-2"
      : columns === 3
      ? "grid-cols-3"
      : "grid-cols-4"

  if (!region) return null

  return (
    <>
      <div className="px-0 sm:px-0 pt-4 pb-2 flex items-center justify-between">
        <div className="text-sm sm:text-base font-medium tracking-wide uppercase" />
        <div className="flex gap-1 ml-auto">
          {columnOptions.map((col) => (
            <button
              key={`col-${col}`}
              onClick={() => setColumns(col)}
              className={`w-6 h-6 flex items-center justify-center border text-xs font-medium transition-all duration-200 rounded-none ${
                columns === col
                  ? "bg-black text-white border-black"
                  : "bg-white text-black border-gray-300 hover:border-black"
              }`}
            >
              {col}
            </button>
          ))}
        </div>
      </div>

      <ul
        className={`grid ${gridColsClass} gap-x-4 gap-y-10 px-0 sm:px-0`}
        data-testid="products-list"
      >
        {products.map((p, i) => (
          <li key={`product-${p.id}-${i}`}>
            <ProductPreview product={p} region={region} isFeatured={false} />
          </li>
        ))}
      </ul>
    </>
  )
}
