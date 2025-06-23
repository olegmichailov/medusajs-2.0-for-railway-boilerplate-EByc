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
}

export default async function StorePage({ params }: Params) {
  const countryCode = params.countryCode

  const region = await getRegion(countryCode)

  if (!region) {
    return null // безопасно: регион обязателен для цен
  }

  const { response } = await getProductsListWithSort({
    page: 1,
    queryParams: {
      limit: 100,
      offset: 0,
    },
    countryCode,
    sortBy: "created_at",
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
