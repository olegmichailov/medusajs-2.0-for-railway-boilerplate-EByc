"use client"

import { useLayoutEffect, useState, useRef, useCallback, useEffect } from "react"
import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductPreview from "@modules/products/components/product-preview"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const PRODUCT_LIMIT = 12

const columnOptionsMobile = [1, 2]
const columnOptionsDesktop = [1, 2, 3, 4]

type PaginatedProductsParams = {
  limit: number
  offset?: number
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
}

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
  const [columns, setColumns] = useState<number>(1)
  const [products, setProducts] = useState<any[]>([])
  const [region, setRegion] = useState<any>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const loader = useRef(null)

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640
  const columnOptions = isMobile ? columnOptionsMobile : columnOptionsDesktop

  useLayoutEffect(() => {
    if (isMobile) {
      setColumns(1)
    } else {
      setColumns(2)
    }
  }, [])

  useEffect(() => {
    const fetchInitial = async () => {
      const regionData = await getRegion(countryCode)
      if (!regionData) return
      setRegion(regionData)
      setOffset(0)
      setProducts([])
      setHasMore(true)

      const queryParams: PaginatedProductsParams = {
        limit: PRODUCT_LIMIT,
        offset: 0,
      }

      if (collectionId) queryParams["collection_id"] = [collectionId]
      if (categoryId) queryParams["category_id"] = [categoryId]
      if (productsIds) queryParams["id"] = productsIds
      if (sortBy === "created_at") queryParams["order"] = "created_at"

      const {
        response: { products: newProducts },
      } = await getProductsListWithSort({ page: 1, queryParams, sortBy, countryCode })

      setProducts(newProducts)
      setOffset(PRODUCT_LIMIT)
      setHasMore(newProducts.length >= PRODUCT_LIMIT)
    }
    fetchInitial()
  }, [sortBy, collectionId, categoryId, productsIds, countryCode])

  const fetchMore = useCallback(async () => {
    const queryParams: PaginatedProductsParams = {
      limit: PRODUCT_LIMIT,
      offset,
    }

    if (collectionId) queryParams["collection_id"] = [collectionId]
    if (categoryId) queryParams["category_id"] = [categoryId]
    if (productsIds) queryParams["id"] = productsIds
    if (sortBy === "created_at") queryParams["order"] = "created_at"

    const {
      response: { products: newProducts },
    } = await getProductsListWithSort({ page: 1, queryParams, sortBy, countryCode })

    if (newProducts.length < PRODUCT_LIMIT) setHasMore(false)
    setProducts((prev) => [...prev, ...newProducts])
    setOffset((prev) => prev + PRODUCT_LIMIT)
  }, [offset, sortBy, collectionId, categoryId, productsIds, countryCode])

  useEffect(() => {
    if (!region || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMore()
      },
      { threshold: 1.0 }
    )
    if (loader.current) observer.observe(loader.current)
    return () => {
      if (loader.current) observer.unobserve(loader.current)
    }
  }, [fetchMore, region, hasMore])

  const gridColsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
      ? "grid-cols-2"
      : columns === 3
      ? "grid-cols-3"
      : "grid-cols-4"

  return (
    <>
      <div className="px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between">
        <div className="text-sm sm:text-base font-medium tracking-wide uppercase"></div>
        <div className="flex gap-1 ml-auto">
          {columnOptions.map((col) => (
            <button
              key={col}
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
        className={`grid ${gridColsClass} gap-x-4 gap-y-10 px-4 sm:px-0`}
        data-testid="products-list"
      >
        {products.map((p, i) => (
          <li key={p.id}>
            <ProductPreview product={p} region={region} index={i} />
          </li>
        ))}
      </ul>

      {hasMore && <div ref={loader} className="h-10 mt-10" />}
    </>
  )
}
