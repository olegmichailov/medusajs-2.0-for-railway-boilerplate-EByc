"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  if (!images || images.length === 0) return null

  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        {images.map((image, index) => {
          const isPriority = index < 2 // ← Грузим сразу 2 картинки, не одну
          return (
            <Container
              key={image.id || index}
              className="relative w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
              style={{ aspectRatio: "29 / 34" }} // Фиксированный аспект, без tailwind
            >
              <Image
                src={image.url}
                alt={`Product image ${index + 1}`}
                width={580}
                height={680}
                priority={isPriority}
                loading={isPriority ? "eager" : "lazy"}
                sizes="(max-width: 768px) 100vw, (min-width: 769px) 580px"
                style={{ objectFit: "cover" }}
              />
            </Container>
          )
        })}
      </div>
    </div>
  )
}

export default ImageGallery
