"use client"

import React, { Suspense, useState } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import MobileActions from "@modules/products/components/product-actions/mobile-actions"
import { notFound } from "next/navigation"
import ProductActionsWrapper from "./product-actions-wrapper"
import { HttpTypes } from "@medusajs/types"
import { getProductPrice } from "@lib/util/get-product-price"

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

  // Управление опциями товара для MobileActions
  const [options, setOptions] = useState<Record<string, string | undefined>>(() => {
    const initialOptions: Record<string, string | undefined> = {}
    for (const option of product.options || []) {
      if (option.values?.length) {
        initialOptions[option.title || ""] = option.values[0].value
      }
    }
    return initialOptions
  })

  const updateOptions = (title: string, value: string) => {
    setOptions((prev) => ({ ...prev, [title]: value }))
  }

  const variants = product.variants || []

  const selectedVariant = variants.find((variant) => {
    return variant.options?.every((option) => {
      const value = options[option.option_id]
      return value === option.value
    })
  })

  const inStock = (selectedVariant?.inventory_quantity || 0) > 0

  const handleAddToCart = () => {
    if (!selectedVariant) {
      return
    }
    console.log(`Товар с id варианта ${selectedVariant.id} добавлен в корзину`)
    // Здесь должна быть реальная функция добавления в корзину
  }

  return (
    <>
      <div
        className="content-container flex flex-col small:flex-row small:items-start py-6 relative"
        data-testid="product-container"
      >
        {/* Левая колонка на десктопе */}
        <div className="hidden small:flex flex-col sticky top-48 py-0 max-w-[300px] w-full gap-y-6">
          <LazyProductInfo product={product} />
          <LazyProductTabs product={product} />
        </div>

        {/* Центр — Галерея */}
        <div className="block w-full relative">
          {/* Название товара на мобилке */}
          <div className="block small:hidden mb-4">
            <h1 className="text-2xl font-medium">{product.title}</h1>
          </div>

          {/* Галерея картинок */}
          <ImageGallery images={product?.images || []} preloadFirst preloadCount={2} />

          {/* Описание + Табы на мобилке */}
          <div className="block small:hidden mt-6">
            {product.description && (
              <div className="border-t border-ui-border-base pt-6">
                <p className="text-small-regular text-ui-fg-base">{product.description}</p>
              </div>
            )}
            <LazyProductTabs product={product} />

            {/* Чёрная Кнопка Add to Cart */}
            <div className="mt-6">
              <MobileActions
                product={product}
                options={options}
                updateOptions={updateOptions}
                variant={selectedVariant}
                handleAddToCart={handleAddToCart}
                inStock={inStock}
                isAdding={false}
                show={true}
                optionsDisabled={false}
              />
            </div>
          </div>
        </div>

        {/* Правая колонка на десктопе */}
        <div className="hidden small:flex flex-col sticky top-48 py-0 max-w-[300px] w-full gap-y-12">
          <ProductOnboardingCta />
          <Suspense fallback={<ProductActions disabled={true} product={product} region={region} />}>
            <ProductActionsWrapper id={product.id} region={region} />
          </Suspense>
        </div>
      </div>

      {/* Похожие товары */}
      <div className="content-container my-16 small:my-32" data-testid="related-products-container">
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
