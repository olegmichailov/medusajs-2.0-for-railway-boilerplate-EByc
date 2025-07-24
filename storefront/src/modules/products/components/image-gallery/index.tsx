// src/modules/products/components/image-gallery/index.tsx

"use client"

import { PricedProduct } from "@medusajs/medusa/dist/types/pricing"
import { useState } from "react"
import Image from "next/image"
import Thumbnail from "../thumbnail"

type ImageGalleryProps = {
  images: PricedProduct["images"]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState(0)

  if (!images || images.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {/* Главное изображение */}
      <div className="relative w-full aspect-[3/4] bg-white">
        <Image
          src={images[selectedImage].url}
          alt={`Product image ${selectedImage + 1}`}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-opacity duration-300"
          priority
        />
      </div>

      {/* Миниатюры в сетке */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {images.map((image, index) => (
          <button
            key={image.id}
            onClick={() => setSelectedImage(index)}
            className={`relative aspect-square w-full border ${
              index === selectedImage ? "border-gray-900" : "border-transparent"
            }`}
          >
            <Image
              src={image.url}
              alt={`Thumbnail ${index + 1}`}
              fill
              sizes="(max-width: 768px) 50vw, 12vw"
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export default ImageGallery
