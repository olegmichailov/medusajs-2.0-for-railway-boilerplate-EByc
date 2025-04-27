// storefront/src/modules/products/templates/index.tsx

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

const LazyProductInfo = ({ product }: { product: HttpTypes.StoreProduct }) => (
  <Suspense fallback={<div className="h-10">Loading product info...</div>}>
    <ProductInfo product={product} />
  </Suspense>
)

const LazyProductTabs = ({ product }: { product: HttpTypes.StoreProduct }) => (
  <Suspense fallback={<div className="h-10">Loading tabs...</div>}>
    <ProductTabs product={product} />
  </Suspense>
)

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
        {/* Левая колонка десктоп */}
        <div className="hidden small:flex flex-col sticky top-48 py-0 max-w-[300px] w-full gap-y-6">
          <LazyProductInfo product={product} />
          <LazyProductTabs product={product} />
        </div>

        {/* Галерея + мобила */}
        <div className="block w-full relative">
          <ImageGallery images={product?.images || []} preloadFirst preloadCount={2} />

          {/* Мобила: заголовок + описание + табы */}
          <div className="block small:hidden px-4 mt-6">
            {product.description && (
              <div className="border-t border-ui-border-base pt-6">
                <h3 className="text-base font-semibold mb-2">Description</h3>
                <p className="text-small-regular text-ui-fg-base">
                  {product.description}
                </p>
              </div>
            )}
            <LazyProductTabs product={product} />
          </div>
        </div>

        {/* Правая колонка десктоп */}
        <div className="hidden small:flex flex-col sticky top-48 py-0 max-w-[300px] w-full gap-y-12">
          <ProductOnboardingCta />
          <Suspense fallback={<ProductActions disabled={true} product={product} region={region} />}>
            <ProductActionsWrapper id={product.id} region={region} />
          </Suspense>
        </div>

        {/* Мобила AddToCart кнопка */}
        <div className="block small:hidden px-4 mt-6">
          <Suspense fallback={<ProductActions disabled={true} product={product} region={region} />}>
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

export default ProductTemplate;
