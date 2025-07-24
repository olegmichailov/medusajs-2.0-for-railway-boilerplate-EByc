import { Metadata } from "next"
import StoreTemplate from "@modules/store/templates"
import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { HttpTypes } from "@medusajs/types"

export const metadata: Metadata = {
  title: "Store",
  description: "Explore all of our products.",
}

type Params = {
  params: {
    countryCode: string
  }
  searchParams: {
    sortBy?: "created_at" | "price_asc" | "price_desc"
  }
}

export default async function StorePage({ params, searchParams }: Params) {
  const countryCode = params.countryCode
  const sortBy = searchParams.sortBy || "created_at"

  const region = await getRegion(countryCode)
  if (!region) return null

  const { response } = await getProductsListWithSort({
    page: 1,
    queryParams: {
      limit: 24, // ✅ оптимально для скорости
      offset: 0,
    },
    countryCode,
    sortBy,
  })

  const products = response.products as HttpTypes.StoreProduct[]

  return (
    <StoreTemplate
      products={products}
      region={region}
      countryCode={countryCode}
      sortBy={sortBy}
    />
  )
}
