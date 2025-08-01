"use client"

import { useEffect, useState, Suspense } from "react"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
}) => {
  const [columns, setColumns] = useState(1)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mobile = window.innerWidth < 640
    setIsMobile(mobile)
    setColumns(mobile ? 1 : 2)
  }, [])

  const columnOptions = isMobile ? [1, 2] : [1, 2, 3, 4]
  const sort = sortBy || "created_at"
  const pageNumber = page ? parseInt(page) : 1

  return (
    <div
      className="flex flex-col small:flex-row small:items-start py-6 content-container"
      data-testid="category-container"
    >
      <RefinementList sortBy={sort} />

      <div className="w-full px-6 sm:px-0">
        <h1
          data-testid="store-page-title"
          className="text-4xl font-medium tracking-wider uppercase text-left mb-6"
        >
          All Products
        </h1>

        <div className="px-0 sm:px-0 pt-4 pb-2 flex items-center justify-between">
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

        <Suspense fallback={<SkeletonProductGrid columns={columns} />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
            columns={columns}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default StoreTemplateate
