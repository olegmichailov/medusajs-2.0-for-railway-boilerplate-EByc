"use client"

import { useState } from "react"
import Image from "next/image"
import Zoom from "react-medium-image-zoom"
import "react-medium-image-zoom/dist/styles.css"

type ImageType = {
  url: string
}

type ImageGalleryProps = {
  images: ImageType[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  if (!images || images.length === 0) {
    return (
      <div className="w-full h-[500px] bg-gray-100 flex items-center justify-center">
        <span className="text-gray-500 text-sm">No images available</span>
      </div>
    )
  }

  const selectedImage = images[selectedImageIndex]

  return (
    <div className="flex flex-col items-start gap-4">
      <Zoom>
        <div className="relative w-full aspect-square border rounded overflow-hidden">
          <Image
            src={selectedImage.url}
            alt="Product image"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            unoptimized
          />
        </div>
      </Zoom>

      <div className="flex gap-2 overflow-x-auto max-w-full">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => setSelectedImageIndex(i)}
            className={`relative w-20 h-20 border rounded overflow-hidden ${
              i === selectedImageIndex ? "border-black" : "border-gray-200"
            }`}
          >
            <Image
              src={img.url}
              alt={`Thumbnail ${i + 1}`}
              fill
              className="object-cover"
              unoptimized
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export default ImageGallery
