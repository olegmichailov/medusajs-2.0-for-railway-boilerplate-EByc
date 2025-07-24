"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const BASE_URL = "https://gmorkl.de"

const ImageGallery = ({ images }: ImageGalleryProps) => {
  if (!images || images.length === 0) return null

  console.log("📷 images from props:", images)

  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        {images.map((image, index) => {
          const isPriority = index === 0

          const rawUrl = image?.url
          const imageUrl = rawUrl?.startsWith("http")
            ? rawUrl
            : rawUrl
            ? `${BASE_URL}${rawUrl}`
            : null

          console.log(`🖼 image ${index}:`, {
            rawUrl,
            finalUrl: imageUrl,
            id: image.id,
          })

          return (
            <Container
              key={image.id || index}
              className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={`Product image ${index + 1}`}
                  fill
                  unoptimized
                  priority={isPriority}
                  loading={isPriority ? "eager" : "lazy"}
                  sizes="(max-width: 576px) 100vw, (max-width: 768px) 80vw, 1024px"
                  style={{
                    objectFit: "cover",
                    transition: "opacity 0.5s ease",
                  }}
                  className="opacity-0 animate-fadeIn absolute inset-0 object-cover object-center"
                />
              ) : (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                  ⚠️ No image URL
                </div>
              )}
            </Container>
          )
        })}
      </div>
    </div>
  )
}

export default ImageGallery
