"use client"

import React, { Suspense, useEffect, useMemo, useState } from "react"

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

  const [options, setOptions] = useState<Record<string, string>>({})

  useEffect(() => {
    const initial = {} as Record<string, string>
    for (const option of product.options || []) {
      if (option.values.length) {
        initial[option.title || ""] = option.values[0].value
      }
    }
    setOptions(initial)
  }, [product])

  const variant = useMemo(() => {
    return product.variants?.find((v) =>
      v.options.every((opt) => {
        const optionTitle = product.options?.find(o => o.id === opt.option_id)?.title
        return optionTitle && options[optionTitle] === opt.value
      })
    )
  }, [options, product])

  const handleAddToCart = () => {
    console.log("Add to cart clicked", variant?.id)
    // Здесь должна быть реальная логика добавления в корзину
  }

  const updateOptions = (title: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [title]: value,
    }))
  }

  const inStock = variant?.inventory_quantity && variant.inventory_quantity > 0

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

      {/* Mobile Actions: Чёрная кнопка Add to Cart на мобилке */}
      <div className="block small:hidden">
        <MobileActions
          product={product}
          variant={variant}
          options={options}
          updateOptions={updateOptions}
          show={true}
          optionsDisabled={false}
          handleAddToCart={handleAddToCart}
          isAdding={false}
          inStock={inStock}
        />
      </div>

      {/* Похожие товары */}
      <div className="content-container my-16 small:my-32" data-testid="related-products-container">
        <Suspense fallback={<SkeletonRelatedProducts />}
        >
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
