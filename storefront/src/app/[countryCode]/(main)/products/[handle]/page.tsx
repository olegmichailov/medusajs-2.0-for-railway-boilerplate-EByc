import { Metadata } from "next"
import { notFound } from "next/navigation"

import ProductTemplate from "@modules/products/templates"
import { getRegion } from "@lib/data/regions"
import { getProductByHandle } from "@lib/data/products"

type Props = {
  params: {
    countryCode: string
    handle: string
  }
}

export const dynamicParams = true
export const revalidate = 60 // ISR: обновляется раз в 60 сек

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const region = await getRegion(params.countryCode).catch(() => null)
  if (!region) notFound()

  const product = await getProductByHandle(params.handle, region.id).catch(() => null)
  if (!product) notFound()

  return {
    title: `${product.title} | Gmorkl Store`,
    description: product.title,
    openGraph: {
      title: `${product.title} | Gmorkl Store`,
      description: product.title,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

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
