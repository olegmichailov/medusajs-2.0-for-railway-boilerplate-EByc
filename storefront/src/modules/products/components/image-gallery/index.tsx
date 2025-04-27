// src/modules/products/components/image-gallery/index.tsx

"use client"

import { useKeenSlider } from "keen-slider/react"
import "keen-slider/keen-slider.min.css"
import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { useState, useEffect } from "react"

interface ImageGalleryProps {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [isMobile, setIsMobile] = useState(false)
  const [sliderRef] = useKeenSlider<HTMLDivElement>({
    loop: false,
  })

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <div className="flex flex-col items-center w-full">
      {isMobile ? (
        <>
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
          <div className="flex justify-center gap-2 mt-4">
            {images.map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 bg-gray-400 rounded-full opacity-50"
              ></div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col flex-1 small:mx-16 gap-y-4 w-full">
          {images.map((image, index) => (
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
                  priority={index === 0}
                  loading={index === 0 ? "eager" : "lazy"}
                  sizes="(max-width: 576px) 100vw, (max-width: 768px) 60vw, 800px"
                  style={{ objectFit: "cover" }}
                  unoptimized={false}
                />
              )}
            </Container>
          ))}
        </div>
      )}
    </div>
  )
}

export default ImageGallery
