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
          const isPriority = index === 0
          return (
            <Container
              key={image.id || index}
              className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
              <Image
                src={image.url}
                alt={`Product image ${index + 1}`}
                fill
                priority={isPriority}
                loading={isPriority ? "eager" : "lazy"}
                sizes="(max-width: 576px) 100vw, (max-width: 768px) 80vw, 1024px"
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
