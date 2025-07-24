"use client"

import { PricedProduct } from "@medusajs/medusa/dist/types/pricing"
import { useState } from "react"
import Image from "next/image"
import Zoom from "react-medium-image-zoom"
import "react-medium-image-zoom/dist/styles.css"

type ImageGalleryProps = {
  images: PricedProduct["images"]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState(0)

  if (!images || images.length === 0) return null

  return (
    <div className="flex flex-col items-start gap-y-4">
      {/* Главное изображение с Zoom */}
      <div className="w-full aspect-[3/4] relative bg-white">
        <Zoom>
          <Image
            src={images[selectedImage].url}
            alt={`Product image ${selectedImage + 1}`}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        </Zoom>
      </div>

      {/* Миниатюры */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 w-full">
        {images.map((image, index) => (
          <button
            key={image.id}
            onClick={() => setSelectedImage(index)}
            className={`relative aspect-square border ${
              index === selectedImage ? "border-gray-900" : "border-transparent"
            }`}
          >
            <Image
              src={image.url}
              alt={`Thumbnail ${index + 1}`}
              fill
              sizes="(max-width: 768px) 33vw, 12vw"
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export default ImageGallery
