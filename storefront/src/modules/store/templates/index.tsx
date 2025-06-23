"use client"

import { Suspense } from "react"
import { notFound } from "next/navigation"

import InteractiveLink from "@modules/common/components/interactive-link"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { HttpTypes } from "@medusajs/types"

export default function StoreTemplate({
  products,
  region,
  countryCode,
  sortBy,
  page,
}: {
  products?: HttpTypes.StoreProduct[]
  region: HttpTypes.StoreRegion
  countryCode: string
  sortBy?: SortOptions
  page?: string
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  if (!region || !countryCode) notFound()

  return (
    <div
      className="flex flex-col small:flex-row small:items-start py-6 content-container"
      data-testid="store-container"
    >
      <RefinementList sortBy={sort} data-testid="sort-by-container" />
      <div className="w-full">
        <div className="flex flex-row mb-8 text-2xl-semi gap-4">
          <h1 data-testid="store-page-title">All Products</h1>
        </div>
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
          />
        </Suspense>
      </div>
    </div>
  )
}
