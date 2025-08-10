import { Suspense } from "react"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import { HttpTypes } from "@medusajs/types"

export default function CollectionTemplate({
  sortBy,
  collection,
  page,
  countryCode,
}: {
  sortBy?: SortOptions
  collection: HttpTypes.StoreCollection
  page?: string
  countryCode: string
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    {/* Мобайл: убираем внутренние отступы контейнера, чтобы сетка шла edge-to-edge */}
    <div className="content-container px-0 small:px-6 flex flex-col small:flex-row small:items-start py-6">
      <RefinementList sortBy={sort} />

      {/* Правая колонка со списком — без доп. паддингов на мобайле */}
      <div className="w-full">
        <div className="mb-8 text-2xl-semi px-4 small:px-0">
          <h1>{collection.title}</h1>
        </div>

        {/* Скелетоны/ленивая загрузка остаются как были */}
        <Suspense fallback={<SkeletonProductGrid />}>
          {/* Ничего в логике не трогаем — только контейнеры */}
          <div className="px-0 small:px-0">
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              collectionId={collection.id}
              countryCode={countryCode}
            />
          </div>
        </Suspense>
      </div>
    </div>
  )
}
