// src/modules/products/components/image-gallery/index.tsx

'use client'

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { useKeenSlider } from "keen-slider/react"
import "keen-slider/keen-slider.min.css"
import { useEffect, useState } from "react"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkScreen()
    window.addEventListener("resize", checkScreen)
    return () => window.removeEventListener("resize", checkScreen)
  }, [])

  const [sliderRef] = useKeenSlider<HTMLDivElement>({
    loop: false,
  })

  if (isMobile) {
    // Мобильная версия — Карусель
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
                sizes="(max-width: 768px) 100vw"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-2 mt-4">
          {images.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 bg-gray-400 rounded-full opacity-50"
            />
          ))}
        </div>
      </div>
    )
  }

  // Десктопная версия — старая лента
  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        {images.map((image, index) => {
          const isPriority = index === 0
          return (
            <Container
              key={image.id}
              className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
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
                />
              )}
            </Container>
          )
        })}
      </div>
    </div>
  )
}

export default ImageGallery
