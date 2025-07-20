import { Metadata } from "next"
import StoreTemplate from "@modules/store/templates"
import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { HttpTypes } from "@medusajs/types"

export const metadata: Metadata = {
  title: "Store",
  description: "Explore all of our products.",
}

export const dynamic = "force-dynamic" // заставляет Next всегда обновлять страницу при смене query

type Params = {
  params: {
    countryCode: string
  }
  searchParams: {
    sort?: "created_at" | "price_asc" | "price_desc"
  }
}

export default async function StorePage({ params, searchParams }: Params) {
  const countryCode = params.countryCode
  const sortBy = searchParams.sort || "created_at"

  const region = await getRegion(countryCode)

  if (!region) return null

  const { response } = await getProductsListWithSort({
    page: 1,
    queryParams: {
      limit: 100,
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
    />
  )
}
