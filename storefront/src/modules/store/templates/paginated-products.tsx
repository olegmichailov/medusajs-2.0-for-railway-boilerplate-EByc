"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import ProductPreview from "@modules/products/components/product-preview"
import type { ProductPreviewType } from "types/global"
import { Button } from "@components/ui/button"

type PaginatedProductsProps = {
  page?: number
  totalPages: number
  products: ProductPreviewType[]
  title?: string
}

const PaginatedProducts = ({
  page = 1,
  totalPages,
  products,
  title,
}: PaginatedProductsProps) => {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const [currentPage, setCurrentPage] = useState(page)

  const handleNext = () => {
    const nextPage = currentPage + 1
    updatePage(nextPage)
  }

  const handlePrev = () => {
    const prevPage = currentPage - 1
    updatePage(prevPage)
  }

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", newPage.toString())
    router.push(`${pathname}?${params.toString()}`)
    setCurrentPage(newPage)
  }

  useEffect(() => {
    const pageParam = searchParams.get("page")
    if (pageParam) {
      setCurrentPage(parseInt(pageParam))
    }
  }, [searchParams])

  return (
    <div className="flex flex-col gap-y-8">
      {title && (
        <h1 className="text-2xl uppercase font-semibold tracking-wide">
          {title}
        </h1>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8 px-0">
        {products.map((product) => (
          <li key={product.id}>
            <ProductPreview {...product} />
          </li>
        ))}
      </ul>

      <div className="flex justify-center gap-x-4 pt-4">
        <button
          onClick={handlePrev}
          disabled={currentPage <= 1}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span className="px-2 py-2">{`Page ${currentPage} of ${totalPages}`}</span>
        <button
          onClick={handleNext}
          disabled={currentPage >= totalPages}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default PaginatedProducts
