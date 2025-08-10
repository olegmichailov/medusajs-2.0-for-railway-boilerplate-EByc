"use client"

import { Text } from "@medusajs/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import { HttpTypes } from "@medusajs/types"

export default function ProductPreview({
  product,
  isFeatured,
  region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({
    product,
    region,
  })

  return (
    // Мобайл: делаем ссылку блочным элементом на всю ширину
    <LocalizedClientLink href={`/products/${product.handle}`} className="group block w-full">
      <div data-testid="product-wrapper" className="w-full">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
        />

        {/* Мобайл: убираем боковые паддинги, чтобы текст шёл вровень с изображением */}
        <div className="flex txt-compact-medium mt-2 justify-between px-0 small:px-1">
          <Text className="text-ui-fg-subtle text-sm sm:text-base" data-testid="product-title">
            {product.title}
          </Text>
          <div className="flex items-center gap-x-1 text-sm sm:text-base">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
