import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { useKeenSlider } from "keen-slider/react"
import "keen-slider/keen-slider.min.css"

import { useEffect, useState } from "react"

// Mobile-only ImageGallery
const ImageGallery = ({ images }: { images: HttpTypes.StoreProductImage[] }) => {
  const [isMobile, setIsMobile] = useState(false)

  const [sliderRef] = useKeenSlider({
    loop: true,
  })

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  if (!images.length) return null

  return (
    <div className="w-full">
      {isMobile ? (
        <div ref={sliderRef} className="keen-slider">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="keen-slider__slide relative aspect-[29/34] overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
              {!!image.url && (
                <Image
                  src={image.url}
                  alt={`Product image ${index + 1}`}
                  fill
                  priority={index === 0}
                  loading={index === 0 ? "eager" : "lazy"}
                  sizes="100vw"
                  style={{ objectFit: "cover" }}
                  unoptimized={false}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
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
