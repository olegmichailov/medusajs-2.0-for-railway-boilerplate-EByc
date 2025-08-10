"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductPreview from "@modules/products/components/product-preview"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const PRODUCT_LIMIT = 150

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
  const [columns, setColumns] = useState(1)
  const [products, setProducts] = useState<any[]>([])
  const [region, setRegion] = useState<any>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const loader = useRef<HTMLDivElement | null>(null)

  // мобильный/десктоп — по умолчанию 1 колонка на мобиле
  useEffect(() => {
    const mobile = typeof window !== "undefined" ? window.innerWidth < 640 : false
    setColumns(mobile ? 1 : 2)
  }, [])

  // загрузка первой страницы
  useEffect(() => {
    const fetchInitial = async () => {
      const regionData = await getRegion(countryCode)
      if (!regionData) return
      setRegion(regionData)
      setOffset(0)

      const queryParams: PaginatedProductsParams = { limit: PRODUCT_LIMIT, offset: 0 }
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
      setInitialLoaded(true)
    }
    fetchInitial()
  }, [sortBy, collectionId, categoryId, productsIds, countryCode])

  // догрузка
  const fetchMore = useCallback(async () => {
    const queryParams: PaginatedProductsParams = { limit: PRODUCT_LIMIT, offset }
    if (collectionId) queryParams["collection_id"] = [collectionId]
    if (categoryId) queryParams["category_id"] = [categoryId]
    if (productsIds) queryParams["id"] = productsIds
    if (sortBy === "created_at") queryParams["order"] = "created_at"

    const {
      response: { products: newProducts },
    } = await getProductsListWithSort({ page: 1, queryParams, sortBy, countryCode })

    if (newProducts.length < PRODUCT_LIMIT) setHasMore(false)

    setProducts((prev) => {
      const ids = new Set(prev.map((p) => p.id))
      return [...prev, ...newProducts.filter((p) => !ids.has(p.id))]
    })
    setOffset((prev) => prev + PRODUCT_LIMIT)
  }, [offset, sortBy, collectionId, categoryId, productsIds, countryCode])

  // наблюдатель
  useEffect(() => {
    if (!region || !initialLoaded || !loader.current) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) fetchMore()
      },
      { threshold: 0.25 }
    )
    obs.observe(loader.current)
    return () => obs.disconnect()
  }, [fetchMore, region, hasMore, initialLoaded])

  // ВАЖНО: боковые поля и межколоночные гаттеры
  // 1 колонка → ощущение “full bleed” (px-6 как на продукте)
  // 2 колонки → уже поля (px-3), но нормальный зазор между карточками (gap-x-3)
  const containerPadding = columns === 1 ? "px-2" : "px-2"
  const gridColsClass =
    columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-4"
  const gapX = columns === 1 ? "gap-x-0" : "gap-x-3"

  // UI
  return (
    <>
      {/* панель переключения колонок — прилипает к правому краю сетки */}
      <div className={`${containerPadding} pt-4 pb-2 flex items-center`}>
        <div className="ml-auto flex gap-1">
          {[1, 2, 3, 4].slice(0, 2).map((col) => ( // на мобиле показываем 1/2
            <button
              key={col}
              onClick={() => setColumns(col)}
              className={`w-6 h-6 flex items-center justify-center border text-xs font-medium transition-all duration-200 rounded-none ${
                columns === col ? "bg-black text-white border-black" : "bg-white text-black border-gray-300 hover:border-black"
              }`}
              aria-pressed={columns === col}
              aria-label={`Set ${col} column${col > 1 ? "s" : ""}`}
            >
              {col}
            </button>
          ))}
        </div>
      </div>

      {/* список товаров */}
      <ul className={`grid ${gridColsClass} ${gapX} gap-y-10 ${containerPadding}`} data-testid="products-list">
        {products.map((p) => (
          <li key={p.id} className="w-full">
            <ProductPreview product={p} region={region} />
          </li>
        ))}
      </ul>

      {hasMore && <div ref={loader} className="h-10 mt-10" />}
    </>
  )
}
