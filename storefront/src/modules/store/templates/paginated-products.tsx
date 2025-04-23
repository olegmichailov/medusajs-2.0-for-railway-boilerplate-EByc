
'use client'

import { useEffect, useState } from "react"
import ProductPreview from "@modules/products/components/product-preview"
import Button from "@modules/common/components/button"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"
import { getProductsList } from "@lib/data/products"
import { ProductPreviewType } from "types/global"
import { useParams } from "next/navigation"

type PaginatedProductsProps = {
  sortBy?: string
  category?: string
  collection?: string
}

const PaginatedProducts = ({
  sortBy,
  category,
  collection,
}: PaginatedProductsProps) => {
  const [products, setProducts] = useState<ProductPreviewType[]>([])
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const countryCode = useParams()?.countryCode as string

  const limit = 12

  const fetchProducts = async () => {
    setIsLoading(true)
    const { response } = await getProductsList({
      countryCode,
      limit,
      offset,
      sortBy,
      category,
      collection,
    })

    if (!response?.products?.length || response.products.length < limit) {
      setHasMore(false)
    }

    setProducts((prev) => [...prev, ...response.products])
    setIsLoading(false)
  }

  useEffect(() => {
    setProducts([])
    setOffset(0)
    setHasMore(true)
  }, [countryCode, sortBy, category, collection])

  useEffect(() => {
    fetchProducts()
  }, [offset, countryCode, sortBy, category, collection])

  return (
    <div className="flex flex-col items-center justify-center">
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8 w-full px-0">
        {products.map((product) => (
          <li key={product.id}>
            <ProductPreview {...product} />
          </li>
        ))}

        {isLoading &&
          Array.from(Array(limit).keys()).map((i) => (
            <li key={i}>
              <SkeletonProductPreview />
            </li>
          ))}
      </ul>
      {hasMore && (
        <div className="mt-8">
          <Button
            onClick={() => setOffset((prev) => prev + limit)}
            className="w-48"
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

export default PaginatedProducts
