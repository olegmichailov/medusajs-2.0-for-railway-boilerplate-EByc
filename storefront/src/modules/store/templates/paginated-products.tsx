"use client"

import { useEffect, useState } from "react"
import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductPreview from "@modules/products/components/product-preview"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

type PaginatedProductsParams = {
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
  limit?: number
  offset?: number
}

export default function PaginatedProducts({
  sortBy,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
  columns,
}: {
  sortBy?: SortOptions
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
  columns: number
}) {
  const [products, setProducts] = useState<any[]>([])
  const [region, setRegion] = useState<any>(null)

  useEffect(() => {
    const fetchAll = async () => {
      const regionData = await getRegion(countryCode)
      if (!regionData) return
      setRegion(regionData)

      const queryParams: PaginatedProductsParams = {}

      if (collectionId) queryParams["collection_id"] = [collectionId]
      if (categoryId) queryParams["category_id"] = [categoryId]
      if (productsIds) queryParams["id"] = productsIds
      if (sortBy === "created_at") queryParams["order"] = "created_at"

      queryParams["limit"] = 1000
      queryParams["offset"] = 0

      const {
        response: { products: newProducts },
      } = await getProductsListWithSort({
        page: 1,
        queryParams,
        sortBy,
        countryCode,
      })

      setProducts(newProducts)
    }

    fetchAll()
  }, [sortBy, collectionId, categoryId, productsIds, countryCode])

  const gridColsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
      ? "grid-cols-2"
      : columns === 3
      ? "grid-cols-3"
      : "grid-cols-4"

  return (
    <ul
      className={`grid ${gridColsClass} gap-x-4 gap-y-10 px-0 sm:px-0`}
      data-testid="products-list"
    >
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductPreview
            product={p}
            region={region}
            index={i}
            preload={i < columns * 2}
          />
        </li>
      ))}
    </ul>
  )
}
