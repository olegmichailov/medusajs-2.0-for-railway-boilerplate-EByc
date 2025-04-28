"use client"

import React, { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import ProductActionsWrapper from "./product-actions-wrapper"
import { HttpTypes } from "@medusajs/types"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  return (
    <>
      <div
        className="content-container flex flex-col small:flex-row small:items-start py-6 relative"
        data-testid="product-container"
      >
        {/* Левая колонка (Product Info + Tabs) */}
        <div className="hidden small:flex flex-col sticky top-48 py-0 max-w-[300px] w-full gap-y-6">
          <ProductInfo product={product} />
          <ProductTabs product={product} />
        </div>

        {/* Центр (Галерея) */}
        <div className="block w-full relative">
          {/* Заголовок на мобилке */}
          <div className="block small:hidden mb-4">
            <h1 className="text-2xl font-medium">{product.title}</h1>
          </div>

          {/* Галерея изображений */}
          <ImageGallery images={product?.images || []} />

          {/* Описание и табы на мобилке */}
          <div className="block small:hidden mt-6">
            <div className="text-ui-fg-base text-small-regular">
              {product.description && (
                <div className="border-t border-ui-border-base pt-6">
                  <h3 className="text-base font-semibold mb-2">Description</h3>
                  <p>{product.description}</p>
                </div>
              )}
            </div>
            <ProductTabs product={product} />
          </div>
        </div>

        {/* Правая колонка (Кнопка Add to Cart) */}
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-12">
          <ProductOnboardingCta />
          <Suspense
            fallback={<ProductActions disabled={true} product={product} region={region} />}
          >
            <ProductActionsWrapper id={product.id} region={region} />
          </Suspense>
        </div>
      </div>

      {/* Похожие товары */}
      <div
        className="content-container my-16 small:my-32"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate

