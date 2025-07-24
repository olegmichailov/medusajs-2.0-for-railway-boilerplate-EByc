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
  index = 0,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
  index?: number
}) {
  const { cheapestPrice } = getProductPrice({
    product,
    region,
  })

  return (
    <LocalizedClientLink
      href={`/products/${product?.handle || ""}`}
      className="group pointer-events-auto"
    >
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
          priority={index < 2} // загружаем первые картинки с приоритетом
        />
        <div className="flex txt-compact-medium mt-2 justify-between px-1">
          <Text
            className="text-ui-fg-subtle text-sm sm:text-base"
            data-testid="product-title"
          >
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
