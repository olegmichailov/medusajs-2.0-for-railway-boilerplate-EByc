"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { useKeenSlider } from "keen-slider/react"
import "keen-slider/keen-slider.min.css"
import { useState } from "react"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [currentSlide, setCurrentSlide] = useState(0)

  const [sliderRef] = useKeenSlider({
    loop: true,
    slideChanged(slider) {
      setCurrentSlide(slider.track.details.rel)
    },
    mode: "snap",
    slides: {
      perView: 1,
      spacing: 8,
    },
    breakpoints: {
      "(min-width: 640px)": {
        slides: {
          perView: 1,
          spacing: 12,
        },
      },
    },
  })

  return (
    <div className="relative w-full">
      <div ref={sliderRef} className="keen-slider">
        {images.map((image, index) => {
          const isPriority = index === 0
          return (
            <Container
              key={image.id}
              className="keen-slider__slide relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
              {!!image.url && (
                <Image
                  src={image.url}
                  alt={`Product image ${index + 1}`}
                  fill
                  priority={isPriority}
                  loading={isPriority ? "eager" : "lazy"}
                  sizes="(max-width: 576px) 100vw, (max-width: 768px) 60vw, 800px"
                  style={{ objectFit: "cover" }}
                  unoptimized={false}
                />
              )}
            </Container>
          )
        })}
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
        {images.map((_, idx) => (
          <div
            key={idx}
            className={`h-2 w-2 rounded-full ${
              currentSlide === idx ? "bg-gray-800" : "bg-gray-400 opacity-50"
            }`}
          ></div>
        ))}
      </div>
    </div>
  )
}

export default ImageGallery
