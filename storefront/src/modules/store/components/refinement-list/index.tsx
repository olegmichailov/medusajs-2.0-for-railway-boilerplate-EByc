"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { SortOptions } from "./sort-products"
import SortProducts from "./sort-products"
import { getCategoriesList } from "@lib/data/categories"
import { getCollectionsList } from "@lib/data/collections"
import { getProductsList } from "@lib/data/products"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

interface RefinementListProps {
  sortBy: SortOptions
  "data-testid"?: string
}

interface Category {
  id: string
  name: string
  handle: string
  parent_category?: any
}

interface Collection {
  id: string
  title: string
  handle: string
}

interface ProductVariant {
  id: string
  options: { option_id: string; value: string }[]
}

interface Product {
  id: string
  variants: ProductVariant[]
  options: { id: string; title: string }[]
}

const RefinementList = ({ sortBy, "data-testid": dataTestId }: RefinementListProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [categories, setCategories] = useState<Category[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 640
    }
    return false
  })

  useEffect(() => {
    const fetchData = async () => {
      const { product_categories } = await getCategoriesList(0, 100)
      const { collections } = await getCollectionsList(0, 100)
      const { products } = await getProductsList({ limit: 1000 }) // без лимита
      setCategories(product_categories || [])
      setCollections(collections || [])
      setProducts(products || [])
    }
    fetchData()
  }, [])

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      if (value) {
        params.set(name, value)
      } else {
        params.delete(name)
      }
      return params.toString()
    },
    [searchParams]
  )

  const setQueryParams = (name: string, value: string) => {
    const query = createQueryString(name, value)
    router.push(`${pathname}?${query}`)
  }

  const availableSizes = useMemo(() => {
    const sizes = new Set<string>()
    for (const product of products) {
      const sizeOption = product.options.find((o) => o.title.toLowerCase() === "size")
      if (!sizeOption) continue

      const optionId = sizeOption.id

      for (const variant of product.variants) {
        for (const opt of variant.options) {
          if (opt.option_id === optionId) {
            sizes.add(opt.value)
          }
        }
      }
    }

    return Array.from(sizes).sort()
  }, [products])

  const selectedSize = searchParams.get("size")

  return (
    <div className="w-full sm:w-[250px] px-6 sm:px-0 mb-6">
      <div className="flex justify-center sm:justify-start mb-4">
        <button
          onClick={() => setShowFilters((prev) => !prev)}
          className="border border-black px-6 py-2 text-sm uppercase tracking-wide w-full sm:w-[140px] text-center"
        >
          {showFilters ? "Hide Filters" : "Filters"}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-col gap-6">
          {/* Sort */}
          <div className="flex flex-col gap-2">
            <span className="text-sm uppercase text-gray-500">Sort by</span>
            <SortProducts
              sortBy={sortBy}
              setQueryParams={setQueryParams}
              data-testid={dataTestId}
            />
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-2">
            <span className="text-sm uppercase text-gray-500">Category</span>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <LocalizedClientLink
                  href="/store"
                  className="hover:underline text-gray-600"
                >
                  All Products
                </LocalizedClientLink>
              </li>
              {categories
                .filter((c) => !c.parent_category)
                .map((category) => (
                  <li key={category.id}>
                    <LocalizedClientLink
                      href={`/categories/${category.handle}`}
                      className="hover:underline text-gray-600"
                    >
                      {category.name}
                    </LocalizedClientLink>
                  </li>
                ))}
            </ul>
          </div>

          {/* Collections */}
          <div className="flex flex-col gap-2">
            <span className="text-sm uppercase text-gray-500">Collection</span>
            <ul className="flex flex-col gap-2 text-sm">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <LocalizedClientLink
                    href={`/collections/${collection.handle}`}
                    className="hover:underline text-gray-600"
                  >
                    {collection.title}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Sizes */}
          <div className="flex flex-col gap-2">
            <span className="text-sm uppercase text-gray-500">Size</span>
            <ul className="flex flex-col gap-2 text-sm">
              {availableSizes.map((size) => (
                <li key={size}>
                  <button
                    onClick={() => setQueryParams("size", size)}
                    className={`text-gray-600 hover:underline ${
                      selectedSize === size ? "font-semibold underline" : ""
                    }`}
                  >
                    {size}
                  </button>
                </li>
              ))}
              {selectedSize && (
                <li>
                  <button
                    onClick={() => setQueryParams("size", "")}
                    className="text-gray-400 text-xs"
                  >
                    Clear filter
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default RefinementList
