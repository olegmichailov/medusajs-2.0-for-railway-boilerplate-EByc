"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const BASE_URL = "https://gmorkl.de" // 👈 Укажи свою продакшн-URL, если другая

const ImageGallery = ({ images }: ImageGalleryProps) => {
  if (!images || images.length === 0) return null

  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        {images.map((image, index) => {
          const isPriority = index === 0
          const imageUrl = image.url?.startsWith("http")
            ? image.url
            : `${BASE_URL}${image.url}`

          return (
            <Container
              key={image.id || index}
              className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
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
            </Container>
          )
        })}
      </div>
    </div>
  )
}

export default ImageGallery
