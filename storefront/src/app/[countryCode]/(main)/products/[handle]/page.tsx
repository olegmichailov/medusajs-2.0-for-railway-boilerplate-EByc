import { Metadata } from "next"
import { notFound } from "next/navigation"

import ProductTemplate from "@modules/products/templates"
import { getRegion, listRegions } from "@lib/data/regions"
import { getProductByHandle, getProductsList } from "@lib/data/products"

type Props = {
  params: {
    countryCode: string
    handle: string
  }
}

// ⏱️ Генерация статических маршрутов (SSG + ISR fallback)
export async function generateStaticParams() {
  const regions = await listRegions().catch(() => [])

  const countryCodes = regions
    ?.flatMap((r) => r.countries?.map((c) => c.iso_2))
    .filter(Boolean) as string[]

  if (!countryCodes.length) return []

  const productRequests = await Promise.allSettled(
    countryCodes.map((countryCode) =>
      getProductsList({ countryCode, limit: 100 }) // ограничим до 100 продуктов на регион
    )
  )

  const allProducts = productRequests.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value.response.products
    }
    return []
  })

  const staticParams = countryCodes.flatMap((countryCode) =>
    allProducts.map((product) => ({
      countryCode,
      handle: product.handle,
    }))
  )

  return staticParams
}

// 🧠 Метаданные для SEO / OpenGraph
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const region = await getRegion(params.countryCode).catch(() => null)
  if (!region) notFound()

  const product = await getProductByHandle(params.handle, region.id).catch(() => null)
  if (!product) notFound()

  return {
    title: `${product.title} | Medusa Store`,
    description: product.title,
    openGraph: {
      title: `${product.title} | Medusa Store`,
      description: product.title,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

// 🖼️ Рендер страницы продукта
export default async function ProductPage({ params }: Props) {
  const region = await getRegion(params.countryCode).catch(() => null)
  if (!region) notFound()

  const product = await getProductByHandle(params.handle, region.id).catch(() => null)
  if (!product) notFound()

  return (
    <ProductTemplate
      product={product}
      region={region}
      countryCode={params.countryCode}
    />
  )
}
