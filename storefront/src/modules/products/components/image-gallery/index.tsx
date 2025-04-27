// src/modules/products/components/image-gallery/index.tsx

"use client"

import { useKeenSlider } from "keen-slider/react"
import "keen-slider/keen-slider.min.css"
import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { useState } from "react"

interface ImageGalleryProps {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>({
    loop: false,
    slideChanged(slider) {
      setCurrentSlide(slider.track.details.rel)
    },
    breakpoints: {
      "(min-width: 640px)": {
        slides: { perView: 1, spacing: 0 },
      },
    },
  })

  return (
    <div className="flex flex-col items-center w-full">
      <div ref={sliderRef} className="keen-slider w-full">
        {images.map((image, i) => (
          <div
            key={image.id}
            className="keen-slider__slide aspect-[29/34] relative bg-ui-bg-subtle"
          >
            <Image
              src={image.url}
              alt={`Product image ${i + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {images.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i === currentSlide ? "bg-gray-800 opacity-80" : "bg-gray-400 opacity-50"
              }`}
            ></div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ImageGallery
