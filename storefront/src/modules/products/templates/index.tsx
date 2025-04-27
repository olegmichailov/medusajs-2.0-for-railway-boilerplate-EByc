// storefront/src/modules/products/templates/index.tsx

"use client"

import React, { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import ProductActionsWrapper from "./product-actions-wrapper"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import Accordion from "@modules/products/components/product-tabs/accordion"

// Ленивая загрузка компонентов
const LazyProductInfo = ({ product }: { product: HttpTypes.StoreProduct }) => (
  <Suspense fallback={<div className="h-10">Loading product info...</div>}>
    <ProductInfo product={product} />
  </Suspense>
)

const LazyProductTabs = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const tabs = [
    {
      label: "Product Information",
      content: (
        <div className="text-small-regular py-8">
          <div className="grid grid-cols-2 gap-x-8">
            <div className="flex flex-col gap-y-4">
              <div>
                <span className="font-semibold">Material</span>
                <p>{product.material || "-"}</p>
              </div>
              <div>
                <span className="font-semibold">Country of origin</span>
                <p>{product.origin_country || "-"}</p>
              </div>
              <div>
                <span className="font-semibold">Type</span>
                <p>{product.type?.value || "-"}</p>
              </div>
            </div>
            <div className="flex flex-col gap-y-4">
              <div>
                <span className="font-semibold">Weight</span>
                <p>{product.weight ? `${product.weight} g` : "-"}</p>
              </div>
              <div>
                <span className="font-semibold">Dimensions</span>
                <p>
                  {product.length && product.width && product.height
                    ? `${product.length}L x ${product.width}W x ${product.height}H`
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      label: "Shipping & Returns",
      content: (
        <div className="text-small-regular py-8">
          <p>Fast delivery: 3–5 days to your home or pickup point.</p>
          <p>Simple exchanges if the fit is not right.</p>
          <p>Easy returns with full refunds.</p>
        </div>
      ),
    },
    {
      label: "Description",
      content: (
        <div className="text-small-regular py-8">
          <p>{product.description || "No description available."}</p>
        </div>
      ),
    },
  ]

  return (
    <Accordion type="multiple">
      {tabs.map((tab) => (
        <Accordion.Item
          key={tab.label}
          title={tab.label}
          headingSize="medium"
          value={tab.label}
        >
          {tab.content}
        </Accordion.Item>
      ))}
    </Accordion>
  )
}

// Основной шаблон продукта
const ProductTemplate: React.FC<{ product: HttpTypes.StoreProduct; region: HttpTypes.StoreRegion; countryCode: string }> = ({
  product,
  region,
  countryCode,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  return (
    <>
      <div className="content-container flex flex-col small:flex-row small:items-start py-6 relative" data-testid="product-container">
        {/* Карточка товара */}
        <div className="block w-full relative">
          <ImageGallery
            images={product.images || []}
            preloadFirst
            preloadCount={2}
          />
        </div>

        {/* Описание и характеристики */}
        <div className="flex flex-col w-full py-8 gap-y-6">
          <LazyProductTabs product={product} />
        </div>

        {/* Правая колонка — покупка */}
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-12">
          <ProductOnboardingCta />
          <Suspense fallback={<ProductActions disabled={true} product={product} region={region} />}>
            <ProductActionsWrapper id={product.id} region={region} />
          </Suspense>
        </div>
      </div>

      {/* Рекомендуемые товары */}
      <div className="content-container my-16 small:my-32" data-testid="related-products-container">
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
